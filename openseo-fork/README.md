# OpenSEO fork work — AI Search Signals

Custom work for the self-hosted OpenSEO deployment at
`https://open-seo-selfhost.bryan-554.workers.dev`.

Upstream: https://github.com/every-app/open-seo (currently v0.1.13)

These patches live here because the cloud session's container is ephemeral —
it has already been recycled once, taking the working tree with it. This is a
holding pen, not the intended home. See "Repo decision" below.

## Applying the patches

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
git checkout -b fork/ai-search-signals
git am ../feb-april2026/openseo-fork/patches/*.patch
pnpm install
```

## Repo decision (needs Bryan)

No fork exists yet. Recommendation: a **private GitHub repo** with
`every-app/open-seo` added as an `upstream` remote. Updates stay
`git merge upstream/main`; the code stays private. A true GitHub fork of a
public repo is forced public. The self-hosted `git.peninsulaindustries.com`
is reachable but sits outside this session's GitHub tooling.

## Status

See `PLAN.md`.
