#!/usr/bin/env bash
# The whole suite. Each case prints "@event case {...}"; the run ends with a count that the
# coverage job asserts, so a suite that silently skips cases goes red.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
pass=0; fail=0
case_() { if [ "$2" = 0 ]; then pass=$((pass+1)); r=pass; else fail=$((fail+1)); r=fail; fi; echo "@event case {\"name\":\"$1\",\"result\":\"$r\"}"; }

# 1. fetch.sh refuses a pin that is not a vX.Y.Z tag.
pvbak="$(mktemp)"
cp POSTERN_VERSION "$pvbak"
echo latest > POSTERN_VERSION
bash scripts/fetch.sh >/dev/null 2>&1; rc=$?
cp "$pvbak" POSTERN_VERSION; rm -f "$pvbak"
[ "$rc" -ne 0 ]; case_ refuses-non-semver-pin $?

# 2. fetch.sh fetches the pin and the tarball version equals it.
bash scripts/fetch.sh >/dev/null; case_ fetches-pinned-release $?

# 3. Config parity against the pinned release.
node tests/parity.mjs; case_ config-parity $?

# 4. A wrangler dry run bundles the Worker with this config.
npx wrangler deploy --dry-run --outdir .wrangler/dry >/dev/null 2>&1; case_ dry-run-bundles $?

echo "@event suite {\"pass\":$pass,\"fail\":$fail,\"cases\":$((pass+fail))}"
[ "$fail" -eq 0 ]
