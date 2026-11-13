# postern-demo

Deploys the public [postern](https://github.com/skyphusion-labs/postern) demo at
<https://demo.posternonline.com> (apex and `www` redirect to it).

This repo holds no product code. It pins a postern release and carries the demo's Worker config.
GitHub Actions deploys it on every push to `main`, after `ci` and `coverage` pass on that commit
(`deploy` job in `.github/workflows/ci.yml`). PRs never deploy.

## How a deploy works

1. **Build command:** `npm run build`. This runs `scripts/fetch.sh`. The script downloads the tag in
   `POSTERN_VERSION` from GitHub into `./postern`. It checks that the tarball's
   `inbound/package.json` version equals the pin, then runs `npm ci` in `postern/inbound`.
2. **Deploy command:** `npm run deploy`. This runs `scripts/deploy.sh`, in the same order as
   postern's own deploy: list pending D1 migrations, classify them with the release's
   `.github/scripts/d1-migration-gate.mjs` (additive shapes apply; a destructive or unknown shape
   fails the deploy before the database is touched), apply them, then `wrangler deploy`.

## Upgrade the demo

1. Open a PR that changes `POSTERN_VERSION` to the new tag (for example `v1.9.0`) AND
   `POSTERN_COMMIT` to the full 40-character sha that tag points at
   (`git ls-remote https://github.com/skyphusion-labs/postern.git 'refs/tags/v1.9.0^{}'`; the
   `^{}` line is the COMMIT; the plain tag line of an annotated tag is the tag object). The
   build fails if the two disagree, so change both in the same PR.
2. If the new release adds a binding or a var, add it to `wrangler.jsonc` in the same PR. Compare
   with `inbound/wrangler.jsonc` at that tag.
3. Merge. The `deploy` job deploys `main` and fails unless `/health` reports the new version.
4. Check by hand if you like: `curl -sS https://demo.posternonline.com/health`.

## Daily version check

`version-check.yml` runs daily (08:37 UTC) and by hand. It goes red while `POSTERN_VERSION` is not
the latest postern release (`scripts/version-check.mjs`): the highest published `vX.Y.Z`, never a
draft, a prerelease or a `postern-mcp-v*` release. A red run means: upgrade the demo (above). A
release list it cannot read exits 2, which is a failure, not a quiet day. It is not a pull_request
check, so a new postern release never blocks an unrelated demo PR.

## Roll back

The pin is two files, `POSTERN_VERSION` (the tag) and `POSTERN_COMMIT` (its sha). A rollback
moves BOTH back, or `scripts/fetch.sh` refuses the build (`tag ... is at ..., pin is ...`).

1. Revert the upgrade PR and merge the revert. The revert restores both files, because the
   upgrade PR changed both.
2. To roll back to a release other than the previous one, open a PR that sets
   `POSTERN_VERSION` to that tag and `POSTERN_COMMIT` to the PEELED commit of that tag: the
   `^{}` line of `git ls-remote https://github.com/skyphusion-labs/postern.git 'refs/tags/<tag>^{}'`,
   never the plain tag line (that is the tag object, and `scripts/fetch.sh` refuses it).
3. Check that `/health` reports the older version after the deploy job finishes.

A D1 migration does not roll back. Read the release notes before you pin an older version
over a newer schema.

## Demo mail

The demo mailbox holds a small, synthetic seed set: 30 messages in 14 threads, defined in
`seed/corpus.mjs`. It has an 8-message thread, a support ticket with replies, an agent's
digests, an invoice with a PDF, a newsletter, a calendar invite with an `.ics` file, account
notices, an agent-to-agent handoff with a Markdown file, and a shipping notice. All people,
companies, orders and codes in it are invented. Every message ends with a line that says so.

**How it gets there: the real inbound path, never a database insert.** The `seed` workflow
(`.github/workflows/seed.yml`) runs `scripts/seed.mjs send`. The script sends each message
with the Cloudflare Email Sending REST API to an address on `posternonline.com`. Every message
is sent from `demo-seed@skyphusion.org`, because `posternonline.com` is not onboarded to Email
Sending and onboarding it would write new DNS to the demo zone. Each message carries its
persona's display name (for example "Example Cloud Billing"), and Reply-To is that persona's
`posternonline.com` address, so a reply stays inside the demo. Email Routing
delivers it to the demo Worker's `email()` handler, and ingest, threading, FTS and Vectorize run
exactly as they do for any sender. The REST API does not return the Message-ID it generates. So
after each send the script reads the mailbox through the demo's read API until the message
appears. That readback proves the message was stored, and it supplies the stored Message-ID
that a reply puts in `In-Reply-To`. Threads are built by postern's own thread resolution.

**When it runs.**

- By hand: Actions, `seed`, Run workflow. `send` (the default) sends what is missing and then
  verifies. `check` reports only. `verify` asserts only.
- Weekly, Mondays 06:17 UTC. The script is idempotent. It skips a message that is already
  stored (same subject from `demo-seed@skyphusion.org`, counted in order), so the weekly run sends nothing
  unless the set was removed. The demo token is read-scoped, so visitors cannot delete mail.
  The weekly run exists to restore the set after an operator wipe, and it costs one mailbox
  read a week. It never deletes anything. The statement that nothing deletes demo
  mail automatically (postern PRIVACY.md) still holds.
- GitHub disables a scheduled workflow after 60 days without repository activity. If the
  weekly run stops, re-enable it in the Actions tab.

**What `verify` asserts** (it fails the run otherwise): every corpus message is present, every
reply shares its parent's thread id, FTS search for `lifecycle` returns a hit, and a semantic
search returns a hit (so Vectorize holds vectors).

**Secrets** (repository secrets, never in this repo):

- `CF_EMAIL_SEND_TOKEN`: Cloudflare token `postern-demo-seed`, account-scoped Email Sending
  Write (Cloudflare offers no send-only or per-zone grant). Only the `send` step sees it.
- `POSTERN_DEMO_READ_TOKEN`: the demo's public read token, the one published in the postern
  README.

**Change the seed set.** Edit `seed/corpus.mjs`. `npm test` validates it: 20 to 40 messages,
unique keys, a parent always comes before its reply, every persona and recipient address is on `posternonline.com`,
and there are no em-dashes or en-dashes. A new message is sent on the next run. To replace an
existing message, bump `SEED_VERSION` and change its subject; the old copy stays in the
mailbox until an operator removes it.

## Rules

- `keep_vars` is `false`. Every var lives in `wrangler.jsonc`, not in the dashboard.
- Secrets (`POSTERN_API_TOKEN_READ`) are Worker secrets. They never go in this repo. `wrangler
  deploy` keeps them.
- The deploy credential is the repo secret `CLOUDFLARE_API_TOKEN`: a Cloudflare token scoped to
  this account's Workers Scripts, D1, R2 and Vectorize read, and Workers Routes on
  posternonline.com.
- The ids in `wrangler.jsonc` are resource identifiers, not credentials.

## Check locally

```
npm install
npm run check   # fetch the pin and run a wrangler dry run, no deploy
```

## Licence

AGPL-3.0, the same as postern.
