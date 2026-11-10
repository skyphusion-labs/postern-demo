// Asserts this repo's wrangler.jsonc declares every binding and var that the pinned postern
// release's inbound/wrangler.jsonc declares, so a release that adds a binding cannot deploy here
// without it. Run after scripts/fetch.sh. Prints one @event line per check and a final count.
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/^\s*\/\/[^\n]*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
const load = (p) => JSON.parse(strip(readFileSync(p, "utf8")));
const ours = load("wrangler.jsonc");
const up = load("postern/inbound/wrangler.jsonc");

// Upstream vars the demo deliberately does not set, with the reason.
const OPTIONAL_VARS = {
  POSTERN_SEND_IDENTITIES: "agent identity registry; the demo has no agent identities",
};

const names = (cfg) => {
  const out = new Set();
  for (const [k, v] of Object.entries(cfg)) {
    if (k === "vars" || k === "routes") continue;
    if (Array.isArray(v)) for (const b of v) if (b && (b.binding || b.name)) out.add(`${k}:${b.binding || b.name}`);
    if (k === "ai" && v?.binding) out.add(`ai:${v.binding}`);
    if (k === "durable_objects") for (const b of v.bindings || []) out.add(`do:${b.name}`);
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
check(ours.name === "postern", "worker name is postern");
check(ours.keep_vars === false, "keep_vars is false");
check(ours.compatibility_date >= up.compatibility_date, `compatibility_date ${ours.compatibility_date} >= upstream ${up.compatibility_date}`);
check(ours.main === "postern/inbound/src/index.ts", "main points into the fetched release");

console.log(`@event parity ${JSON.stringify({ checks, fails })}`);
if (checks === 0) { console.error("parity ran zero checks"); process.exit(2); }
process.exit(fails ? 1 : 0);
