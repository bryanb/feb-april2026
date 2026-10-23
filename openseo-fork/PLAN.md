# AI Search Signals — plan and status

Goal: answer "where do we show up in AI-driven search" for the agency's
client projects, inside the self-hosted OpenSEO app.

Base: upstream open-seo v0.1.13. Deployed at
`https://open-seo-selfhost.bryan-554.workers.dev`.

---

## The constraint everything is built around

Google exposes **no AI data** through the Search Console API. Verified against
Google's own API reference, not blog posts:

- `type` accepts only web, image, video, news, googleNews, discover.
- There is no AI-related `searchAppearance` value.
- The Generative AI performance report (June 2026) is UI-only, impressions
  only, no query detail, not in the API and not in the BigQuery export.
- AI Overview and AI Mode impressions are blended into ordinary web search.

So Search Console evidence is **inferred from query text**, and the UI must
never present it as measurement. GA4 referral data **is** measured, which is
why the page keeps the two halves visibly apart.

Bryan's regex returned **135 matches** across properties, which is what
justified building rather than waiting.

---

## Shipped and deployed

### 1. Regex filter operators (commit 1)

Google supports `includingRegex` / `excludingRegex` (RE2); the app never
exposed them. Now in the Search Performance query/page match dropdown as
"Matches regex" / "Excludes regex", and in the `get_search_console_performance`
MCP tool automatically (its Zod schema derives from the same list).

Use this pattern to find machine-shaped queries by hand:

