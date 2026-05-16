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

  const publicDigest = buildDigest(feed, { privateItems: [], includePrivate: false });
  const stdoutDigest = buildDigest(feed, { privateItems, includePrivate: privateItems.length > 0 });

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
  const lines = [
    `# Amazon Seller Daily Intelligence - ${feed.date}`,
    "",
    `Generated: ${feed.generatedAt}`,
    `Public items: ${feed.itemCount}`,
    `Private auth signals: ${includePrivate ? privateItems.length : 0}`,
    ""
  ];

  if (feed.errors.length > 0) {
    lines.push("## Source Warnings", "");
    for (const error of feed.errors.slice(0, 10)) {
      lines.push(`- ${error.source}: ${error.message}`);
    }
    lines.push("");
  }

  for (const category of CATEGORIES) {
    const items = feed.items.filter((item) => item.category === category).slice(0, 8);
    lines.push(`## ${category}`, "");
    if (items.length === 0) {
      lines.push("- No public signal captured today.", "");
      continue;
    }
    for (const item of items) {
      lines.push(formatDigestItem(item));
    }
    lines.push("");
  }

  if (includePrivate) {
    lines.push("## Private Auth Signals (stdout-only)", "");
    lines.push(
      "These items came from authenticated sessions. They are summarized for temporary analysis and are not written to the public feed file."
    );
    lines.push("");
    for (const item of privateItems.slice(0, 8)) {
      lines.push(formatDigestItem(item));
    }
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function formatDigestItem(item) {
  return [
    `- [${escapeMarkdown(item.title)}](${item.url})`,
    `  - 发生了什么: ${item.excerpt || "Public metadata captured."}`,
    `  - 卖家影响: ${item.sellerImpact}`,
    `  - 建议动作: ${suggestAction(item)}`,
    `  - Tags: ${item.tags.join(", ")}`
  ].join("\n");
}

function suggestAction(item) {
  if (item.sourceReliability === "official") {
    return "今天先确认是否影响账号、广告、API、物流或合规 SOP。";
  }
  if (item.category === "Community Pain Signals") {
    return "把它当成异常/痛点雷达，等官方或多源确认后再改 SOP。";
  }
  if (item.category === "Podcast / Video Playbooks") {
    return "挑一个和你当前广告、Listing 或库存问题相关的动作做小范围测试。";
  }
  if (item.category === "Newsletter / Analyst Signals") {
    return "提炼成一个假设，再用你自己的类目数据验证。";
  }
  return "记录可能影响利润、转化或运营效率的点，决定是否进入本周实验清单。";
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
