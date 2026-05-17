import {
  absoluteUrl,
  extractReadableText,
  fetchText,
  firstAtomHref,
  firstXmlTag,
  htmlTitle,
  makeItem,
  stripTags,
  truncate
} from "./common.js";

export async function fetchSource(source, options = {}) {
  try {
    if (source.type === "rss") return await fetchRss(source, options);
    if (source.type === "youtube_rss") return await fetchYoutubeRss(source, options);
    if (source.type === "wearesellers") return await fetchWeAreSellers(source, options);
    if (source.type === "beehiiv_archive") return await fetchBeehiivArchive(source, options);
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
  const response = await fetchText(source.url, { timeoutMs: options.timeoutMs });
  const items = parseXmlFeed(response.text, source, options.limit ?? 8);
  return { items, privateItems: [], errors: [] };
}

export async function fetchYoutubeRss(source, options = {}) {
  let feedUrl = source.url;
  if (!feedUrl.includes("/feeds/videos.xml") && source.handleUrl) {
    feedUrl = await resolveYoutubeFeed(source.handleUrl, options);
  }
  const response = await fetchText(feedUrl, { timeoutMs: options.timeoutMs });
  const items = parseXmlFeed(response.text, { ...source, url: feedUrl }, options.limit ?? 8);
  return { items, privateItems: [], errors: [] };
}

export async function resolveYoutubeFeed(handleUrl, options = {}) {
  const response = await fetchText(handleUrl, { timeoutMs: options.timeoutMs });
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
    const response = await fetchText(source.rssUrl, { timeoutMs: options.timeoutMs });
    items = parseXmlFeed(response.text, source, options.limit ?? 8);
  } catch (error) {
    errors.push({ source: source.name, url: source.rssUrl, message: `RSS failed: ${error.message}` });
  }

  if (items.length === 0) {
    try {
      const response = await fetchText(source.url, { timeoutMs: options.timeoutMs });
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
    headers: { "user-agent": browserUserAgent() }
  });
  const items = parseBeehiivArchive(response.text, source, response.finalUrl, options.limit ?? 8);
  const privateItems = await fetchPrivateArticleSignals(source, items, options, {
    cookie: process.env[source.authEnv],
    maxPrivateItems: options.maxPrivateItems ?? 3,
    label: "authenticated BDS article"
  });
  return { items, privateItems, errors: [] };
}

export async function fetchGenericHtml(source, options = {}) {
  const response = await fetchText(source.url, {
    timeoutMs: options.timeoutMs,
    headers: source.url.includes("amz123.com") ? { "user-agent": browserUserAgent() } : undefined
  });
  const title = htmlTitle(response.text) || source.name;
  const excerpt = extractMetaDescription(response.text) || title;
  const body = extractReadableText(response.text);
  return {
    items: [
      makeItem(source, {
        title,
        url: response.finalUrl,
        publishedAt: new Date().toISOString(),
        excerpt,
        body
      })
    ],
    privateItems: [],
    errors: []
  };
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

export function parseWeAreSellersHtml(html, source, baseUrl, limit = 8) {
  const items = [];
  const seen = new Set();
  const linkRe = /<a\b[^>]*href=["']([^"']*\/question\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkRe)) {
    const url = absoluteUrl(baseUrl, match[1]);
    const title = stripTags(match[2]);
    if (!url || !title || title.length < 4 || seen.has(url)) continue;
    seen.add(url);
    items.push(
      makeItem(source, {
        title,
        url,
        excerpt: "Community thread metadata from WeAreSellers; use as a pain-signal, not policy authority.",
        access: "community_signal"
      })
    );
    if (items.length >= limit) break;
  }
  return items;
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
          "user-agent": browserUserAgent(),
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

function browserUserAgent() {
  return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
}
