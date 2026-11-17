# Coordinates, not IP, pin Google's local pack

For Google mobile local results, the location that matters is the coordinate Google receives with the search. You can send it two ways. One is a `uule` URL parameter (or cookie). The other is a browser geolocation override with the geolocation permission granted to google.com. Either one overrides the city Google would otherwise guess from your IP. So the tester's claim that "the IP isn't as important as the browser information" is **largely correct, if "browser information" means precise coordinates**. It is **wrong if it means timezone, locale, Accept-Language or user-agent**: no source shows those moving the local pack. They matter only because a mismatch makes Google and other anti-bot systems flag the session. IP still sets the default country and market, and it decides whether you get a CAPTCHA. Some vendors also claim it colors organic results, but nobody has published a controlled test. The practical recipe has five parts: a residential or mobile proxy in the target metro, a lat/lng `uule` on the search URL, a matching geolocation override with permission, a matching timezone and language, and a full Android profile, including Client Hints, applied before the first navigation. Then check the SERP footer to see which source Google actually used. Among Python tools, **pydoll 3's `apply_fingerprint` is the only one that does the full mobile profile in one call**. Playwright gets close with device descriptors. nodriver, zendriver, Selenium/undetected-chromedriver, SeleniumBase, botasaurus and DrissionPage all need raw CDP calls, shown below.

## Google ranks precise coordinates above the IP-derived city

Google's own help page names four location sources: precise device location, IP address, saved Home/Work places, and past activity. It is explicit that when browser and site permissions are granted, **"your precise location will be used by Google to show you the best search results"** ([Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)). IP is the fallback. By default Google estimates your approximate city from your IP address ([Google Search Help](https://support.google.com/websearch/answer/12412910?hl=en)), because IP addresses are only "roughly based on geography" ([Google Policies](https://policies.google.com/technologies/location-data?hl=en-US)). Google publishes no precedence rule. Putting the documented behavior together gives an inferred order: an explicit location in the request (uule, or the X-Geo header Chrome and the Google app send) comes first, then precise device location, then Home/Work, then past activity, then IP.

