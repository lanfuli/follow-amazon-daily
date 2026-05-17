// Cross-run dedup state. Tracks which items have already been emitted in a
// previous digest so a "daily" digest only shows what's actually new, instead
// of repeating the same podcast episodes / newsletter titles every day.
//
// Mirrors follow-builders' state-feed.json approach: a flat { seen: { key: ts } }
// map, pruned to a rolling window so the file never grows unbounded. The file
// lives in the repo root so GitHub Actions commits it and dedup persists.

import { readFile, writeFile } from "node:fs/promises";
import { normalizeTitle, repoPath } from "./common.js";

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

// An item is keyed by its stable id and (separately) its normalized title, so
// it dedupes across runs even if the URL picks up tracking params or the title
// shifts slightly.
export function itemKeys(item) {
  const keys = [];
  if (item.id) keys.push(`id:${item.id}`);
  const nt = normalizeTitle(item.title || "");
  if (nt) keys.push(`t:${nt}`);
  return keys;
}

export function isSeen(state, item) {
  return itemKeys(item).some((k) => k in state.seen);
}

export function markSeen(state, item, now = Date.now()) {
  for (const k of itemKeys(item)) state.seen[k] = now;
}

// Returns only the items not previously emitted, and records them as seen.
export function filterUnseen(state, items) {
  const fresh = [];
  for (const item of items) {
    if (isSeen(state, item)) continue;
    markSeen(state, item);
    fresh.push(item);
  }
  return fresh;
}
