#!/usr/bin/env node
// Daily check (version-check.yml): is the demo pinned to the latest postern release? (postern#934)
//
// Exit 0: POSTERN_VERSION equals the latest release.
// Exit 1: it does not. The demo is behind (or pinned to something that is not the latest).
// Exit 2: the release list could not be read, or the pin is malformed. Could not measure, not a pass.
//
// "Latest" is the highest vX.Y.Z by number among published releases: no drafts, no prereleases,
// and not the repo's postern-mcp-v* releases. GitHub's own "latest" flag is not trusted, because a
// postern-mcp release can take it.
// Usage: node scripts/version-check.mjs [--releases-json FILE]
import { readFileSync } from "node:fs";

const key = (t) => {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(t ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const newer = (a, b) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** The highest published vX.Y.Z tag, or null. */
export function latestTag(releases) {
  let best = null;
  for (const r of releases ?? []) {
    if (!r || r.draft || r.prerelease) continue;
    const k = key(r.tag_name);
    if (k && (!best || newer(k, best.k))) best = { tag: r.tag_name, k };
  }
  return best ? best.tag : null;
}

/** { code, line } for a pin against a release list. */
export function judge(pin, releases) {
  if (!key(pin)) return { code: 2, line: `UNMEASURED: POSTERN_VERSION is not vX.Y.Z: '${pin}'` };
  const latest = latestTag(releases);
  if (!latest) return { code: 2, line: "UNMEASURED: no published vX.Y.Z release was found" };
  if (pin === latest) return { code: 0, line: `OK: the demo is pinned to the latest release, ${latest}` };
  return { code: 1, line: `BEHIND: the demo is pinned to ${pin}; the latest release is ${latest}. Upgrade it (README, "Upgrade the demo").` };
}

async function readReleases(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const headers = { accept: "application/vnd.github+json", "user-agent": "postern-demo-version-check" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  let url = "https://api.github.com/repos/skyphusion-labs/postern/releases?per_page=100";
  for (let page = 0; url && page < 20; page++) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error("the release list is not a list");
    all.push(...batch);
    url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null;
  }
  if (url) throw new Error("more than 20 pages of releases; refusing to judge a partial list");
  return all;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const i = process.argv.indexOf("--releases-json");
  const pin = readFileSync("POSTERN_VERSION", "utf8").trim();
  let releases;
  try {
    releases = await readReleases(i >= 0 ? process.argv[i + 1] : null);
  } catch (e) {
    console.log(`UNMEASURED: the postern release list could not be read (${e.message}). This is not a pass.`);
    process.exit(2);
  }
  const { code, line } = judge(pin, releases);
  console.log(`${line} (releases_read=${releases.length})`);
  process.exit(code);
}
