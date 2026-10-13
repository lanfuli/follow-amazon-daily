import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("mark-seen CLI reports a missing feed without writing state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "fad-cli-"));
  try {
    const output = execFileSync(process.execPath, [
      fileURLToPath(new URL("../scripts/mark-seen.js", import.meta.url)),
      "--feed", "missing-feed.json"
    ], { cwd, encoding: "utf8" });
    assert.equal(JSON.parse(output).status, "skipped");
    assert.match(JSON.parse(output).reason, /no feed/);
    assert.equal(existsSync(join(cwd, "state-feed.json")), false);
  } finally {
    rmdirSync(cwd);
  }
});
