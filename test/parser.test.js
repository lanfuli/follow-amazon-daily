import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFeishuPayload, chunkText } from "../scripts/deliver.js";
import {
  dedupeItems,
  extractReadableText,
  extractStructuredData,
  makeItem,
  normalizeTitle
} from "../scripts/lib/common.js";
import {
  parseBeehiivArchive,
  parseLinkList,
  parseWeAreSellersHtml,
  parseXmlFeed
} from "../scripts/lib/fetchers.js";
import { buildOutputs, filterByLookback } from "../scripts/prepare-digest.js";
import { filterUnseen, isSeen, markSeen } from "../scripts/lib/state.js";

const baseSource = {
  id: "fixture",
  name: "Fixture Source",
  sourceType: "industry",
  category: "Seller Ops",
  sourceReliability: "industry",
  access: "public",
  tags: ["fixture"],
  url: "https://example.com/"
};

test("parses RSS podcast items", async () => {
  const xml = await fixture("serious-sellers.xml");
  const items = parseXmlFeed(xml, {
    ...baseSource,
    name: "Serious Sellers Podcast",
    category: "Podcast / Video Playbooks",
    sourceReliability: "media"
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "#747 - 3 Sellers Share What Works Now");
  assert.equal(items[0].url, "https://helium10.podbean.com/e/ssp-747/");
  assert.match(items[0].excerpt, /TikTok Shop/);
});

test("parses YouTube atom feed links", async () => {
  const xml = await fixture("youtube.xml");
  const items = parseXmlFeed(xml, {
    ...baseSource,
    name: "My Amazon Guy",
    sourceType: "youtube",
    category: "Podcast / Video Playbooks",
    sourceReliability: "media"
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=abc123");
  assert.equal(items[0].title, "Amazon SEO Ranking Strategy");
});

test("parses WeAreSellers HTML fallback as community signal", async () => {
  const html = await fixture("wearesellers.html");
  const items = parseWeAreSellersHtml(html, {
    ...baseSource,
    name: "WeAreSellers",
    sourceType: "community",
    category: "Community Pain Signals",
    sourceReliability: "community",
    access: "community_signal"
  }, "https://www.wearesellers.com/");
  assert.equal(items.length, 2);
  assert.equal(items[0].access, "community_signal");
  assert.match(items[0].url, /question\/119759/);
});

test("parses Beehiiv archive links and title hints", async () => {
  const html = await fixture("bds-archive.html");
  const items = parseBeehiivArchive(html, {
    ...baseSource,
    name: "Billion Dollar Sellers",
    sourceType: "newsletter",
    category: "Newsletter / Analyst Signals",
    access: "partial_public"
  }, "https://www.billiondollarsellers.com/archive");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "BDSN: Amazon's Agentic Army Is Coming. You Ready?");
  assert.match(items[1].url, /bdsn-your-margin-is-my-opportunity/);
});

test("dedupes repeated URL or title", () => {
  const one = makeItem(baseSource, { title: "Same Title", url: "https://example.com/a?utm=1" });
  const two = makeItem(baseSource, { title: "Same Title", url: "https://example.com/b" });
  const three = makeItem(baseSource, { title: "Different", url: "https://example.com/a?utm=2" });
  assert.equal(dedupeItems([one, two, three]).length, 1);
});

test("public source keeps scraped body; gated source stays metadata-only", () => {
  const publicItem = makeItem(
    { ...baseSource, sourceReliability: "official", access: "public" },
    { title: "Public page", url: "https://example.com/p", body: "Full readable article body text." }
  );
  assert.match(publicItem.body, /Full readable article body text/);

  const communityItem = makeItem(
    { ...baseSource, sourceReliability: "community", access: "community_signal" },
    { title: "Community thread", url: "https://example.com/q", body: "subscriber/community body that must not persist" }
  );
  assert.equal(communityItem.body, "");
});

test("public feed excludes private authenticated signal; blob keeps it stdout-only", () => {
  const publicItem = makeItem(baseSource, {
    title: "Public item",
    url: "https://example.com/public",
    excerpt: "Public metadata"
  });
  const privateItem = makeItem(baseSource, {
    title: "Private item",
    url: "https://example.com/private",
    excerpt: "subscriber-visible analysis text",
    access: "authenticated_ephemeral"
  });
  const { feed, blob } = buildOutputs({
    items: [publicItem],
    privateItems: [privateItem],
    errors: [],
    config: { timezone: "America/Los_Angeles" },
    date: "2026-05-16",
    generatedAt: "2026-05-16T00:00:00.000Z",
    language: "zh"
  });
  const feedJson = JSON.stringify(feed);
  assert.doesNotMatch(feedJson, /subscriber-visible analysis text/);
  assert.equal(feed.items.length, 1);
  assert.equal(blob.privateItems.length, 1);
  assert.equal(blob.stats.privateItems, 1);
  assert.match(JSON.stringify(blob.privateItems), /subscriber-visible analysis text/);
});

test("blob carries raw excerpts plus prompts and language for agent remix", () => {
  const item = makeItem({
    ...baseSource,
    name: "Amazon Ads Library",
    sourceReliability: "official",
    category: "Official / Policy",
    tags: ["Amazon Ads", "advertising"]
  }, {
    title: "A guide to targeting with Sponsored Products",
    url: "https://advertising.amazon.com/en-us/library/guides/targeting-with-sponsored-products/",
    excerpt: "Discover tips to help you drive sales through targeting with Sponsored Products."
  });
  const { feed, blob } = buildOutputs({
    items: [item],
    privateItems: [],
    errors: [],
    config: { timezone: "America/Los_Angeles" },
    date: "2026-05-16",
    generatedAt: "2026-05-16T00:00:00.000Z",
    language: "zh",
    prompts: { dailyDigest: "DAILY_DIGEST_PROMPT_BODY", translate: "TRANSLATE_PROMPT_BODY" }
  });
  // Raw English excerpt is preserved for the agent; no canned dictionary translation.
  assert.match(JSON.stringify(feed.items[0]), /Discover tips to help you drive sales/);
  assert.equal(blob.config.language, "zh");
  assert.equal(blob.prompts.dailyDigest, "DAILY_DIGEST_PROMPT_BODY");
  assert.equal(blob.prompts.translate, "TRANSLATE_PROMPT_BODY");
  const official = blob.categories.find((c) => c.key === "Official / Policy");
  assert.equal(official.zh, "官方 / 政策");
  assert.equal(blob.stats.byCategory["Official / Policy"], 1);
});

test("extractStructuredData reads JSON-LD Article", () => {
  const html = `<html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@type": "BlogPosting",
      headline: "May 2026 SP-API Release Notes",
      datePublished: "2026-05-06T00:00:00Z",
      articleBody: "Amazon will modify attribute usage and enumeration values."
    })}</script></head><body><nav>Home Docs</nav></body></html>`;
  const sd = extractStructuredData(html);
  assert.equal(sd.title, "May 2026 SP-API Release Notes");
  assert.match(sd.publishedAt, /2026-05-06/);
  assert.match(sd.body, /attribute usage and enumeration/);
});

test("extractStructuredData reads __NEXT_DATA__ post body", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { post: { title: "Agentic Shopping", body: "Agents will reshape discovery." } } }
  })}</script>`;
  const sd = extractStructuredData(html);
  assert.equal(sd.title, "Agentic Shopping");
  assert.match(sd.body, /reshape discovery/);
});

test("extractReadableText strips nav/header/footer chrome", () => {
  const html =
    "<html><body><nav>首页 跨境头条 跨境百科 工具箱</nav>" +
    "<header>拖动LOGO到书签栏</header>" +
    "<article>真实正文：5.18 价格新规将影响参考价计算。</article>" +
    "<footer>联系开店顾问</footer></body></html>";
  const text = extractReadableText(html);
  assert.match(text, /真实正文/);
  assert.doesNotMatch(text, /跨境头条/);
  assert.doesNotMatch(text, /联系开店顾问/);
});

test("normalizeTitle lowercases and strips punctuation", () => {
  assert.equal(
    normalizeTitle("  [BDSN] Amazon's Search Bar — How It Thinks! "),
    "bdsn amazon s search bar how it thinks"
  );
  assert.equal(normalizeTitle("同样标题，标点不同。"), "同样标题 标点不同");
});

test("parseLinkList harvests article anchors generically", () => {
  const html =
    '<a href="/t/HryfW7m9">5.18 价格新规解读</a>' +
    '<a href="/t/BtxQPDav">Coupang 极速开店实操</a>' +
    '<a href="/about">关于我们</a>'; // non-matching, excluded
  const linkRe = /<a\b[^>]*href=["']([^"']*\/t\/[A-Za-z0-9_-]{4,}[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const items = parseLinkList(html, { ...baseSource, name: "AMZ123" }, "https://www.amz123.com/t", linkRe);
  assert.equal(items.length, 2);
  assert.match(items[0].url, /amz123\.com\/t\/HryfW7m9/);
  assert.equal(items[0].title, "5.18 价格新规解读");
});

test("makeItem carries thin flag only when set", () => {
  const thin = makeItem(baseSource, { title: "Index shell", url: "https://x.com/i", thin: true });
  assert.equal(thin.thin, true);
  const ok = makeItem(baseSource, { title: "Real", url: "https://x.com/r", body: "real body text here" });
  assert.equal("thin" in ok, false);
});

test("filterByLookback drops stale dated items, keeps undated/now", () => {
  const now = Date.parse("2026-05-16T12:00:00Z");
  const lookback = new Map([["Fixture Source", 72]]);
  const fresh = makeItem(baseSource, { title: "Fresh", url: "https://x.com/f", publishedAt: "2026-05-15T12:00:00Z" });
  const stale = makeItem(baseSource, { title: "Stale", url: "https://x.com/s", publishedAt: "2026-04-01T00:00:00Z" });
  const undated = makeItem(baseSource, { title: "Undated", url: "https://x.com/u", publishedAt: new Date(now).toISOString() });
  const kept = filterByLookback([fresh, stale, undated], lookback, now);
  const titles = kept.map((i) => i.title).sort();
  assert.deepEqual(titles, ["Fresh", "Undated"]);
});

test("state filterUnseen returns new items once, then nothing", () => {
  const state = { seen: {} };
  const a = makeItem(baseSource, { title: "Item A", url: "https://x.com/a" });
  const b = makeItem(baseSource, { title: "Item B", url: "https://x.com/b" });
  const first = filterUnseen(state, [a, b]);
  assert.equal(first.length, 2);
  const second = filterUnseen(state, [a, b]);
  assert.equal(second.length, 0);
  assert.equal(isSeen(state, a), true);
});

test("state dedupes same item across runs by normalized title", () => {
  const state = { seen: {} };
  const v1 = makeItem(baseSource, { title: "8-Figure Amazon Brand!", url: "https://x.com/ep1" });
  markSeen(state, v1);
  const v2 = makeItem({ ...baseSource, id: "other" }, { title: "8-figure amazon brand", url: "https://x.com/ep1?utm=x" });
  assert.equal(isSeen(state, v2), true);
});

test("chunkText splits long text under the cap without losing content", () => {
  const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
  const chunks = chunkText(text, 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 100, `chunk too long: ${c.length}`);
  assert.equal(chunks.join(""), text);
  const short = chunkText("tiny", 100);
  assert.deepEqual(short, ["tiny"]);
});

test("buildFeishuPayload shapes plain and signed payloads", () => {
  const plain = buildFeishuPayload("hello", undefined);
  assert.deepEqual(plain, { msg_type: "text", content: { text: "hello" } });

  const ts = 1747400000;
  const secret = "abc123";
  const signed = buildFeishuPayload("hi", secret, ts);
  assert.equal(signed.msg_type, "text");
  assert.equal(signed.content.text, "hi");
  assert.equal(signed.timestamp, String(ts));
  const expected = createHmac("sha256", `${ts}\n${secret}`).digest("base64");
  assert.equal(signed.sign, expected);
});

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}
