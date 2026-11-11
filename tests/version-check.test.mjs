// Decision-path tests for scripts/version-check.mjs (postern#934). Pure: no network.
// Usage: node tests/version-check.test.mjs <case>. Exit 0 = pass.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { judge, latestTag } from "../scripts/version-check.mjs";

const R = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
const RELEASES = [R("v1.9.0"), R("v1.14.0"), R("v1.10.1"), R("postern-mcp-v2.0.0"), R("v1.15.0", { prerelease: true }), R("v2.0.0", { draft: true })];

const cases = {
  "latest-is-numeric-and-skips-noise": () => {
    assert.equal(latestTag(RELEASES), "v1.14.0");
    assert.equal(latestTag([]), null);
  },
  "pin-at-latest-passes": () => assert.equal(judge("v1.14.0", RELEASES).code, 0),
  "pin-behind-fails": () => {
    const r = judge("v1.8.0", RELEASES);
    assert.equal(r.code, 1);
    assert.match(r.line, /BEHIND: the demo is pinned to v1\.8\.0; the latest release is v1\.14\.0/);
  },
  "unmeasurable-is-not-a-pass": () => {
    assert.equal(judge("latest", RELEASES).code, 2);
    assert.equal(judge("v1.14.0", []).code, 2);
  },
  "cli-exits-2-when-releases-unreadable": () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-"));
    writeFileSync(join(dir, "POSTERN_VERSION"), "v1.14.0\n");
    const cli = resolve("scripts/version-check.mjs");
    const r = spawnSync(process.execPath, [cli, "--releases-json", join(dir, "missing.json")], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /UNMEASURED/);
    writeFileSync(join(dir, "rel.json"), JSON.stringify(RELEASES));
    assert.equal(spawnSync(process.execPath, [cli, "--releases-json", join(dir, "rel.json")], { cwd: dir }).status, 0);
    writeFileSync(join(dir, "POSTERN_VERSION"), "v1.8.0\n");
    assert.equal(spawnSync(process.execPath, [cli, "--releases-json", join(dir, "rel.json")], { cwd: dir }).status, 1);
  },
};
const name = process.argv[2];
if (!cases[name]) { console.error(`unknown case: ${name}`); process.exit(2); }
cases[name]();