The strongest practical evidence comes from how commercial geo-grid trackers work. Whitespark says trackers pass a UULE that pins the search to a city, ZIP or coordinates, overriding device GPS and location settings ([Whitespark](https://whitespark.ca/blog/reported-versus-manual-rankings)). DataForSEO takes a `location_coordinate` and runs one task per grid point ([DataForSEO](https://dataforseo.com/help-center/build-grid-rank-tracker-maps)). Local Falcon scans "from the exact GPS points where searches happen" ([Local Falcon](https://www.localfalcon.com/features/local-rank-tracker)). **Geo-grid heatmaps change over a few hundred meters, a resolution no IP geolocation can provide.** If IP dominated, every cell in a sub-city grid would show the same ranks. Mobile depends even more on coordinates: BrightLocal notes that mobile local results lean more on real-time GPS proximity ([BrightLocal](https://www.brightlocal.com/tools/local-rank-tracker/)), while desktop without permission falls back to city-level IP ([GeoGrid.dev](https://geogrid.dev/blog/geo-location-rank-tracking)).

The counterclaims mostly come from proxy sellers. Some describe uule as "a weak signal that IP geolocation overrides", or say the exit IP "still shapes the page you get back" ([PXM2](https://pxm2.io/use-cases/business/mobile-proxy-seo-rank-tracking/), [IPBurger](https://www.ipburger.com/blog/how-to-track-local-seo-rankings-with-geo-targeted-residential-proxies/)), but they cite no method. The honest position is this. IP reliably controls three things: the country/market default, CAPTCHA and "unusual traffic" rates (datacenter IPs get blocked), and possibly some blending in organic results. It does not control which business ranks third in a map pack 2 km from the searcher.

Timezone, locale and Accept-Language fall into a different category. Accept-Language, `hl` and `gl` steer language and, to some degree, country. A Mozilla discussion describes Google choosing result language from Accept-Language plus GeoIP or a cookie ([Bugzilla 670450](https://bugzilla.mozilla.org/show_bug.cgi?id=670450)). Location-changer extensions treat these as language controls separate from uule ([valentin.app](https://valentin.app/gs-location-changer.html)). **No source, controlled or anecdotal, shows timezone changing the local pack.** What timezone and locale do affect is detection. Fingerprint checkers compare IP geolocation against timezone and language and flag mismatches ([BotCloud](https://botcloud-dev.pages.dev/blog/timezone-locale-configuration/)). Pydoll's README warns that a browser whose layers disagree "is more suspicious" than one with no spoofing at all ([pydoll](https://pypi.org/project/pydoll-python/)). One 2025 change shifts weight onto these parameters: Google began redirecting ccTLDs such as google.de to google.com around April 15, 2025, so `gl` now carries country targeting that the domain used to carry ([SerpApi release notes](https://serpapi.com/google-local-api/release-notes)).

## Three channels inject a location, and the footer tells you which one won

The **`uule` parameter** is the industry standard and still works in 2026. SerpApi was still shipping uule fixes in mid-2026, and nobody has announced a deprecation ([SerpApi release notes](https://serpapi.com/google-local-api/release-notes)). It comes in two formats. `w+CAIQICI...` encodes a canonical location name from Google Ads geotargets. `a+...` is base64 of a text payload with a `latlng` block holding `latitude_e7`/`longitude_e7` (coordinates times 10^7), which is the format grid trackers use ([SerpApi UULE Generator](https://serpapi.com/tools/uule-generator), [valentin.app UULE](https://valentin.app/uule.html)). Do not rely on `&near=`. It is undocumented and has broken intermittently for years ([Blumenthals](https://blumenthals.com/blog/?p=18834)).

The **browser geolocation override** is the second channel. With CDP you set `Emulation.setGeolocationOverride` and grant the `geolocation` permission for `https://www.google.com`. Google then treats the browser as having a precise device location. Two details matter. First, **the protocol says "Omitting latitude, longitude or accuracy emulates position unavailable"**, so always send `accuracy` ([devtools-protocol](https://www.npmjs.com/package/devtools-protocol)). Second, without the permission grant the page sees a prompt or a denial. That is the usual reason for reports like "Google Maps still shows my real location" ([StackOverflow mirror](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/64133356/python-selenium-override-geolocation-not-working)).

The **X-Geo header** is the third channel. Chrome on Android sends device location to Google domains in this header, only outside incognito mode and only with a fresh fix ([GeolocationHeader.java](https://github.com/crosswalk-project/chromium-crosswalk/blob/master/chrome/android/java/src/org/chromium/chrome/browser/omnibox/geo/GeolocationHeader.java)). The gslocation extension spoofs location by adding X-Geo to google.com requests and writing a UULE cookie ([gslocation](https://github.com/VorticonCmdr/gslocation)). You can do the same with `Network.setExtraHTTPHeaders`. The Chromium evidence is a decade old, though, so treat this channel as optional.

The SERP footer is your test harness. Google labels the source as **"From your device"** (precise location), **"Based on your places (Home/Work)"**, or **"From your internet address"** (IP) ([Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)). Google does not document what the footer shows for a uule request; anecdotally it shows the decoded place. To settle the tester's claim with data, run one query three ways from the same proxy: IP only, IP plus geolocation override, and IP plus uule. Record the footer label, the place name and the top three pack results each time. Use a fresh profile per location so NID cookies and past-activity signals do not carry over.

A small helper builds both uule formats. The `a+` field layout follows the commonly published form. Check your output against SerpApi's decoder once before using it in production.

```python
# uule.py
import base64

_KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

def uule_by_name(canonical_name: str) -> str:
    """Canonical-name format, e.g. 'Chicago,Illinois,United States' (Google Ads geotargets)."""
    raw = canonical_name.encode()
    return "w+CAIQICI" + _KEY[len(raw)] + base64.b64encode(raw).decode()

def uule_by_latlng(lat: float, lng: float, radius_m: int = 65000) -> str:
    """Lat/lng format used by geo-grid trackers."""
    text = (
        "role: CURRENT_LOCATION\n"
        "producer: DEVICE_LOCATION\n"
        f"radius: {radius_m}\n"
        "latlng <\n"
        f"  latitude_e7: {round(lat * 1e7)}\n"
        f"  longitude_e7: {round(lng * 1e7)}\n"
        ">"
    )
    return "a+" + base64.b64encode(text.encode()).decode()

def search_url(q: str, lat: float, lng: float, hl="en", gl="us") -> str:
    from urllib.parse import urlencode
    return "https://www.google.com/search?" + urlencode(
        {"q": q, "hl": hl, "gl": gl, "uule": uule_by_latlng(lat, lng)})
```

## A convincing phone needs Client Hints, touch and consistent workers

Mobile emulation is a set of CDP overrides, and the most commonly missed one is **Client Hints**. A UA string by itself leaves `navigator.userAgentData` and the `Sec-CH-UA-*` headers describing the desktop host. The protocol states that "`userAgentMetadata` must be set for Client Hint headers to be sent" ([devtools-protocol](https://www.npmjs.com/package/devtools-protocol)). The UA string also has to be the **reduced Android format**: `Mozilla/5.0 (Linux; Android 10; K) ... Chrome/<major>.0.0.0 Mobile Safari/537.36`. Since Chrome 113, real Android Chrome freezes the version and model to "Android 10; K" and exposes the real ones only through `Sec-CH-UA-Model` and `Sec-CH-UA-Platform-Version` ([Chrome for Developers](https://developer.chrome.com/blog/user-agent-reduction-android-model-and-version)). A spoofed UA that reads "Android 14; Pixel 7" is out of date for a current Chrome. Playwright's own Pixel descriptors still use that old form ([Playwright descriptors](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/deviceDescriptorsSource.json)). Keep the Chrome major version in the UA equal to the real binary's. If you leave `brands`/`fullVersionList` out of the metadata, Chrome fills them with its real values, which is usually what you want.

The full per-tab sequence, applied before navigation, is:

1. `Emulation.setUserAgentOverride`, with `acceptLanguage`, `platform` and full Android `userAgentMetadata` (`mobile: true`, a non-empty `model`, `formFactors: ["Mobile"]`).
2. `Emulation.setDeviceMetricsOverride`, for example 412x915 screen, 412x839 viewport, DPR 2.625, `mobile: true`.
3. `Emulation.setTouchEmulationEnabled` with `maxTouchPoints: 5`.
4. `Emulation.setTimezoneOverride`.
5. `Emulation.setLocaleOverride`.
6. `Emulation.setGeolocationOverride` with `accuracy`.

`Browser.setPermission` (or the deprecated `grantPermissions`) runs once per browser context. **The touch default is a giveaway.** `maxTouchPoints` defaults to 1, and both Puppeteer and Playwright send it that way, while real phones report 5 or more ([Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts)). Pydoll also measured that on Chrome 152, `maxTouchPoints` falls back to 0 about 100 ms after the first real navigation, so it re-sends touch emulation on every top-frame navigation ([pydoll fingerprint_applier.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/fingerprint_applier.py)). On Android, `navigator.platform` should read something like `Linux armv8l`, not `Linux x86_64` or `Win32`. That value comes from common knowledge of real devices, not a primary source, so check it on a real phone.

**Every `Emulation.*` override is per target.** New tabs, popups, out-of-process iframes and workers each start clean unless you reapply the overrides. Even Playwright reapplies only the UA to dedicated workers, not timezone or locale, and it detaches from service workers that appear under a page ([playwright-core](https://www.npmjs.com/package/playwright-core)). Detectors exploit exactly this: they start a Worker and compare its `navigator` and `Intl` values against the page's ([Castle](https://blog.castle.io/how-to-detect-headless-chrome-bots-instrumented-with-playwright/)). Two OS-level settings close part of the gap. Launching Chrome with `TZ=America/Chicago` in its environment sets the real baseline timezone for every renderer, including workers; this is standard POSIX/ICU behavior, not a documented Chromium guarantee. `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` stops WebRTC from revealing your real IP around the proxy ([WebRTC-Leak-Prevent](https://github.com/aghorler/WebRTC-Leak-Prevent/blob/master/DOCUMENTATION.md)). Use a separate `--user-data-dir` for each location persona.

Some things CDP cannot fake. **A desktop host still shows a desktop GPU** (ANGLE/NVIDIA or SwiftShader, where a phone reports Adreno or Mali), desktop fonts, and desktop audio and canvas hashes ([Castle on WebGL](https://blog.castle.io/the-role-of-webgl-renderer-in-browser-fingerprinting/)). For Google SERP localization this is probably acceptable, because the localization mainly reads coordinates, IP, the mobile flag and language rather than hard fingerprint scoring. But nobody has measured whether desktop-emulated, emulator and real-device sessions get different packs for the same coordinate. If you need certainty, a real Android phone driven over `adb forward tcp:9222 localabstract:chrome_devtools_remote` is fully genuine, and you override only geolocation and timezone ([Chrome DevTools remote debugging](https://developer.chrome.com/docs/devtools/remote-debugging)). Before trusting a profile, check it on Pixelscan (IP vs timezone/language), CreepJS (internal contradictions, including in workers) and BrowserLeaks /client-hints and /webrtc ([Octo Browser](https://blog.octobrowser.net/how-anonymity-checkers-pixelscan-browserleaks-whoer-and-creepjs-work)).

## Pydoll does it in one call; the other frameworks need raw CDP

All framework details below were read from the published source of each package as of November 17, 2026. None of it has been run against a live browser yet, so do one footer test before trusting any of it.

| Package (version) | Geolocation + permission | Full Android Client Hints | Workers/OOPIFs covered | Proxy auth |
|---|---|---|---|---|
| pydoll-python 3.0.1 | `apply_fingerprint` or raw CDP | Yes, automatic | Yes | Yes, per context |
| playwright 1.65.2 / patchright / rebrowser | context options | Partial (no model, no brands) | Partly, context-wide for pages | Yes |
| zendriver 0.17.1 / nodriver 0.50.99 | raw `cdp.*` | Manual | No | zendriver yes (local forwarder) |
| selenium 4.52 / undetected-chromedriver 3.5.5 | `execute_cdp_cmd` | Manual | No | No (needs extension or forwarder) |
| seleniumbase 4.58 CDP mode | `geoloc=` kwarg | No (UA only) | No | Yes |
| botasaurus / DrissionPage | raw CDP | Manual | No | botasaurus yes; DrissionPage no |
| camoufox 0.5.9 | `geoip` | Not possible (desktop Firefox only) | n/a | Yes |

All examples use Chicago (41.8781, -87.6298) and assume a proxy that exits in Chicago. Install each package with `uv add <package>`; for Playwright, also run `uv run playwright install chromium`. The shared constants below are used throughout:

```python
# profile.py
LAT, LNG, ACC = 41.8781, -87.6298, 20          # accuracy is mandatory
TZ, LOCALE, ACCEPT_LANG = "America/Chicago", "en_US", "en-US,en;q=0.9"
CHROME_MAJOR = "152"                            # set to your real Chrome major version
UA = (f"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
      f"(KHTML, like Gecko) Chrome/{CHROME_MAJOR}.0.0.0 Mobile Safari/537.36")
UA_METADATA = {                                  # brands omitted -> Chrome fills real ones
    "platform": "Android", "platformVersion": "14.0.0", "architecture": "",
    "model": "Pixel 7", "mobile": True, "bitness": "", "wow64": False,
    "formFactors": ["Mobile"],
}
```

### Pydoll 3: the fingerprint API sets everything at once

Pydoll 3.0.1's `tab.apply_fingerprint(FingerprintConfig)` sends the UA with full `userAgentMetadata` (Android model included), plus timezone, geolocation, locale and Accept-Language, device metrics, touch and `Browser.setPermission`. It replays all of these into Web Workers and cross-origin iframes, and it re-asserts touch after each navigation ([pydoll fingerprint_applier.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/fingerprint_applier.py)). No other Python library covers workers. Call it **before the first `go_to`**, because its JS patches register through `Page.addScriptToEvaluateOnNewDocument` ([pydoll tab.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/tab.py)). One source-reading caveat: `GeolocationFingerprint` documents a default accuracy of about 100, but the applier passes `None` when you omit it. **Set `accuracy` explicitly.** Proxy credentials in `--proxy-server` are stripped from the argument and answered through Fetch auth events ([pydoll proxy_manager.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/managers/proxy_manager.py)).

```python
import asyncio
from pydoll.browser.chromium import Chrome
from pydoll.browser.options import ChromiumOptions
from pydoll.protocol.fingerprint.types import (
    FingerprintConfig, ScreenFingerprint, GeolocationFingerprint, HardwareFingerprint,
    LocaleFingerprint, ClientHintsFingerprint, PermissionsFingerprint,
)
from profile import LAT, LNG, ACC, TZ, UA
from uule import search_url

FP = FingerprintConfig(
    user_agent=UA,
    mobile=True,
    client_hints=ClientHintsFingerprint(platform_version="14.0.0", model="Pixel 7",
                                        architecture="", bitness="", form_factors=["Mobile"]),
    screen=ScreenFingerprint(width=412, height=915, inner_width=412, inner_height=839,
                             device_pixel_ratio=2.625, orientation_type="portrait-primary",
                             orientation_angle=0),
    hardware=HardwareFingerprint(max_touch_points=5, hardware_concurrency=8, device_memory=8),
    geolocation=GeolocationFingerprint(latitude=LAT, longitude=LNG, accuracy=ACC),
    timezone=TZ,
    locale=LocaleFingerprint(languages=["en-US", "en"]),
    permissions=PermissionsFingerprint(overrides={"geolocation": "granted"}),
)

async def main():
    opts = ChromiumOptions()
    opts.add_argument("--proxy-server=http://USER:PASS@proxy.example:8000")
    opts.add_argument("--force-webrtc-ip-handling-policy=disable_non_proxied_udp")
    opts.set_accept_languages("en-US,en")
    async with Chrome(options=opts) as browser:
        tab = await browser.start()
        await tab.apply_fingerprint(FP)                 # before first navigation
        await tab.go_to(search_url("plumber near me", LAT, LNG))

asyncio.run(main())
```

For anything pydoll does not wrap, `tab.execute_command({"method": ..., "params": ...})` is now public, and `browser.grant_permissions([...], origin=...)` exists. Typed factories live in `pydoll.commands.EmulationCommands` ([pydoll emulation_commands.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/commands/emulation_commands.py)). Raw commands sent on a tab do not reach workers, though, so prefer `apply_fingerprint`. Pydoll 3 also ships a Playwright-compatible layer (`from pydoll.playwright.async_api import async_playwright`). Its `new_context` accepts `geolocation`, `timezone_id`, `locale`, `is_mobile`, `has_touch` and `permissions`, and it fills in a missing accuracy for you ([pydoll _browser_context.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/playwright/_browser_context.py)). New tabs need `apply_fingerprint` again. Pydoll 3 has breaking changes from 2.x, so read its upgrade guide before porting old scripts.

### nodriver and zendriver: send generated CDP commands per tab

Both libraries expose generated bindings (`from zendriver import cdp`) and `await tab.send(...)`. Neither has a geolocation or Client Hints helper. Zendriver's `tab.set_user_agent()` sends no metadata, so call `cdp.emulation.set_user_agent_override` yourself ([zendriver tab.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/tab.py)). Zendriver's `create_context(proxy_server="http://user:pass@host:port")` handles authenticated http, https and socks5 proxies through a local forwarder ([zendriver browser.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/browser.py)). nodriver's `create_context` claims http auth support too, and uses a forwarder for socks5 ([nodriver browser.py](https://github.com/ultrafunkamsterdam/nodriver/blob/main/nodriver/core/browser.py)).

```python
import asyncio
import zendriver as zd                 # nodriver: import nodriver as zd
from zendriver import cdp              # nodriver: from nodriver import cdp
from profile import LAT, LNG, ACC, TZ, LOCALE, ACCEPT_LANG, UA
from uule import search_url

async def setup_tab(tab):
    await tab.send(cdp.emulation.set_user_agent_override(
        user_agent=UA, accept_language=ACCEPT_LANG, platform="Linux armv8l",
        user_agent_metadata=cdp.emulation.UserAgentMetadata(
            platform="Android", platform_version="14.0.0", architecture="",
            model="Pixel 7", mobile=True, bitness="", wow64=False,
            form_factors=["Mobile"])))
    await tab.send(cdp.emulation.set_device_metrics_override(
        width=412, height=839, device_scale_factor=2.625, mobile=True,
        screen_width=412, screen_height=915))
    await tab.send(cdp.emulation.set_touch_emulation_enabled(enabled=True, max_touch_points=5))
    await tab.send(cdp.emulation.set_timezone_override(timezone_id=TZ))
    await tab.send(cdp.emulation.set_locale_override(locale=LOCALE))
    await tab.send(cdp.emulation.set_geolocation_override(
        latitude=LAT, longitude=LNG, accuracy=ACC))

async def main():
    browser = await zd.start(lang="en-US")
    tab = await browser.create_context("about:blank",
                                       proxy_server="http://USER:PASS@proxy.example:8000")
    await browser.connection.send(cdp.browser.grant_permissions(
        [cdp.browser.PermissionType.GEOLOCATION], origin="https://www.google.com",
        browser_context_id=tab.target.browser_context_id))
    await setup_tab(tab)
    await tab.get(search_url("plumber near me", LAT, LNG))
    await browser.stop()

asyncio.run(main())
```

Passing `browser_context_id` makes the grant apply to the new context rather than the default one. That follows from the CDP signature but has not been tested. `browser.grant_all_permissions()` is a blunter alternative. Neither library re-asserts touch after navigation, so if `navigator.maxTouchPoints` reads 0 after the page loads, call `set_touch_emulation_enabled` again.

### Selenium and undetected-chromedriver: execute_cdp_cmd on the current window

Selenium 4.52 still has `driver.execute_cdp_cmd(cmd, args)` and `driver.set_permissions(name, value)` ([Selenium chromium/webdriver.py](https://github.com/SeleniumHQ/selenium/blob/trunk/py/selenium/webdriver/chromium/webdriver.py)). **undetected-chromedriver has had no release since 3.5.5 in February 2024** ([PyPI](https://pypi.org/project/undetected-chromedriver/)). Treat it as superseded by nodriver, zendriver and SeleniumBase UC/CDP mode. Chrome cannot take proxy credentials on the command line, so use a forwarder, an extension or selenium-wire.

```python
import undetected_chromedriver as uc            # or: from selenium import webdriver
from profile import LAT, LNG, ACC, TZ, LOCALE, ACCEPT_LANG, UA, UA_METADATA
from uule import search_url

opts = uc.ChromeOptions()
opts.add_argument("--lang=en-US")
opts.add_argument("--proxy-server=http://127.0.0.1:8899")   # local forwarder to the authed proxy
driver = uc.Chrome(options=opts)
cdp = driver.execute_cdp_cmd
cdp("Browser.grantPermissions", {"permissions": ["geolocation"],
                                 "origin": "https://www.google.com"})
cdp("Emulation.setUserAgentOverride", {"userAgent": UA, "acceptLanguage": ACCEPT_LANG,
                                       "platform": "Linux armv8l",
                                       "userAgentMetadata": UA_METADATA})
cdp("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 839,
    "deviceScaleFactor": 2.625, "mobile": True, "screenWidth": 412, "screenHeight": 915})
cdp("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
cdp("Emulation.setTimezoneOverride", {"timezoneId": TZ})
cdp("Emulation.setLocaleOverride", {"locale": LOCALE})
cdp("Emulation.setGeolocationOverride", {"latitude": LAT, "longitude": LNG, "accuracy": ACC})
driver.get(search_url("plumber near me", LAT, LNG))
```

`execute_cdp_cmd` targets the current window, so re-send everything after switching windows.

### Playwright and its forks: context-wide options plus a CDP patch for hints

Playwright is the most convenient option because its overrides apply to every page in a context, and `proxy=` handles auth natively. Its weakness is Client Hints. For an Android UA it computes `platform: "Android"`, `mobile`, `platformVersion` and `architecture: "arm"`, but leaves `model: ""` and sends no brands ([playwright crPage.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)). Its bundled descriptors also carry the bundled Chromium major version and the unreduced "Android 14; Pixel 7" UA. So override the UA and patch the metadata with a CDP session. patchright 1.64.4 and rebrowser-playwright are drop-in forks with the same API: change only the import ([patchright-python](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python)).

```python
import asyncio
from playwright.async_api import async_playwright   # or patchright.async_api
from profile import LAT, LNG, ACC, TZ, ACCEPT_LANG, UA, UA_METADATA
from uule import search_url

async def patch_hints(ctx, page):
    s = await ctx.new_cdp_session(page)
    await s.send("Emulation.setUserAgentOverride", {
        "userAgent": UA, "acceptLanguage": ACCEPT_LANG,
        "platform": "Linux armv8l", "userAgentMetadata": UA_METADATA})
    await s.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False)
        dev = dict(p.devices["Pixel 7"])
        dev["user_agent"] = UA
        ctx = await browser.new_context(
            **dev, locale="en-US", timezone_id=TZ,
            geolocation={"latitude": LAT, "longitude": LNG, "accuracy": ACC},
            permissions=["geolocation"],
            proxy={"server": "http://proxy.example:8000",
                   "username": "USER", "password": "PASS"})
        page = await ctx.new_page()
        await patch_hints(ctx, page)
        ctx.on("page", lambda pg: asyncio.ensure_future(patch_hints(ctx, pg)))
        await page.goto(search_url("plumber near me", LAT, LNG))
        # move the searcher without a new context:
        await ctx.set_geolocation({"latitude": 41.89, "longitude": -87.62, "accuracy": ACC})

asyncio.run(main())
```

Camoufox is not an option for mobile. It is Firefox-based, draws only desktop identities, and warns that `is_mobile` "cannot produce a believable phone and will leak" ([camoufox](https://github.com/daijro/camoufox/tree/main/pythonlib/camoufox)).

### SeleniumBase, botasaurus and DrissionPage: location is easy, the phone is manual

SeleniumBase CDP mode has native kwargs: `tzone=`, `geoloc=` (which grants the permission and sets accuracy to 100), `lang=`, `agent=` and `proxy="user:pass@host:port"`. Its `mobile=True` only applies a fixed 412x732 @3x viewport, and its UA setter sends no Client Hints ([SeleniumBase connection.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/connection.py), [cdp_util.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/cdp_util.py)). The `sb_cdp.Chrome(...)` kwargs below are inferred from `cdp_util.start`, so check them against SeleniumBase's docs. botasaurus exposes `driver.run_cdp_command(cdp.emulation...)` ([botasaurus-driver](https://github.com/omkarcloud/botasaurus-driver)). DrissionPage has `tab.run_cdp(...)`, but its `set_proxy` rejects `user:pass@` and socks proxies ([DrissionPage](https://github.com/g1879/DrissionPage)).

```python
# SeleniumBase CDP mode
from seleniumbase import sb_cdp
sb = sb_cdp.Chrome(url="about:blank", lang="en-US", tzone="America/Chicago",
                   geoloc=(41.8781, -87.6298), proxy="USER:PASS@proxy.example:8000",
                   agent=UA)
# add Emulation.setUserAgentOverride with UA_METADATA + touch yourself

# botasaurus
from botasaurus.browser import browser, Driver
from botasaurus_driver import cdp

@browser(proxy="http://USER:PASS@proxy.example:8000", lang="en-US", user_agent=UA)
def task(driver: Driver, data):
    driver.run_cdp_command(cdp.emulation.set_geolocation_override(
        latitude=41.8781, longitude=-87.6298, accuracy=20))
    driver.run_cdp_command(cdp.emulation.set_timezone_override(timezone_id="America/Chicago"))
    driver.get(search_url("plumber near me", 41.8781, -87.6298))

# DrissionPage (no proxy auth: point it at a local forwarder)
from DrissionPage import Chromium, ChromiumOptions
co = ChromiumOptions().set_argument("--lang", "en-US").set_proxy("http://127.0.0.1:8899")
tab = Chromium(co).latest_tab
tab.run_cdp("Browser.grantPermissions", permissions=["geolocation"],
            origin="https://www.google.com")
tab.run_cdp("Emulation.setGeolocationOverride", latitude=41.8781, longitude=-87.6298, accuracy=20)
tab.run_cdp("Emulation.setTimezoneOverride", timezoneId="America/Chicago")
```

## Conclusion

The tester is right about the part that matters for local rank tracking, for a reason they may not have stated. Google is not weighing "browser information" against IP in general. It takes an explicit coordinate whenever one is provided and falls back to IP when none is. That makes the problem simpler than it looks: put the coordinate in the request with uule, mirror it with a permitted geolocation override, and spend effort on the proxy and fingerprint only to stay unblocked and keep the session coherent. The weakest part of the evidence is that no one has published a controlled IP vs geolocation vs uule test on current Google. The three-way footer test described above is cheap, and it would turn this from an inference into a measured result for your own queries.

On tooling, the useful distinction is not stealth but coverage. Setting a location is a three-line job in every framework. Presenting a coherent phone (reduced UA, full Client Hints, 5 touch points, matching workers) is not, and only pydoll 3 does it without hand-written CDP. If your results ever disagree with a real phone in the same spot, the next step is not a better proxy. It is driving a real Android Chrome over ADB, which removes the desktop GPU and font tells that no CDP override can hide.
