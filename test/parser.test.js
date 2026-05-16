import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dedupeItems, makeItem } from "../scripts/lib/common.js";
import {
  parseBeehiivArchive,
  parseWeAreSellersHtml,
  parseXmlFeed
} from "../scripts/lib/fetchers.js";
import { buildDigest } from "../scripts/prepare-digest.js";

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

test("public digest excludes private authenticated signal by default", () => {
  const feed = {
    generatedAt: "2026-05-16T00:00:00.000Z",
    date: "2026-05-16",
    itemCount: 1,
    errors: [],
    items: [
      makeItem(baseSource, {
        title: "Public item",
        url: "https://example.com/public",
        excerpt: "Public metadata"
      })
    ]
  };
  const privateItem = makeItem(baseSource, {
    title: "Private item",
    url: "https://example.com/private",
    excerpt: "subscriber-visible analysis text",
    access: "authenticated_ephemeral"
  });
  const publicDigest = buildDigest(feed, { privateItems: [privateItem], includePrivate: false });
  assert.doesNotMatch(publicDigest, /subscriber-visible analysis text/);
  const stdoutDigest = buildDigest(feed, { privateItems: [privateItem], includePrivate: true });
  assert.match(stdoutDigest, /仅 stdout/);
});

test("Chinese digest translates known English source content", () => {
  const feed = {
    generatedAt: "2026-05-16T00:00:00.000Z",
    date: "2026-05-16",
    itemCount: 1,
    errors: [],
    items: [
      makeItem({
        ...baseSource,
        name: "Amazon Ads Library",
        sourceReliability: "official",
        category: "Official / Policy",
        tags: ["Amazon Ads", "advertising"]
      }, {
        title: "A guide to targeting with Sponsored Products",
        url: "https://advertising.amazon.com/en-us/library/guides/targeting-with-sponsored-products/",
        excerpt: "Discover tips to help you drive sales through targeting with Sponsored Products."
      })
    ]
  };
  const digest = buildDigest(feed, { language: "zh" });
  assert.match(digest, /Sponsored Products 定向指南/);
  assert.match(digest, /Amazon Ads 官方说明/);
  assert.doesNotMatch(digest, /Discover tips to help you drive sales/);
  assert.match(digest, /官方 \/ 政策/);
});

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}
