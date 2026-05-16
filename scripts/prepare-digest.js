#!/usr/bin/env node
import {
  dedupeItems,
  parseArgs,
  readJson,
  repoPath,
  sortItems,
  todayInTimeZone,
  writeJson,
  writeText
} from "./lib/common.js";
import { fetchSource } from "./lib/fetchers.js";
import {
  categoryLabel,
  labels,
  localizeItem,
  resolveLanguage,
  suggestActionZh
} from "./lib/i18n.js";

const CATEGORIES = [
  "Official / Policy",
  "Seller Ops",
  "Community Pain Signals",
  "Podcast / Video Playbooks",
  "Newsletter / Analyst Signals"
];

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
  const publicItems = sortItems(dedupeItems(results.flatMap((result) => result.items)));
  const privateItems = sortItems(dedupeItems(results.flatMap((result) => result.privateItems)));
  const generatedAt = new Date().toISOString();

  const feed = {
    generatedAt,
    date,
    itemCount: publicItems.length,
    privateItemCount: 0,
    items: publicItems,
    errors
  };

  const publicDigest = buildDigest(feed, { privateItems: [], includePrivate: false, language });
  const stdoutDigest = buildDigest(feed, { privateItems, includePrivate: privateItems.length > 0, language });

  if (!args["dry-run"]) {
    await writeJson(repoPath(args.out || "data/feed-amazon.json"), feed);
    await writeText(repoPath(args.digest || `digest/${date}.md`), publicDigest);
    if (args["include-private-digest"] && privateItems.length > 0) {
      await writeText(repoPath(`digest/private-${date}.md`), stdoutDigest);
    }
  }

  if (!args.quiet) {
    process.stdout.write(`${stdoutDigest}\n`);
  }

}

export function buildDigest(feed, options = {}) {
  const privateItems = options.privateItems ?? [];
  const includePrivate = Boolean(options.includePrivate);
  const language = options.language || "zh";
  const t = labels(language);
  const lines = [
    `# ${t.titlePrefix} - ${feed.date}`,
    "",
    `${t.generated}: ${feed.generatedAt}`,
    `${t.publicItems}: ${feed.itemCount}`,
    `${t.privateSignals}: ${includePrivate ? privateItems.length : 0}`,
    ""
  ];

  if (feed.errors.length > 0) {
    lines.push(`## ${t.sourceWarnings}`, "");
    for (const error of feed.errors.slice(0, 10)) {
      lines.push(`- ${error.source}: ${error.message}`);
    }
    lines.push("");
  }

  for (const category of CATEGORIES) {
    const items = feed.items.filter((item) => item.category === category).slice(0, 8);
    lines.push(`## ${categoryLabel(category, language)}`, "");
    if (items.length === 0) {
      lines.push(`- ${t.noSignal}`, "");
      continue;
    }
    for (const item of items) {
      lines.push(formatDigestItem(item, language));
    }
    lines.push("");
  }

  if (includePrivate) {
    lines.push(`## ${t.privateHeading}`, "");
    lines.push(t.privateNotice);
    lines.push("");
    for (const item of privateItems.slice(0, 8)) {
      lines.push(formatDigestItem(item, language));
    }
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function formatDigestItem(item, language = "zh") {
  if (language === "bilingual") {
    const zh = localizeItem(item, "zh");
    return [
      `- [${escapeMarkdown(item.title)}](${item.url})`,
      `  - What happened: ${item.excerpt || "Public metadata captured."}`,
      `  - Seller impact: ${item.sellerImpact}`,
      `  - Suggested action: ${suggestAction(item, "en")}`,
      `  - 中文标题: ${zh.title}`,
      `  - 发生了什么: ${zh.excerpt}`,
      `  - 卖家影响: ${zh.sellerImpact}`,
      `  - 建议动作: ${suggestAction(item, "zh")}`,
      `  - Tags / 标签: ${item.tags.join(", ")} / ${zh.tags.join(", ")}`
    ].join("\n");
  }
  const t = labels(language);
  const localized = localizeItem(item, language);
  return [
    `- [${escapeMarkdown(localized.title)}](${item.url})`,
    `  - ${t.happened}: ${localized.excerpt || t.publicMetadata}`,
    `  - ${t.impact}: ${localized.sellerImpact}`,
    `  - ${t.action}: ${suggestAction(item, language)}`,
    `  - ${t.tags}: ${localized.tags.join(", ")}`
  ].join("\n");
}

function suggestAction(item, language = "zh") {
  if (language === "zh") return suggestActionZh(item);
  if (item.sourceReliability === "official") {
    return "Check whether this should update account, ads, API, logistics, or compliance SOPs.";
  }
  if (item.category === "Community Pain Signals") {
    return "Treat it as a pain signal; wait for official or multi-source confirmation before changing SOPs.";
  }
  if (item.category === "Podcast / Video Playbooks") {
    return "Pick one tactic related to ads, listings, conversion, or inventory and test it narrowly.";
  }
  if (item.category === "Newsletter / Analyst Signals") {
    return "Turn it into a hypothesis, then validate it against your own category data.";
  }
  return "Decide whether this belongs in this week's operating experiment list.";
}

function escapeMarkdown(value) {
  return String(value).replace(/[[\]]/g, "\\$&");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
