#!/usr/bin/env node
// Commits cross-run dedup state AFTER a digest has actually been delivered.
//
// prepare-digest.js filters against state read-only and never persists, so a
// failed remix/delivery just repeats content next run instead of silently
// losing it. Once the digest is delivered, run this to mark those items seen
// so the next run excludes them.
//
// Usage:
//   node scripts/mark-seen.js                       # marks data/feed-amazon.json items
//   node scripts/mark-seen.js --feed path/to.json
//
// Safe to run multiple times (idempotent). Non-fatal on missing/empty feed.

import { parseArgs, readJson, repoPath } from "./lib/common.js";
import { loadState, markSeen, saveState } from "./lib/state.js";

async function main() {
  const args = parseArgs();
  const feedPath = repoPath(typeof args.feed === "string" ? args.feed : "data/feed-amazon.json");

  let feed;
  try {
    feed = await readJson(feedPath);
  } catch {
    process.stdout.write(`${JSON.stringify({ status: "skipped", reason: `no feed at ${feedPath}` })}\n`);
    return;
  }

  const items = Array.isArray(feed.items) ? feed.items : [];
  if (items.length === 0) {
    process.stdout.write(`${JSON.stringify({ status: "skipped", reason: "feed has no items" })}\n`);
    return;
  }

  const state = await loadState();
  for (const item of items) markSeen(state, item);
  await saveState(state);
  process.stdout.write(`${JSON.stringify({ status: "ok", marked: items.length })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
