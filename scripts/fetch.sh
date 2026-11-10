#!/usr/bin/env bash
# Fetch the pinned postern release into ./postern and install the inbound Worker's deps.
# The pin is BOTH the tag (POSTERN_VERSION) and its commit (POSTERN_COMMIT): a moved or
# re-pointed tag fails here, before any code from it runs with deploy credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
ver="$(tr -d '[:space:]' < POSTERN_VERSION)"
want_commit="$(tr -d '[:space:]' < POSTERN_COMMIT)"
case "$ver" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "POSTERN_VERSION is not a vX.Y.Z tag: '$ver'" >&2; exit 1 ;; esac
case "$want_commit" in *[!0-9a-f]*|"") echo "POSTERN_COMMIT is not a full commit sha: '$want_commit'" >&2; exit 1 ;; esac
[ "${#want_commit}" -eq 40 ] || { echo "POSTERN_COMMIT must be 40 hex characters" >&2; exit 1; }
rm -rf postern
git -c advice.detachedHead=false clone -q --depth 1 --branch "$ver" https://github.com/skyphusion-labs/postern.git postern
got_commit="$(git -C postern rev-parse HEAD)"
[ "$got_commit" = "$want_commit" ] || { echo "tag $ver is at $got_commit, pin is $want_commit" >&2; exit 1; }
rm -rf postern/.git
want="${ver#v}"
got="$(node -p 'require("./postern/inbound/package.json").version')"
[ "$got" = "$want" ] || { echo "release inbound version $got != pin $want" >&2; exit 1; }
(cd postern/inbound && npm ci --no-audit --no-fund)
echo "@event fetched {\"postern\":\"$ver\",\"commit\":\"$got_commit\"}"
