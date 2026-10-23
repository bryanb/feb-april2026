# Bing AI Performance — weekly export

Downloads **grounding queries** (the phrases an AI used when it retrieved and
cited your pages) and **cited pages** for every client site, once a week, on
your PC.

## Why it runs here and not in OpenSEO

Bing's published Webmaster API has no method for AI Performance — verified
against Microsoft's own method reference. The web app reads it from
`bing.com/webmasters/api/aiperformance/*`, which authenticates with a session
cookie and a CSRF token. Only a logged-in browser can call it, so the cloud
app cannot.

This script reuses a browser profile **you** signed into. It never automates a
sign-in and never stores a password — which is also what keeps it clear of the
bot-detection problems that come with scripted Google logins.

One caveat, stated once: those endpoints are internal to Bing's web app, not a
published API. Reading your own data from your own account this way is a grey
area in Microsoft's terms, and the endpoints can change without notice. The
script fails loudly rather than writing empty files, so a break is visible
rather than silently producing stale exports.

## Setup (once)

Needs Node 18+.

```powershell
cd bing-ai-export
npm install
npx playwright install chromium
```

Put your client sites in `sites.json`, exactly as Bing lists them — the
trailing slash matters:

```json
[
  "https://www.axiomatic.com/",
  "https://www.hoggeprecision.com/"
]
```

Then sign in once. A browser window opens; log into Bing Webmaster Tools, come
back to the terminal and press Enter:

```powershell
npm run login
```

The session is saved in `.browser-profile/` (git-ignored) and reused from then
on.

## Running it

```powershell
npm run export
```

Writes one file per site to `exports/`, named by hostname. Each contains the
grounding queries and cited pages for the last 90 days.

## Weekly schedule (Windows Task Scheduler)

1. Open Task Scheduler, **Create Task** (not Basic Task).
2. General: give it a name, tick **Run whether user is logged on or not**.
3. Triggers: New, Weekly, pick a day and time.
4. Actions: New, Start a program.
   - Program: `node`
   - Arguments: `export.mjs`
   - Start in: the full path to this folder
5. Settings: tick **Run task as soon as possible after a scheduled start is
   missed**.

The script exits non-zero if any site fails, so Task Scheduler's Last Run
Result column shows a problem instead of hiding it.

## Getting the data into OpenSEO

Open a project, go to **AI Search Signals**, and paste the contents of that
site's export file into the Bing section. You get the grounding queries with
citation counts, intent and citation rate, with checkboxes to add the ones
worth watching as tracked AI Visibility prompts.

## When the session expires

Bing sessions don't last forever. The script stops with a clear message; run
`npm run login` again and sign in.
