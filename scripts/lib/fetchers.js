import {
  absoluteUrl,
  extractReadableText,
  extractStructuredData,
  fetchText,
  firstAtomHref,
  firstXmlTag,
  htmlTitle,
  makeItem,
  stripTags,
  truncate
} from "./common.js";

// Real Chrome UA by default. Substack and other RSS/HTML hosts return 403 to
// non-browser user agents from cloud (GitHub Actions) IPs.
function browserUserAgent() {
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
}

const UA_HEADERS = { "user-agent": browserUserAgent() };

// Visible (non-whitespace) character count — used by the thin-content guard.
function meaningfulLen(value) {
  return String(value || "").replace(/\s+/g, "").length;
}

export async function fetchSource(source, options = {}) {
  try {
    if (source.type === "rss") return await fetchRss(source, options);
    if (source.type === "youtube_rss") return await fetchYoutubeRss(source, options);
    if (source.type === "wearesellers") return await fetchWeAreSellers(source, options);
    if (source.type === "beehiiv_archive") return await fetchBeehiivArchive(source, options);
    if (source.type === "linklist") return await fetchLinkList(source, options);
    if (source.type === "generic_html") return await fetchGenericHtml(source, options);
    return {
      items: [],
      privateItems: [],
      errors: [{ source: source.name, url: source.url, message: `Unknown source type: ${source.type}` }]
    };
  } catch (error) {
    return {
      items: [],
      privateItems: [],
      errors: [{ source: source.name, url: source.url, message: error.message }]
    };
  }
}