```
["""]|\*\*|`|-site:|^\+|^%|\[[^\]]+\]\(
```

### 2. Signal classifiers (commit 2)

- `src/shared/ai-query-signals.ts` — scores query **syntax**, not length:
  quotes, markdown bold/backticks/links/blocks, search operators, exclusions,
  and bare conversational fragments. Length is displayed but never scored,
  because assistant queries are frequently *short* (AI Mode logs follow-ups
  like "yes" as fresh searches) and length flags ordinary long-tail.
  Patterns stay inside the RE2 ∩ JS subset; a test enforces that, and other
  tests assert real industrial queries do **not** match.
- `src/shared/ai-referrers.ts` — maps GA4 `sessionSource` to an assistant,
  reusing the existing `AiEngine` ids so AI Visibility labels/icons apply.

### 3. GA4 AI referral service (commit 2)

`Ga4AiReferralService` — four `runReport` calls: sources, previous period,
daily trend, landing pages. Filters at Google on a source regex rather than
post-filtering, so large properties don't need paging. Rolls multiple hosts
of one assistant (chatgpt.com + chat.openai.com) into a single engine row,
recomputing engagement rate rather than summing a ratio.

### 4. AI Search Signals page (commit 3)

Route: `/p/$projectId/ai-search-signals`, in the sidebar under **AI Visibility**.

- **Measured: visits from AI assistants** — sessions, period-over-period
  change, per-assistant table, and the landing pages they send people to.
  States plainly that it undercounts because referrer-stripping apps land in
  Direct.
- **Inferred: machine-shaped Search Console queries** — matched impressions,
  share of all impressions, and the query table with per-signal badges.
  Verdicts read "Likely machine" / "Possible", never "AI". The regex is
  printed under the table and deep-links into Search Performance.

Verification: 1625 tests pass, typecheck clean, prettier clean, knip clean,
oxlint clean (repo's own `ci:check` gates).

---

## What needs Bryan

1. **Repo decision.** No fork exists; these patches are a holding pen.
   Recommendation: a **private GitHub repo** with `every-app/open-seo` as an
   `upstream` remote — same `git merge upstream/main` ergonomics, code stays
   private. A true GitHub fork of a public repo is forced public.
   `git.peninsulaindustries.com` is reachable but outside the session's
   GitHub tooling.
2. **Look at the page** and say what's wrong with the UI direction.
3. **Upstream contributions?** The regex operators are a clean, neutral PR to
   upstream and would take the divergence on that commit to zero. The GA4
   referral service is also a plausible upstream fixed report.

---

## Not built, and why

- **Click-suppression / CTR-anomaly analysis** — explicitly rejected.
- **MCP tool for these signals** — deliberately deferred. It would be ~2
  hours, but it is only usable once Managed OAuth on Cloudflare Access is
  confirmed working, which it is not. The UI needs nothing.
- **Snapshot storage for long-term baselines** — deferred on evidence. The
  planning pass found the urgency lower than assumed: the regex filter and
  the `date` dimension work together, so "impressions on machine-shaped
  queries per day" is retroactively computable across Google's full 16-month
  window. What genuinely *cannot* be backfilled is which pages AI engines
  cite for tracked prompts — that only exists once an AI Visibility tracker
  runs. **Switching on weekly AI Visibility tracking for the six clients is
  the higher-value "start measuring now" move, and needs no code.**
- **Cited-pages cross-reference** (pages that rank vs pages AI engines cite)
  — a strong next feature; `ai_sources` already stores cited URL and domain.

---

## Corrections to earlier assumptions

The planning pass contradicted three things I had told Bryan:

- GSC query data **is** cached — `DashboardSiteService` pulls 25,000 query
  rows and caches them in R2 for 90 days. A classification sweep over the
  full set costs no extra Google calls.
- The 1000-row cap is **not** service-level. `GscService.getPerformance`
  passes any explicit `rowLimit` up to 25,000; the cap lives in the MCP tool
  and the Search Performance server functions only.
- Baseline urgency was overstated for GSC, per the storage note above.

---

## Bing: researched, recommendation is **don't build** (Oct 2026)

### What Bing has

**AI Performance** report in Bing Webmaster Tools (public preview Feb 2026,
expanded Jun and Oct 2026). Genuinely the best first-party AI data any search
engine gives site owners: total citations, cited pages, *grounding queries*
(the phrases the AI used when retrieving your content), citation share, and
intent/topic classification. Covers Copilot, Bing AI summaries, and
unnamed "select partner integrations".

### Why it does not help us

1. **UI-only. There is no API.** The Bing Webmaster API method list contains
   nothing for citations or grounding queries; a Microsoft Q&A thread (Feb
   2026) and third-party guides through Oct 2026 confirm it. Export is manual
   CSV. This is the exact failure mode we hit with Google's generative AI
   report — unusable across 27 properties.
2. **No clicks, no per-surface split.** Microsoft states the report "does not
   represent traffic, clicks, or user engagement", queries are a *sample*,
   and you cannot separate Copilot from Bing summaries from partners. Even
   with an API you could not tell a client "this is your Copilot number".
3. **Bing is no longer a good ChatGPT proxy.** This corrects my earlier
   framing. Independent 2026 measurement (RESONEO via Search Engine Land,
   Peec AI) reading ChatGPT's own `result_source` field found consumer
   retrieval runs on OpenAI's own index plus scraped Google, with Bing absent
   from captures; Bing appears mainly on Team/Enterprise/Edu accounts and
   Deep Research. OpenAI's help docs now name Bing only for Enterprise/Edu.

### What Bing API *can* give (not AI-specific)

A second first-party clicks/impressions/position series per query and page
(`GetQueryStats`, `GetPageStats`), daily site totals that silently include
Copilot/chat traffic (`GetRankAndTrafficStats`, blended since Sept 2023 with
no way to isolate it), Bingbot crawl/index status, and backlinks. Auth is a
single API key covering every verified site. Roughly a day or two of work —
scope it as an ordinary "Bing Search Performance" source, never as an AI
feature.

For industrial B2B this is marginal but not zero: Edge/Windows default search
in manufacturing offices is real traffic.

### IndexNow

Push protocol (Bing, Yandex, Naver, Seznam, Yep — **not** Google, and not
ChatGPT/Claude/Perplexity). Microsoft positions it as improving freshness in
Copilot answers. **Cloudflare can enable it with a zero-code toggle**
(Crawler Hints), which is the cheapest version for any client site already on
Cloudflare. It is crawl hygiene, not an AI-visibility lever, and produces no
measurement data.

### Also worth knowing

Bing has **no AI-crawler traffic reporting** — nothing showing GPTBot,
ClaudeBot or PerplexityBot hitting a site. Cloudflare's own bot analytics is
the right source for that, and is a more promising direction than Bing.

### Revisit when

Microsoft ships an AI Performance API — watch blogs.bing.com/webmaster and
the `IWebmasterApi` method list for a citations/grounding method, or a "Chat"
breakdown in `GetRankAndTrafficStats`. They have shipped AI Performance
features every 2-3 months, so it is plausible, but there is no commitment.
