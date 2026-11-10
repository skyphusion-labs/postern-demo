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
trap 'cp "$pvbak" POSTERN_VERSION; [ -f "$work/POSTERN_COMMIT" ] && cp "$work/POSTERN_COMMIT" POSTERN_COMMIT; rm -rf "$work"' EXIT

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

# 6. fetch.sh refuses a commit pin that does not match the tag.
cp POSTERN_COMMIT "$work/POSTERN_COMMIT"
printf '%040d\n' 0 > POSTERN_COMMIT
bash scripts/fetch.sh >/dev/null 2>&1; rc=$?
cp "$work/POSTERN_COMMIT" POSTERN_COMMIT
bash scripts/fetch.sh >/dev/null 2>&1 || true
if [ "$rc" -ne 0 ]; then r=0; else r=1; fi; case_ refuses-mismatched-commit-pin "$r"

# 7. The deploy script verifies the uploaded version id is the one serving.
# shellcheck disable=SC2016 # literal text to find in deploy.sh
if grep -q 'verify-worker-deployment.mjs "\$work/deployment.json" "\$version_id"' scripts/deploy.sh && [ -f postern/.github/scripts/verify-worker-deployment.mjs ]; then r=0; else r=1; fi; case_ deploy-verifies-artifact "$r"

# 8. The deploy script carries the migration gate before the apply.
gate_line="$(grep -n 'd1-migration-gate.mjs postern/inbound/migrations' scripts/deploy.sh | head -1 | cut -d: -f1)"
apply_line="$(grep -n 'migrations apply DB' scripts/deploy.sh | head -1 | cut -d: -f1)"
if [ -n "$gate_line" ] && [ -n "$apply_line" ] && [ "$gate_line" -lt "$apply_line" ] && [ -f postern/.github/scripts/d1-migration-gate.mjs ]; then r=0; else r=1; fi; case_ deploy-gates-migrations "$r"

# 9. The seed corpus is valid and the dry run plans every message (postern#837).
node scripts/seed.mjs dry-run >/dev/null; case_ seed-dry-run "$?"

# 10..17. Seeder decision paths against the fake demo API (tests/seed.test.mjs).
node tests/seed.test.mjs corpus-valid; case_ seed-corpus-valid "$?"
node tests/seed.test.mjs validator-catches-bad-corpus; case_ seed-validator-catches-bad-corpus "$?"
node tests/seed.test.mjs seeds-empty-mailbox-and-threads; case_ seed-seeds-empty-mailbox-and-threads "$?"
node tests/seed.test.mjs rerun-sends-nothing; case_ seed-rerun-sends-nothing "$?"
node tests/seed.test.mjs restores-only-missing-and-rethreads; case_ seed-restores-only-missing "$?"
node tests/seed.test.mjs reply-carries-parent-id-and-attachment; case_ seed-reply-carries-parent-id "$?"
node tests/seed.test.mjs verify-fails-without-vectors; case_ seed-verify-fails-without-vectors "$?"
node tests/seed.test.mjs seed-refuses-reply-without-parent-id; case_ seed-refuses-unthreaded-reply "$?"

echo "@event suite {\"pass\":$pass,\"fail\":$fail,\"cases\":$((pass+fail))}"
[ "$fail" -eq 0 ]
