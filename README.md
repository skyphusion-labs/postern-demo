# postern-demo

Deploys the public [postern](https://github.com/skyphusion-labs/postern) demo at
<https://demo.posternonline.com> (apex and `www` redirect to it).

This repo holds no product code. It pins a postern release and carries the demo's Worker config.
Cloudflare Workers Builds builds and deploys it on every push to `main`.

## How a deploy works

1. **Build command:** `npm run build`. This runs `scripts/fetch.sh`. The script downloads the tag in
   `POSTERN_VERSION` from GitHub into `./postern`. It checks that the tarball's
   `inbound/package.json` version equals the pin, then runs `npm ci` in `postern/inbound`.
2. **Deploy command:** `npm run deploy`. This runs `scripts/deploy.sh`, in the same order as
   postern's own deploy: list pending D1 migrations, classify them with the release's
   `.github/scripts/d1-migration-gate.mjs` (additive shapes apply; a destructive or unknown shape
   fails the deploy before the database is touched), apply them, then `wrangler deploy`.

## Upgrade the demo

1. Open a PR that changes `POSTERN_VERSION` to the new tag (for example `v1.9.0`).
2. If the new release adds a binding or a var, add it to `wrangler.jsonc` in the same PR. Compare
   with `inbound/wrangler.jsonc` at that tag.
3. Merge. Workers Builds deploys `main`.
4. Verify: `curl -sS https://demo.posternonline.com/health` reports the new version.

## Roll back

Revert the PR that moved `POSTERN_VERSION` and merge the revert. A D1 migration does not roll back.
Read the release notes before you pin an older version over a newer schema.

## Rules

- `keep_vars` is `false`. Every var lives in `wrangler.jsonc`, not in the dashboard.
- Secrets (`POSTERN_API_TOKEN_READ`) are Worker secrets. They never go in this repo. `wrangler
  deploy` keeps them.
- The ids in `wrangler.jsonc` are resource identifiers, not credentials.

## Check locally

```
npm install
npm run check   # fetch the pin and run a wrangler dry run, no deploy
```

## Licence

AGPL-3.0, the same as postern.
