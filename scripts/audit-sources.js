#!/usr/bin/env node
import { parseArgs, readJson, repoPath } from "./lib/common.js";
import { fetchSource } from "./lib/fetchers.js";

async function main() {
  const args = parseArgs();
  const config = await readJson(repoPath(args.sources || "config/sources.json"));
  const limit = Number.parseInt(args.limit || "3", 10);
  const timeoutMs = Number.parseInt(args.timeout || "20000", 10);
  const report = [];

  for (const source of config.sources.filter((item) => item.enabled !== false)) {
    const startedAt = Date.now();
    const result = await fetchSource(source, {
      limit,
      timeoutMs,
      publicOnly: true,
      maxPrivateItems: 0
    });
    const ok = result.items.length > 0 && result.errors.length === 0;
    report.push({
      id: source.id,
      name: source.name,
      type: source.type,
      url: source.rssUrl || source.url,
      ok,
      itemCount: result.items.length,
      elapsedMs: Date.now() - startedAt,
      errors: result.errors
    });
  }

  const flagged = report.filter((item) => !item.ok);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), flagged, report }, null, 2)}\n`);
  } else if (args.quiet) {
    for (const item of flagged) {
      process.stdout.write(`${item.name}: ${item.errors.map((error) => error.message).join("; ") || "no items"}\n`);
    }
  } else {
    for (const item of report) {
      const status = item.ok ? "OK" : "FLAG";
      const detail = item.ok
        ? `${item.itemCount} items in ${item.elapsedMs}ms`
        : item.errors.map((error) => error.message).join("; ") || "no items";
      process.stdout.write(`${status} ${item.name} - ${detail}\n`);
    }
  }

  if (flagged.length > 0 && !args["dry-run"]) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
