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

// Pulls the readable text out of an HTML document so the agent has real
// material to summarize instead of just a <title>. Chrome (nav/header/footer/
// aside) is removed first so index/doc pages don't bleed their menus into the
// digest.
export function extractReadableText(html = "") {
  const dechromed = String(html)
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ");
  const region =
    dechromed.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ||
    dechromed.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ||
    dechromed.match(/<body\b[\s\S]*?<\/body>/i)?.[0] ||
    dechromed;
  return normalizeWhitespace(stripTags(region));
}

// Structured-data-first extraction. JS/Next.js/Webflow pages render almost
// nothing as plain HTML but embed the real content as JSON. Try those payloads
// before falling back to extractReadableText. Returns { title, publishedAt,
// body } with empty strings when nothing usable is found.
export function extractStructuredData(html = "") {
  const out = { title: "", publishedAt: "", body: "" };
  const collectText = (value, acc) => {
    if (!value) return;
    if (typeof value === "string") {
      const t = value.trim();
      if (t.length > 1) acc.push(t);
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) collectText(v, acc);
      return;
    }
    if (typeof value === "object") {
      // Portable-text / block content: { _type:"block", children:[{text}] }
      if (Array.isArray(value.children)) {
        const line = value.children.map((c) => c?.text || "").join("");
        if (line.trim()) acc.push(line.trim());
      }
      for (const k of ["text", "body", "content", "description", "summary", "abstract"]) {
        if (value[k]) collectText(value[k], acc);
      }
    }
  };

  // 1. JSON-LD Article / BlogPosting / NewsArticle / TechArticle
  const ldRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(stripCdata(m[1]).trim());
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        const type = String(node?.["@type"] || "");
        if (/Article|BlogPosting|NewsArticle|TechArticle|Report/i.test(type)) {
          out.title = out.title || node.headline || node.name || "";
          out.publishedAt = out.publishedAt || node.datePublished || node.dateModified || "";
          const parts = [];
          collectText(node.articleBody || node.description || node.abstract, parts);
          if (parts.length) out.body = out.body || parts.join("\n\n");
        }
      }
    } catch {
      // not valid JSON-LD, keep scanning
    }
  }

  // 2. Next.js __NEXT_DATA__ / Nuxt __NUXT__ / generic application/json blobs
  if (!out.body) {
    const jsonScripts = [
      ...html.matchAll(
        /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi
      ),
      ...html.matchAll(
        /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
      )
    ];
    for (const s of jsonScripts) {
      try {
        const data = JSON.parse(stripCdata(s[1]).trim());
        const props =
          data?.props?.pageProps ?? data?.pageProps ?? data?.data ?? data;
        const post =
          props?.post ?? props?.article ?? props?.entry ?? props;
        if (post && typeof post === "object") {
          out.title =
            out.title || post.title || post.headline || post.name || "";
          out.publishedAt =
            out.publishedAt ||
            post.publishedOn ||
            post.publishedAt ||
            post.date ||
            "";
          const parts = [];
          collectText(post.body ?? post.content ?? post.description, parts);
          if (parts.length) {
            out.body = parts.join("\n\n");
            break;
          }
        }
      } catch {
        // not parseable, try next
      }
    }
  }

  return out;
}

// Lowercase, strip punctuation, collapse whitespace. Used so the same item
// with a slightly different title across runs still dedupes against state.
export function normalizeTitle(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeItem(source, raw) {
  const url = raw.url || source.url;
  const title = truncate(raw.title || source.name, 180);
  const publishedAt = raw.publishedAt || new Date().toISOString();
  const access = raw.access || source.access || "public";
  const excerptLimit =
    source.sourceReliability === "community" || access === "community_signal" ? 220 : 420;
  // Only public pages carry a scraped body. Community and subscriber-gated
  // sources stay metadata-only in the public feed; their full text is handled
  // ephemerally via private auth signals and is never persisted.
  const body = access === "public" && raw.body ? truncate(raw.body, 1800) : "";
  return {
    id: `${source.id}-${hashId(url, title)}`,
    source: source.name,
    sourceType: source.sourceType,
    category: source.category,
    title,
    url,
    publishedAt,
    excerpt: truncate(raw.excerpt || title, excerptLimit),
    body,
    tags: Array.from(new Set([...(source.tags ?? []), ...(raw.tags ?? [])])).slice(0, 8),
    access,
    sourceReliability: source.sourceReliability,
    ...(raw.thin ? { thin: true } : {})
  };
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
