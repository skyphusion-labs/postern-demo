# postern-demo

This file is the guide for any coding agent and any contributor. Follow it.

## What this project is

This repo deploys the public Postern demo.
The demo is [https://demo.posternonline.com](https://demo.posternonline.com).
There is no product code here.
Change Postern in [postern](https://github.com/skyphusion-labs/postern), release it, then move the pin here.
[README.md](README.md) is the deploy contract.
Follow it.

## How a change ships

`POSTERN_VERSION` is the Postern tag.
`POSTERN_COMMIT` is the commit that tag points at.
Change both in the same pull request.
The build fails if they disagree.

`npm run build` downloads that tag and installs the inbound Worker.
`npm run deploy` applies safe D1 migrations, then runs Wrangler.
A destructive or unknown migration fails before the database changes.
See [README.md](README.md) for the order.

GitHub Actions deploys `main` after `ci` and `coverage` pass.
The deploy job is in [.github/workflows/ci.yml](.github/workflows/ci.yml).
A pull request does not deploy.
Do not run `wrangler deploy` by hand to ship a normal change.
If you must recover a broken deploy, record that in an issue.

`keep_vars` is false.
Every var lives in `wrangler.jsonc`.
Worker secrets stay Worker secrets.
They are not in git.
Deploy credentials are repository secrets.
[README.md](README.md) names them.

## How to check

```bash
npm install
npm test
npm run check
```

`npm run check` is a dry-run deploy.
After a real deploy, `GET /health` must report the pinned version.
You can also run `curl -sS https://demo.posternonline.com/health`.

[.github/workflows/version-check.yml](.github/workflows/version-check.yml) goes red while the pin is behind the latest Postern `v*` release.
It ignores `postern-mcp-v*` tags.
A red run means: upgrade the demo.
The steps are in [README.md](README.md).

The seed corpus and the seed workflow are in [README.md](README.md).
The seed sends real mail into the demo.
It does not insert rows by hand.

## Docs

Write Simplified Technical English.
Use short sentences.
Use one idea per sentence.
Use the active present tense.
Use plain words.
Use the same word every time.

Do not use an em dash (U+2014) or an en dash (U+2013).
Use a comma, a semicolon, parentheses, or two hyphens (`--`).

State the limit next to the capability.
Do not turn a measured result into a promise.

Use Conventional Commits.
The body says why.

## Safety

Do not put a secret in a tracked file.
Do not put a secret in a log.
Do not put a secret in an issue.
Resource ids in `wrangler.jsonc` are not credentials.
A D1 migration does not roll back.
Read the Postern release notes before you pin an older version.
