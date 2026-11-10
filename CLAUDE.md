# postern-demo

Deploy repo for the public postern demo. Read README.md; it is the contract.

- No product code here. Change postern in skyphusion-labs/postern, release it, then move
  `POSTERN_VERSION` here by PR.
- Workers Builds deploys `main`. Never `wrangler deploy` by hand except to recover a broken build,
  and record it in an issue if you do.
- `keep_vars: false`: every var is in `wrangler.jsonc`. Secrets stay Worker secrets.
- Verify a deploy by `GET /health` reporting the pinned version.
