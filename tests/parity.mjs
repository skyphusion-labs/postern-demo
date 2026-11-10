// Asserts this repo's wrangler.jsonc declares every binding, var and cron that the pinned
// postern release's inbound/wrangler.jsonc declares, so a release that adds one cannot deploy
// here without it. Run after scripts/fetch.sh.
// Usage: node tests/parity.mjs [upstream-config] (default postern/inbound/wrangler.jsonc)
// Prints one @event line per check and a final count.
import { readFileSync } from "node:fs";

// Strips // comments that start a line or follow code (not inside strings), and trailing commas.
const strip = (s) =>
  s
    .split("\n")
    .map((line) => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i - 1] !== "\\") inStr = !inStr;
        if (!inStr && c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
const load = (p) => JSON.parse(strip(readFileSync(p, "utf8")));
const ours = load("wrangler.jsonc");
const up = load(process.argv[2] || "postern/inbound/wrangler.jsonc");

// Upstream vars the demo deliberately does not set, with the reason.
const OPTIONAL_VARS = {
  POSTERN_SEND_IDENTITIES: "agent identity registry; the demo has no agent identities",
};
// Top-level keys that are not bindings.
const NOT_BINDINGS = new Set([
  "$schema", "name", "main", "compatibility_date", "compatibility_flags", "account_id",
  "observability", "workers_dev", "keep_vars", "vars", "routes", "route", "triggers",
  "placement", "limits", "minify", "build", "rules", "no_bundle", "preview_urls", "upload_source_maps",
]);

// Every binding, by shape: an array of entries (d1, r2, kv, send_email, services, ...), an
// object with one `binding` (ai, version_metadata, browser, images, ...), or durable_objects.
const names = (cfg) => {
  const out = new Set();
  for (const [k, v] of Object.entries(cfg)) {
    if (NOT_BINDINGS.has(k)) continue;
    if (k === "durable_objects") { for (const b of v.bindings || []) out.add(`do:${b.name}`); continue; }
    if (Array.isArray(v)) { for (const b of v) out.add(`${k}:${b?.binding || b?.name || JSON.stringify(b)}`); continue; }
    if (v && typeof v === "object") { out.add(`${k}:${v.binding || v.name || JSON.stringify(v)}`); continue; }
    out.add(`${k}:(scalar)`);
  }
  return out;
};

let checks = 0;
let fails = 0;
const check = (ok, what) => {
  checks++;
  if (!ok) fails++;
  console.log(`@event ${ok ? "pass" : "fail"} ${JSON.stringify({ what })}`);
};

const ob = names(ours);
for (const b of names(up)) check(ob.has(b), `binding ${b}`);
for (const v of Object.keys(up.vars || {})) {
  if (OPTIONAL_VARS[v]) { console.log(`@event skip ${JSON.stringify({ var: v, why: OPTIONAL_VARS[v] })}`); continue; }
  check(Object.hasOwn(ours.vars || {}, v), `var ${v}`);
}
const ourCrons = new Set(ours.triggers?.crons || []);
for (const c of up.triggers?.crons || []) check(ourCrons.has(c), `cron ${c}`);
for (const f of up.compatibility_flags || []) check((ours.compatibility_flags || []).includes(f), `compatibility_flag ${f}`);
check(ours.name === "postern", "worker name is postern");
check(ours.keep_vars === false, "keep_vars is false");
check(ours.compatibility_date >= up.compatibility_date, `compatibility_date ${ours.compatibility_date} >= upstream ${up.compatibility_date}`);
check(ours.main === "postern/inbound/src/index.ts", "main points into the fetched release");
const db = (ours.d1_databases || []).find((d) => d.binding === "DB");
check(db?.migrations_dir === "postern/inbound/migrations", "DB.migrations_dir points into the fetched release");

console.log(`@event parity ${JSON.stringify({ checks, fails })}`);
if (checks === 0) { console.error("parity ran zero checks"); process.exit(2); }
process.exit(fails ? 1 : 0);
