import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_HEADERS = {
  "user-agent":
    "follow-amazon-daily/0.1 (+https://github.com/lanfuli/follow-amazon-daily)",
  accept:
    "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
};

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

export function repoPath(...parts) {
  return resolve(process.cwd(), ...parts);
}

export function todayInTimeZone(timeZone = "America/Los_Angeles", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function hashId(...parts) {
  return createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);
}

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function truncate(value = "", limit = 360) {
  const text = normalizeWhitespace(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

export function decodeEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    }
    return named[lower] ?? match;
  });
}

export function stripCdata(value = "") {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripTags(value = "") {
  return decodeEntities(stripCdata(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function firstXmlTag(block, names) {
  for (const name of names) {
    const re = new RegExp(
      `<${escapeRegExp(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(name)}>`,
      "i"
    );
    const match = block.match(re);
    if (match?.[1]) return stripTags(match[1]);
  }
  return "";
}

export function firstAtomHref(block) {
  const match = block.match(/<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? decodeEntities(match[1]) : "";
}

export function htmlTitle(html) {
  const og = html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (og?.[1]) return stripTags(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? stripTags(title[1]) : "";
}

export function absoluteUrl(baseUrl, maybeUrl) {
  try {
    return new URL(decodeEntities(maybeUrl), baseUrl).toString();
  } catch {
    return "";
  }
}

export async function fetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    return {
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

export function makeItem(source, raw) {
  const url = raw.url || source.url;
  const title = truncate(raw.title || source.name, 180);
  const publishedAt = raw.publishedAt || new Date().toISOString();
  const access = raw.access || source.access || "public";
  const excerptLimit =
    source.sourceReliability === "community" || access === "community_signal" ? 220 : 420;
  return {
    id: `${source.id}-${hashId(url, title)}`,
    source: source.name,
    sourceType: source.sourceType,
    category: source.category,
    title,
    url,
    publishedAt,
    excerpt: truncate(raw.excerpt || title, excerptLimit),
    sellerImpact: truncate(raw.sellerImpact || defaultSellerImpact(source), 260),
    tags: Array.from(new Set([...(source.tags ?? []), ...(raw.tags ?? [])])).slice(0, 8),
    access,
    sourceReliability: source.sourceReliability
  };
}

export function defaultSellerImpact(source) {
  if (source.sourceReliability === "official") {
    return "Check whether this changes policy, API, advertising, logistics, or marketplace operations.";
  }
  if (source.sourceReliability === "community") {
    return "Use this as a seller pain signal; confirm with official sources before acting.";
  }
  if (source.sourceReliability === "media") {
    return "Review for tactical playbooks that may apply to your catalog, ads, or operations.";
  }
  return "Evaluate whether this changes seller operations, ads, positioning, or growth priorities.";
}

export function dedupeItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const item of items) {
    const urlKey = item.url.replace(/[?#].*$/, "").toLowerCase();
    const titleKey = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    out.push(item);
  }
  return out;
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    const at = Date.parse(a.publishedAt) || 0;
    const bt = Date.parse(b.publishedAt) || 0;
    return bt - at;
  });
}
