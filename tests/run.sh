#!/usr/bin/env bash
# The whole suite. Each case prints "@event case {...}"; the run ends with a count that the
# coverage job asserts, so a suite that silently skips cases goes red.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
pass=0; fail=0
case_() { if [ "$2" = 0 ]; then pass=$((pass+1)); r=pass; else fail=$((fail+1)); r=fail; fi; echo "@event case {\"name\":\"$1\",\"result\":\"$r\"}"; }
work="$(mktemp -d)"
pvbak="$work/POSTERN_VERSION"
cp POSTERN_VERSION "$pvbak"
trap 'cp "$pvbak" POSTERN_VERSION; rm -rf "$work"' EXIT

# 1. fetch.sh refuses a pin that is not a vX.Y.Z tag.
echo latest > POSTERN_VERSION
bash scripts/fetch.sh >/dev/null 2>&1; rc=$?
cp "$pvbak" POSTERN_VERSION
if [ "$rc" -ne 0 ]; then r=0; else r=1; fi; case_ refuses-non-semver-pin "$r"

# 2. fetch.sh fetches the pin and the tarball version equals it.
bash scripts/fetch.sh >/dev/null; case_ fetches-pinned-release $?

# 3. Config parity against the pinned release.
node tests/parity.mjs; case_ config-parity $?

# 4. Positive control: an upstream that adds an object-shaped binding, an array binding,
#    a var and a cron must make parity FAIL, once per addition.
# shellcheck disable=SC2016 # JavaScript, not shell
node -e '
const fs = require("fs");
const s = fs.readFileSync("postern/inbound/wrangler.jsonc", "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").replace(/,(\s*[}\]])/g, "$1");
const c = JSON.parse(s);
c.version_metadata = { binding: "CF_VERSION" };
c.kv_namespaces = [...(c.kv_namespaces || []), { binding: "PARITY_PROBE_KV", id: "x" }];
c.vars = { ...(c.vars || {}), PARITY_PROBE_VAR: "" };
c.triggers = { crons: [...((c.triggers || {}).crons || []), "7 7 * * *"] };
fs.writeFileSync(process.argv[1], JSON.stringify(c));
' "$work/upstream-plus.json"
out="$(node tests/parity.mjs "$work/upstream-plus.json")"; rc=$?
fails="$(printf '%s\n' "$out" | sed -n 's/^@event parity .*"fails":\([0-9]*\).*/\1/p')"
if [ "$rc" -eq 1 ] && [ "$fails" = 4 ]; then r=0; else r=1; fi; case_ parity-catches-four-additions "$r"

# 5. A wrangler dry run bundles the Worker with this config.
npx wrangler deploy --dry-run --outdir .wrangler/dry >/dev/null 2>&1; case_ dry-run-bundles $?

# 6. The deploy script carries the migration gate before the apply.
gate_line="$(grep -n 'd1-migration-gate.mjs postern/inbound/migrations' scripts/deploy.sh | head -1 | cut -d: -f1)"
apply_line="$(grep -n 'migrations apply DB' scripts/deploy.sh | head -1 | cut -d: -f1)"
if [ -n "$gate_line" ] && [ -n "$apply_line" ] && [ "$gate_line" -lt "$apply_line" ] && [ -f postern/.github/scripts/d1-migration-gate.mjs ]; then r=0; else r=1; fi; case_ deploy-gates-migrations "$r"

echo "@event suite {\"pass\":$pass,\"fail\":$fail,\"cases\":$((pass+fail))}"
[ "$fail" -eq 0 ]
