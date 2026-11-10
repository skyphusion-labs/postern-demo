#!/usr/bin/env bash
# Deploy command. Same order as postern's own deploy.yml (#112, #418): list pending D1
# migrations, classify them with the release's d1-migration-gate.mjs (additive auto-applies;
# destructive or unknown FAILS before the store is touched), apply, deploy, then verify the
# ARTIFACT: the version id wrangler just uploaded must be the one serving production
# (verify-worker-deployment.mjs over `wrangler deployments status --json`). Run after fetch.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in d1-migration-gate.mjs verify-worker-deployment.mjs; do
  [ -f "postern/.github/scripts/$f" ] || { echo "$f missing from the fetched release; run npm run build first" >&2; exit 1; }
done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
npx wrangler d1 migrations list DB --remote > "$work/pending.txt"
cat "$work/pending.txt"
node postern/.github/scripts/d1-migration-gate.mjs postern/inbound/migrations < "$work/pending.txt"
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy | tee "$work/deploy.out"
version_id="$(sed 's/\x1b\[[0-9;]*m//g' "$work/deploy.out" | sed -n 's/.*Current Version ID:[[:space:]]*\([0-9a-fA-F-]\{36\}\).*/\1/p' | head -1)"
[ -n "$version_id" ] || { echo "no Current Version ID in wrangler deploy output; cannot verify the artifact" >&2; exit 1; }
echo "uploaded version: $version_id"
npx wrangler deployments status --json > "$work/deployment.json"
node postern/.github/scripts/verify-worker-deployment.mjs "$work/deployment.json" "$version_id"
echo "@event deployed {\"version_id\":\"$version_id\"}"
