/**
 * Weekly export of Bing Webmaster "AI Performance" data for every site listed
 * in sites.json.
 *
 * Why this runs on your PC and not in the OpenSEO app: Bing's published
 * Webmaster API has no method for AI Performance. The web app reads it from
 * bing.com/webmasters/api/aiperformance/*, which authenticates with a session
 * cookie plus a CSRF token, so only a logged-in browser can call it. This
 * script reuses a browser profile you logged into yourself — it never
 * automates a sign-in and never stores a password.
 *
 * First run opens a visible browser so you can sign in once. The profile is
 * saved next to this script, so later runs reuse that session and need no
 * input. When the session eventually expires, the script says so and you sign
 * in again with `node export.mjs --login`.
 */

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(HERE, ".browser-profile");
const OUT_DIR = join(HERE, "exports");
const BASE = "https://www.bing.com/webmasters";
const PAGE_SIZE = 100;
/** Bing's own UI caps the window at 3 months. */
const WINDOW_DAYS = 90;

const wantsLogin = process.argv.includes("--login");

/** Bing expects RFC-1123 UTC, exactly as its own web app sends. */
const stamp = (date) => date.toUTCString().replace("GMT", "GMT");

function dateRange() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const begin = new Date(end);
  begin.setUTCDate(begin.getUTCDate() - WINDOW_DAYS);
  return { BeginTimeStamp: stamp(begin), EndTimeStamp: stamp(end) };
}

/**
 * Pulls every page of one endpoint from inside the tab, so the session cookie
 * and same-origin rules apply exactly as they do for the app itself.
 */
async function pullAll(page, { path, key, siteUrl, csrf, range }) {
  return page.evaluate(
    async ({ path, key, siteUrl, csrf, range, pageSize }) => {
      const rows = [];
      let reportedTotal = null;
      for (let pageNum = 1; pageNum <= 100; pageNum++) {
        const response = await fetch(
          `https://www.bing.com/webmasters/api/aiperformance/${path}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json;charset=UTF-8",
              "x-csrf-token": csrf,
            },
            body: JSON.stringify({
              SiteUrl: siteUrl,
              DateRange: range,
              Pagination: { PageNum: pageNum, PageSize: pageSize },
              SortParameters: { SortField: "Citations", SortOrder: "Desc" },
              AIFilterKeyword: "",
              Query: "",
              Page: "",
            }),
          },
        );
        if (!response.ok) {
          return { error: `${path} returned HTTP ${response.status}` };
        }
        const body = await response.json();
        const batch = body[key] ?? [];
        reportedTotal = body.TotalNumOfRecords ?? reportedTotal;
        rows.push(...batch);
        if (batch.length === 0) break;
        if (reportedTotal !== null && rows.length >= reportedTotal) break;
      }
      return { rows, reportedTotal };
    },
    { path, key, siteUrl, csrf, range, pageSize: PAGE_SIZE },
  );
}

async function main() {
  const sites = JSON.parse(await readFile(join(HERE, "sites.json"), "utf8"));
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new Error("sites.json must be a non-empty array of site URLs.");
  }
  await mkdir(OUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !wantsLogin,
    viewport: { width: 1400, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  // The app sends the CSRF token on its own calls; capturing one is more
  // reliable than guessing where the page keeps it.
  let csrf = null;
  page.on("request", (request) => {
    const token = request.headers()["x-csrf-token"];
    if (token) csrf = token;
  });

  const first = encodeURIComponent(sites[0]);
  await page.goto(`${BASE}/aiperformance?siteUrl=${first}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  if (wantsLogin) {
    console.log("Sign in to Bing Webmaster Tools, then press Enter here.");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await page.goto(`${BASE}/aiperformance?siteUrl=${first}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
  }

  if (!csrf) {
    await context.close();
    throw new Error(
      "No CSRF token seen — the session has probably expired. Run: node export.mjs --login",
    );
  }

  const range = dateRange();
  const runStartedAt = new Date().toISOString();
  const failures = [];

  for (const siteUrl of sites) {
    await page.goto(`${BASE}/aiperformance?siteUrl=${encodeURIComponent(siteUrl)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const queries = await pullAll(page, {
      path: "searchqueries/stats",
      key: "Queries",
      siteUrl,
      csrf,
      range,
    });
    const pages = await pullAll(page, {
      path: "pages/stats",
      key: "Pages",
      siteUrl,
      csrf,
      range,
    });

    if (queries.error || pages.error) {
      const reason = queries.error ?? pages.error;
      failures.push(`${siteUrl}: ${reason}`);
      console.error(`FAIL ${siteUrl} — ${reason}`);
      continue;
    }

    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    const file = join(OUT_DIR, `${host}.json`);
    await writeFile(
      file,
      JSON.stringify(
        {
          site: siteUrl,
          exportedAt: runStartedAt,
          range,
          queries: queries.rows,
          pages: pages.rows,
        },
        null,
        2,
      ),
    );
    console.log(
      `OK   ${host} — ${queries.rows.length} queries, ${pages.rows.length} pages`,
    );
  }

  await context.close();

  if (failures.length > 0) {
    // Exit non-zero so Task Scheduler shows the run as failed rather than
    // leaving silently stale exports that look current.
    console.error(`\n${failures.length} site(s) failed:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`\nDone. Files written to ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
