#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  dedupeItems,
  parseArgs,
  readJson,
  repoPath,
  sortItems,
  todayInTimeZone,
  writeJson
} from "./lib/common.js";
import { fetchSource } from "./lib/fetchers.js";
import { CATEGORY_LABELS, resolveLanguage } from "./lib/i18n.js";
import { filterUnseen, loadState, saveState } from "./lib/state.js";

export const CATEGORIES = [
  "Official / Policy",
  "Seller Ops",
  "Community Pain Signals",
  "Podcast / Video Playbooks",
  "Newsletter / Analyst Signals"
];

const PROMPT_FILES = {
  dailyDigest: "prompts/daily-digest.md",
  translate: "prompts/translate.md",
  summarizeOfficial: "prompts/summarize-official.md",
  summarizePodcast: "prompts/summarize-podcast.md",
  summarizeCommunity: "prompts/summarize-community.md",
  summarizeNewsletter: "prompts/summarize-newsletter.md"
};

// Drops items older than their source's lookbackHours. Items whose date is
// missing/unparseable, or that resolve to ~now (undated pages default to the
// run time in makeItem), are kept — those rely on cross-run state dedup instead.
export function filterByLookback(items, lookbackByName, nowMs = Date.now()) {
  return items.filter((item) => {
    const hours = lookbackByName.get(item.source);
    if (!hours) return true;
    const ts = Date.parse(item.publishedAt);
    if (Number.isNaN(ts)) return true;
    return nowMs - ts <= hours * 60 * 60 * 1000;
  });
}

async function loadPrompts() {
  const prompts = {};
  for (const [key, rel] of Object.entries(PROMPT_FILES)) {
    try {
      prompts[key] = await readFile(repoPath(rel), "utf8");
    } catch {
      prompts[key] = "";
    }
  }
  return prompts;
}

// Pure seam: turns fetched items into the deterministic public feed plus the
// full agent blob. The script never assembles the final Chinese digest itself
// — the agent does that by reading `blob.items` + `blob.prompts`.
export function buildOutputs({
  items,
  privateItems = [],
  errors = [],
  config,
  date,
  generatedAt,
  language,
  prompts = {}
}) {
  const byCategory = {};
  for (const category of CATEGORIES) {
    byCategory[category] = items.filter((item) => item.category === category).length;
  }

  // Public, deterministic feed: raw English excerpts preserved, no canned
  // translation, no prompts, no ephemeral authenticated signals.
  const feed = {
    generatedAt,
    date,
    itemCount: items.length,
    items,
    errors
  };

  // Full blob for the agent. Includes prompts and stdout-only private signals;
  // this is never written to the public feed file.
  const blob = {
    generatedAt,
    date,
    config: {
      language,
      timezone: config.timezone,
      delivery: config.delivery ?? { method: "stdout" }
    },
    stats: {
      publicItems: items.length,
      privateItems: privateItems.length,
      byCategory
    },
    categories: CATEGORIES.map((key) => ({
      key,
      zh: CATEGORY_LABELS[key]?.zh ?? key
    })),
    items,
    privateItems,
    prompts,
    errors
  };

  return { feed, blob };
}

async function main() {
  const args = parseArgs();
  const configPath = repoPath(args.sources || "config/sources.json");
  const config = await readJson(configPath);
  const date = args.date || todayInTimeZone(config.timezone);
  const limit = Number.parseInt(args.limit || config.maxItemsPerSource || "8", 10);
  const timeoutMs = Number.parseInt(args.timeout || "20000", 10);
  const publicOnly = Boolean(args["public-only"]);
  const language = resolveLanguage(config, args);

  const results = await Promise.all(
    config.sources
      .filter((source) => source.enabled !== false)
      .map((source) => fetchSource(source, { limit, timeoutMs, publicOnly }))
  );

  const errors = results.flatMap((result) => result.errors);
  const deduped = sortItems(dedupeItems(results.flatMap((result) => result.items)));
  const privateItems = sortItems(dedupeItems(results.flatMap((result) => result.privateItems)));
  const generatedAt = new Date().toISOString();
  const prompts = await loadPrompts();

  // R3.2 — drop stale items per source lookback window.
  const lookbackByName = new Map(
    config.sources.map((s) => [s.name, s.lookbackHours])
  );
  const fresh = filterByLookback(deduped, lookbackByName);

  // R3.1 — cross-run dedup so the digest only shows what's new since last run.
  const ignoreState = Boolean(args["ignore-state"]);
  let items = fresh;
  let state = null;
  if (!ignoreState) {
    state = await loadState();
    items = filterUnseen(state, fresh);
  }

  const { feed, blob } = buildOutputs({
    items,
    privateItems,
    errors,
    config,
    date,
    generatedAt,
    language,
    prompts
  });

  if (!args["dry-run"]) {
    await writeJson(repoPath(args.out || "data/feed-amazon.json"), feed);
    if (state && !ignoreState) {
      await saveState(state);
    }
  }

  if (!args.quiet) {
    process.stdout.write(`${JSON.stringify(blob, null, 2)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
