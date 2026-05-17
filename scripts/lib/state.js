// Cross-run dedup state. Tracks which items have already been DELIVERED in a
// previous digest so a "daily" digest only shows what's actually new.
//
// Key by the stable item id only. `item.id` = `${source.id}-${hash(url,title)}`,
// so it is unique per piece of content and a recurring series with a constant
// title (e.g. a weekly "Friday Live Q&A" video) still gets a fresh id each week
// because the URL differs. A fuzzy title key was tried and removed — it
// permanently suppressed every recurring same-title episode after the first.
//
// State is persisted only AFTER a digest is actually delivered (see
// scripts/mark-seen.js), never at fetch time, so a failed/aborted run repeats
// content rather than silently losing it. The file is per-install and
// gitignored — shipping it would pre-mark everything seen.

import { readFile, writeFile } from "node:fs/promises";
import { repoPath } from "./common.js";

const STATE_FILE = "state-feed.json";
const PRUNE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function loadState(path = repoPath(STATE_FILE)) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return { seen: parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {} };
  } catch {
    return { seen: {} };
  }
}

export async function saveState(state, path = repoPath(STATE_FILE)) {
  const cutoff = Date.now() - PRUNE_MS;
  for (const [key, ts] of Object.entries(state.seen)) {
    if (typeof ts !== "number" || ts < cutoff) delete state.seen[key];
  }
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function itemKeys(item) {
  return item.id ? [`id:${item.id}`] : [];
}

export function isSeen(state, item) {
  return itemKeys(item).some((k) => k in state.seen);
}

export function markSeen(state, item, now = Date.now()) {
  for (const k of itemKeys(item)) state.seen[k] = now;
}

// Read-only: returns items not previously delivered. Does NOT persist — the
// in-memory state is marked so duplicates within this call are also dropped,
// but nothing is written until scripts/mark-seen.js runs post-delivery.
export function filterUnseen(state, items) {
  const fresh = [];
  for (const item of items) {
    if (isSeen(state, item)) continue;
    markSeen(state, item);
    fresh.push(item);
  }
  return fresh;
}