export async function fetchRss(source, options = {}) {
  const response = await fetchText(source.url, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
  const items = parseXmlFeed(response.text, source, options.limit ?? 8);
  return { items, privateItems: [], errors: [] };
}

export async function fetchYoutubeRss(source, options = {}) {
  let feedUrl = source.url;
  if (!feedUrl.includes("/feeds/videos.xml") && source.handleUrl) {
    feedUrl = await resolveYoutubeFeed(source.handleUrl, options);
  }
  const response = await fetchText(feedUrl, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
  const items = parseXmlFeed(response.text, { ...source, url: feedUrl }, options.limit ?? 8);
  return { items, privateItems: [], errors: [] };
}

export async function resolveYoutubeFeed(handleUrl, options = {}) {
  const response = await fetchText(handleUrl, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
  const match = response.text.match(
    /<link\b[^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/i
  );
  if (!match?.[1]) throw new Error(`No YouTube RSS alternate link found at ${handleUrl}`);
  return match[1];
}

export async function fetchWeAreSellers(source, options = {}) {
  const errors = [];
  let items = [];
  try {
    const response = await fetchText(source.rssUrl, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
    items = parseXmlFeed(response.text, source, options.limit ?? 8);
  } catch (error) {
    errors.push({ source: source.name, url: source.rssUrl, message: `RSS failed: ${error.message}` });
  }

  if (items.length === 0) {
    try {
      const response = await fetchText(source.url, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
      items = parseWeAreSellersHtml(response.text, source, response.finalUrl, options.limit ?? 8);
    } catch (error) {
      errors.push({ source: source.name, url: source.url, message: `HTML fallback failed: ${error.message}` });
    }
  }

  const privateItems = await fetchPrivateArticleSignals(source, items, options, {
    cookie: process.env[source.authEnv],
    maxPrivateItems: options.maxPrivateItems ?? 3,
    label: "authenticated WeAreSellers thread"
  });
  return { items, privateItems, errors };
}

export async function fetchBeehiivArchive(source, options = {}) {
  const response = await fetchText(source.url, {
    timeoutMs: options.timeoutMs,
    headers: UA_HEADERS
  });
  const items = parseBeehiivArchive(response.text, source, response.finalUrl, options.limit ?? 8);
  const privateItems = await fetchPrivateArticleSignals(source, items, options, {
    cookie: process.env[source.authEnv],
    maxPrivateItems: options.maxPrivateItems ?? 3,
    label: "authenticated BDS article"
  });
  return { items, privateItems, errors: [] };
}

// Generic HTML pages: structured-data first (JSON-LD / __NEXT_DATA__), then a
// nav-stripped readable-text fallback. If the result is still thin and the
// source has an altUrl, retry there once. A still-thin item is kept but flagged
// so the agent reports it honestly instead of inventing a "go look yourself"
// summary.
export async function fetchGenericHtml(source, options = {}) {
  const errors = [];

  const tryUrl = async (u) => {
    const response = await fetchText(u, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
    const sd = extractStructuredData(response.text);
    const title = sd.title || htmlTitle(response.text) || source.name;
    const excerpt = extractMetaDescription(response.text) || sd.title || title;
    const body = sd.body || extractReadableText(response.text);
    const publishedAt =
      sd.publishedAt && !Number.isNaN(Date.parse(sd.publishedAt))
        ? new Date(sd.publishedAt).toISOString()
        : null;
    return { finalUrl: response.finalUrl, title, excerpt, body, publishedAt };
  };

  let r = null;
  try {
    r = await tryUrl(source.url);
  } catch (error) {
    errors.push({ source: source.name, url: source.url, message: error.message });
  }

  let thin = !r || meaningfulLen(r.body) + meaningfulLen(r.excerpt) < 120;

  if (thin && source.altUrl) {
    try {
      const alt = await tryUrl(source.altUrl);
      if (meaningfulLen(alt.body) + meaningfulLen(alt.excerpt) >= 120) {
        r = alt;
        thin = false;
      } else if (!r) {
        r = alt;
      }
    } catch (error) {
      errors.push({ source: source.name, url: source.altUrl, message: `altUrl failed: ${error.message}` });
    }
  }

  if (!r) {
    return {
      items: [],
      privateItems: [],
      errors: errors.length
        ? errors
        : [{ source: source.name, url: source.url, message: "no content" }]
    };
  }

  if (thin) {
    errors.push({
      source: source.name,
      url: r.finalUrl,
      message: "thin content: source returned only an index/JS shell; no substantive body captured"
    });
  }

  return {
    items: [
      makeItem(source, {
        title: r.title,
        url: r.finalUrl,
        // Real date when structured data provided one (enables lookback);
        // undated pages fall back to now() in makeItem and are lookback-exempt.
        publishedAt: r.publishedAt || undefined,
        excerpt: r.excerpt,
        body: r.body,
        thin
      })
    ],
    privateItems: [],
    errors
  };
}

// Index/hub pages whose value is the list of article links (not the page text
// itself). Harvests anchors whose href matches source.linkPattern.
export async function fetchLinkList(source, options = {}) {
  const response = await fetchText(source.url, { timeoutMs: options.timeoutMs, headers: UA_HEADERS });
  const pattern = source.linkPattern || "/[a-zA-Z0-9_-]+";
  const linkRe = new RegExp(
    `<a\\b[^>]*href=["']([^"']*${pattern}[^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>`,
    "gi"
  );
  const items = parseLinkList(response.text, source, response.finalUrl, linkRe, options.limit ?? 8);
  const errors =
    items.length === 0
      ? [{ source: source.name, url: source.url, message: "linklist: no matching article links found" }]
      : [];
  return { items, privateItems: [], errors };
}

export function parseXmlFeed(xml, source, limit = 8) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomBlocks = blocks.length
    ? []
    : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  return [...blocks, ...atomBlocks].slice(0, limit).map((block) => {
    const linkText = firstXmlTag(block, ["link"]);
    const url = linkText || firstAtomHref(block) || firstXmlTag(block, ["guid"]);
    const title = firstXmlTag(block, ["title"]) || source.name;
    const publishedAt =
      firstXmlTag(block, ["pubDate", "published", "updated", "dc:date"]) || new Date().toISOString();
    const excerpt =
      firstXmlTag(block, ["itunes:summary", "media:description", "description", "summary"]) ||
      title;
    const body =
      firstXmlTag(block, ["content:encoded", "itunes:summary", "description", "summary", "media:description"]) ||
      "";
    return makeItem(source, {
      title,
      url,
      publishedAt,
      excerpt,
      body,
      access: source.access
    });
  });
}

// Generalized anchor-list parser. `linkRe` must capture href in group 1 and
// inner anchor text in group 2. Used by linklist sources and the WeAreSellers
// HTML fallback.
export function parseLinkList(html, source, baseUrl, linkRe, limit = 8, opts = {}) {
  const items = [];
  const seen = new Set();
  for (const match of html.matchAll(linkRe)) {
    const url = absoluteUrl(baseUrl, match[1]);
    const title = stripTags(match[2] || "");
    if (!url || !title || title.length < 4 || seen.has(url)) continue;
    seen.add(url);
    items.push(
      makeItem(source, {
        title,
        url,
        excerpt: opts.excerpt || title,
        access: source.access
      })
    );
    if (items.length >= limit) break;
  }
  return items;
}

export function parseWeAreSellersHtml(html, source, baseUrl, limit = 8) {
  const linkRe = /<a\b[^>]*href=["']([^"']*\/question\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  return parseLinkList(html, source, baseUrl, linkRe, limit, {
    excerpt: "Community thread metadata from WeAreSellers; use as a pain-signal, not policy authority."
  });
}

export function parseBeehiivArchive(html, source, baseUrl, limit = 8) {
  const cleanHtml = html.replace(/\\u002F/g, "/").replace(/\\"/g, "\"");
  const titleHints = [...cleanHtml.matchAll(/"web_title"\s*:\s*"([^"]+)"/gi)].map((match) =>
    stripTags(match[1])
  );
  const items = [];
  const seen = new Set();
  const linkRe = /(?:href=["']|["'])((?:https?:\/\/www\.billiondollarsellers\.com)?\/p\/[a-z0-9-]+)(?:["'])/gi;
  for (const match of cleanHtml.matchAll(linkRe)) {
    const url = absoluteUrl(baseUrl, match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = titleHints[items.length] || titleFromSlug(url);
    items.push(
      makeItem(source, {
        title,
        url,
        excerpt: "Public archive metadata from Billion Dollar Sellers; subscriber-only body is not persisted.",
        access: "partial_public"
      })
    );
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchPrivateArticleSignals(source, publicItems, options, auth) {
  if (!auth.cookie || options.publicOnly) return [];
  const privateItems = [];
  for (const item of publicItems.slice(0, auth.maxPrivateItems)) {
    try {
      const response = await fetchText(item.url, {
        timeoutMs: options.timeoutMs,
        headers: {
          ...UA_HEADERS,
          cookie: auth.cookie
        }
      });
      const text = extractReadableText(response.text);
      if (!text || text.length < 160) continue;
      privateItems.push({
        ...item,
        id: `${item.id}-auth`,
        access: "authenticated_ephemeral",
        excerpt: truncate(text, 420),
        sellerImpact: `${auth.label}: summarize this as a private, non-persisted insight; do not quote or store the full text.`
      });
    } catch {
      // Auth enrichment is best-effort and intentionally non-fatal.
    }
  }
  return privateItems;
}

function extractMetaDescription(html) {
  const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? stripTags(match[1]) : "";
}

function titleFromSlug(url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "Billion Dollar Sellers issue";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}
