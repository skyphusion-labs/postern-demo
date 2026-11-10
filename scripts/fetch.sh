#!/usr/bin/env bash
# Fetch the pinned postern release into ./postern and install the inbound Worker's deps.
# Workers Builds runs this as the build command; wrangler.jsonc points into ./postern.
set -euo pipefail
cd "$(dirname "$0")/.."
ver="$(tr -d '[:space:]' < POSTERN_VERSION)"
case "$ver" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "POSTERN_VERSION is not a vX.Y.Z tag: '$ver'" >&2; exit 1 ;; esac
rm -rf postern
mkdir postern
curl -fsSL "https://github.com/skyphusion-labs/postern/archive/refs/tags/${ver}.tar.gz" -o postern.tar.gz
tar -xzf postern.tar.gz -C postern --strip-components=1
rm -f postern.tar.gz
want="${ver#v}"
got="$(node -p 'require("./postern/inbound/package.json").version')"
[ "$got" = "$want" ] || { echo "tarball inbound version $got != pin $want" >&2; exit 1; }
(cd postern/inbound && npm ci --no-audit --no-fund)
echo "@event fetched {\"postern\":\"$ver\"}"
