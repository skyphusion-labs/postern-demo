#!/usr/bin/env bash
# Workers Builds deploy command. Same order as postern's own deploy.yml (#112):
# list pending D1 migrations, classify them with the release's d1-migration-gate.mjs
# (additive auto-applies; destructive or unknown FAILS before the store is touched),
# apply, then deploy. Run after scripts/fetch.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f postern/.github/scripts/d1-migration-gate.mjs ] || { echo "gate script missing from the fetched release; run npm run build first" >&2; exit 1; }
pending="$(mktemp)"
trap 'rm -f "$pending"' EXIT
npx wrangler d1 migrations list DB --remote > "$pending"
cat "$pending"
node postern/.github/scripts/d1-migration-gate.mjs postern/inbound/migrations < "$pending"
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
