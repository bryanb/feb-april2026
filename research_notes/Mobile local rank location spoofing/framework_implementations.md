# Framework implementations: geolocation, timezone, locale, mobile emulation, client hints, proxy (Python, Nov 2026)

Method: every package below was downloaded from PyPI on 2026-11-17 and its **installed source was read directly** (grep and read of the wheel/sdist). Method names and signatures come from the source, not from memory. Versions checked, with the PyPI upload date of each latest release:

| Package | Version checked | Released | Install |
|---|---|---|---|
| pydoll-python | 3.0.1 | 2026-11-08 | `uv add pydoll-python` |
| nodriver | 0.50.99 | 2026-10-26 | `uv add nodriver` |
| zendriver | 0.17.1 | 2026-10-02 | `uv add zendriver` |
| undetected-chromedriver | 3.5.5 | 2024-02-17 (no release since) | `uv add undetected-chromedriver selenium` |
| selenium | 4.52.0 | — | `uv add selenium` |
| playwright | 1.65.2 | 2026-11-14 | `uv add playwright && uv run playwright install chromium` |
| patchright | 1.64.4 | 2026-11-02 | `uv add patchright && uv run patchright install chrome` |
| rebrowser-playwright | 1.64.102 | 2026-11-02 | `uv add rebrowser-playwright` |
| camoufox | 0.5.9 | 2026-11-01 | `uv add "camoufox[geoip]"` |
| seleniumbase | 4.58.1 | 2026-11-16 | `uv add seleniumbase` |
| botasaurus / botasaurus-driver | 4.0.97 / 4.0.101 | 2026-01-06 (botasaurus) | `uv add botasaurus` |
| DrissionPage | 4.1.1.4 | 2026-05-27 | `uv add DrissionPage` |

Source for versions and dates: PyPI JSON API (`https://pypi.org/pypi/<name>/json`), for example [pydoll-python on PyPI](https://pypi.org/project/pydoll-python/) and [undetected-chromedriver on PyPI](https://pypi.org/project/undetected-chromedriver/).

Underlying CDP methods used everywhere: `Emulation.setGeolocationOverride`, `Browser.grantPermissions` / `Browser.setPermission`, `Emulation.setTimezoneOverride`, `Emulation.setLocaleOverride`, `Emulation.setUserAgentOverride` (with `userAgentMetadata`), `Emulation.setDeviceMetricsOverride`, `Emulation.setTouchEmulationEnabled` — [CDP Emulation domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/), [CDP Browser domain](https://chromedevtools.github.io/devtools-protocol/tot/Browser/).

---

## 1. pydoll: raw CDP, built-in helpers, fingerprint API, proxy (v3.0.1)

### Takeaway
Pydoll 3.x has a **high-level `tab.apply_fingerprint(FingerprintConfig)`** that sets UA, full Client Hints (`userAgentMetadata`, Android model included), timezone, geolocation, locale and `Accept-Language`, device metrics, touch, and permissions in one call. It also has a **public `tab.execute_command(...)`** for raw CDP (the older `tab._execute_command` still exists as a private method), `browser.grant_permissions(...)`, per-context proxies with auth, and a Playwright-compatible layer (`pydoll.playwright.async_api`) that accepts `geolocation=`, `timezone_id=`, `locale=`, `is_mobile=`, `has_touch=` and `permissions=`. Call `apply_fingerprint` **before the first `go_to`**.

### Cited Findings
- **Raw CDP:** `Tab.execute_command(command, timeout=60)` is public in 3.x. It is inherited from `FindElementsMixin` and documented as "Send a raw CDP command through this object's session… pass a plain `{'method': ..., 'params': ...}` dict for methods pydoll does not wrap". `Browser.execute_command(...)` sends on the browser-level session, for the Target, Browser and Storage domains. The private `_execute_command(command)` (fixed 60 s timeout) still exists on both. — [find_elements_mixin.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/elements/mixins/find_elements_mixin.py); [chromium/base.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/chromium/base.py)
- **Typed command factories:** `pydoll.commands.EmulationCommands` has `set_geolocation_override(latitude, longitude, accuracy, altitude, altitude_accuracy, heading, speed)`, `set_timezone_override(timezone_id)`, `set_locale_override(locale)` (ICU style, e.g. `'en_US'`), `set_user_agent_override(user_agent, accept_language, platform, user_agent_metadata)`, `set_device_metrics_override(width, height, device_scale_factor, mobile, ..., screen_width, screen_height, screen_orientation, ...)`, `set_touch_emulation_enabled(enabled, max_touch_points)` and `set_hardware_concurrency_override`. — [emulation_commands.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/commands/emulation_commands.py)
- **Permissions helper:** `await browser.grant_permissions(permissions: list[PermissionType], origin=None, browser_context_id=None)` and `await browser.reset_permissions(browser_context_id=None)`. The enum value is `PermissionType.GEOLOCATION = 'geolocation'`. — [chromium/base.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/chromium/base.py); [protocol/browser/types.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/protocol/browser/types.py)
- **Fingerprint API:** `tab.apply_fingerprint(fingerprint: FingerprintConfig, *, cross_origin_iframes=True)`. `FingerprintConfig` is a TypedDict with these keys: `user_agent`, `mobile`, `client_hints`, `navigator`, `webgl`, `webgpu`, `screen`, `geolocation`, `hardware`, `media_devices`, `media_codecs`, `plugins`, `audio`, `speech`, `locale`, `timezone`, `network_connection`, `fonts`, `platform_apis`, `permissions`, `media_features` and `webrtc_ip_policy`. — [protocol/fingerprint/types.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/protocol/fingerprint/types.py)
- **What `apply_fingerprint` sends natively:**
  - `Emulation.setUserAgentOverride`, with `userAgentMetadata` built by `UserAgentParser`.
  - `Emulation.setTimezoneOverride`, `Emulation.setGeolocationOverride`, `Emulation.setDeviceMetricsOverride`, `Emulation.setLocaleOverride` (taken from `languages[0]`, with `-` replaced by `_`) and `Emulation.setTouchEmulationEnabled` (when `hardware.max_touch_points > 0`).
  - `Browser.setPermission` for each `permissions.overrides` entry, scoped to the tab's browser context.
  - JS injection via `Page.addScriptToEvaluateOnNewDocument`, only for signals CDP cannot set.
  - The same overrides replayed into Web Workers and cross-origin iframes (OOPIFs).
  — [fingerprint_applier.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/fingerprint_applier.py)
- **Client hints for Android:** `UserAgentParser` detects mobile from `android`, `iphone`, `ipad` and `mobile` in the UA. It extracts `model` from a mobile UA, sets `formFactors=['Mobile']`, and computes greased brands and per-major brand order. `ClientHintsFingerprint` lets you pin `platform_version`, `architecture`, `bitness`, `wow64`, `model` (e.g. `'SM-S928B'`) and `form_factors`. The docstring notes that the reduced UA freezes Android at `Android 10; K`, while real Chrome reports the true version in `Sec-CH-UA-Platform-Version`. — [protocol/fingerprint/types.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/protocol/fingerprint/types.py); [utils/user_agent_parser.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/utils/user_agent_parser.py)
- **Touch re-assert:** pydoll re-sends `setTouchEmulationEnabled` on every top-frame `Page.frameNavigated`. Its code comment says: "Measured on Chrome 152: after the first navigation away from the initial about:blank the new document reads the profile's maxTouchPoints while parsing and 0 a hundred milliseconds later". — [fingerprint_applier.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/fingerprint_applier.py)
- **Timing:** the `apply_fingerprint` docstring says "Call before navigating to any page for full effect, since JS overrides register via `Page.addScriptToEvaluateOnNewDocument`". — [tab.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/tab.py)
- **Accept-Language:**
  - `ChromiumOptions.set_accept_languages('en-US,en')` writes the `intl.accept_languages` preference.
  - `apply_fingerprint` also builds an `Accept-Language` from `locale.languages`, passed through `setUserAgentOverride(accept_language=...)`.
  - Watch for a stale docstring: in options.py the docstring under `open_pdf_externally` wrongly talks about "Block or allow geolocation access", but it actually sets `plugins.always_open_pdf_externally`. There is **no geolocation preference helper** in `ChromiumOptions`.
  — [options.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/options.py)
- **Proxy:**
  - `options.add_argument('--proxy-server=http://user:pass@host:port')`. `ProxyManager` strips the credentials from the argument and answers proxy auth through Fetch `authRequired` events (`enable_fetch_events(handle_auth_requests=True)`).
  - Per-context proxies: `await browser.create_browser_context(proxy_server='http://user:pass@host:port', proxy_bypass_list=None)`. Credentials are extracted and handled per context.
  — [managers/proxy_manager.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/managers/proxy_manager.py); [chromium/base.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/chromium/base.py)
- **Playwright compatibility layer (new in 3.0):** `from pydoll.playwright.async_api import async_playwright`.
  - Its `new_context` honours `user_agent`, `locale`, `timezone_id`, `geolocation`, `permissions`, `is_mobile`, `has_touch` and `proxy`.
  - It fills in `accuracy: 0` when the geolocation dict has none, with this comment: "Chrome reports POSITION_UNAVAILABLE when the override carries no accuracy".
  - `has_touch` sets `maxTouchPoints` to 5 when `is_mobile`, else 10.
  - The README says `page.tab` exposes the underlying pydoll Tab.
  — [playwright/_browser_context.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/playwright/_browser_context.py); [README / PyPI](https://pypi.org/project/pydoll-python/)
- **Humanization:** it is opt-in per call (`click(humanize=True)`, `type_text(..., humanize=True)`, `tab.mouse.move(..., humanize=True)`), and the default is "fast, non-humanized movement". It is a separate input-layer feature and does not touch the Emulation overrides. — [README / PyPI](https://pypi.org/project/pydoll-python/); [interactions/mouse.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/interactions/mouse.py)
- **Breaking changes:** the README says "Pydoll 3 is here… a synchronous API, a Playwright-compatible layer… a few breaking changes, so read the upgrade guide" (pydoll.tech/docs/upgrading/). — [PyPI](https://pypi.org/project/pydoll-python/)

### Code: pydoll 3.0.1, high-level API (recommended)
```python
import asyncio
from pydoll.browser.chromium import Chrome
from pydoll.browser.options import ChromiumOptions
from pydoll.protocol.fingerprint.types import (
    FingerprintConfig, ScreenFingerprint, GeolocationFingerprint, HardwareFingerprint,
    LocaleFingerprint, ClientHintsFingerprint, PermissionsFingerprint,
)

UA = ("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/142.0.0.0 Mobile Safari/537.36")   # match the major version of your real Chrome

FP = FingerprintConfig(
    user_agent=UA,
    mobile=True,
    client_hints=ClientHintsFingerprint(platform_version="14.0.0", model="Pixel 7",
                                        architecture="", bitness="", form_factors=["Mobile"]),
    screen=ScreenFingerprint(width=412, height=915, inner_width=412, inner_height=839,
                             device_pixel_ratio=2.625, orientation_type="portrait-primary",
                             orientation_angle=0),
    hardware=HardwareFingerprint(max_touch_points=5, hardware_concurrency=8, device_memory=8),
    geolocation=GeolocationFingerprint(latitude=41.8781, longitude=-87.6298, accuracy=20),  # ALWAYS set accuracy
    timezone="America/Chicago",
    locale=LocaleFingerprint(languages=["en-US", "en"]),
    permissions=PermissionsFingerprint(overrides={"geolocation": "granted"}),
)

async def main():
    opts = ChromiumOptions()
    opts.add_argument("--proxy-server=http://USER:PASS@proxy.example:8000")  # creds auto-handled
    opts.set_accept_languages("en-US,en")
    async with Chrome(options=opts) as browser:
        tab = await browser.start()
        await tab.apply_fingerprint(FP)          # BEFORE first navigation
        await tab.go_to("https://www.google.com/search?q=plumber+near+me")

asyncio.run(main())
```

### Code: pydoll, raw CDP equivalent
```python
from pydoll.commands import EmulationCommands
from pydoll.constants import PermissionType  # if not exported there: pydoll.protocol.browser.types.PermissionType

await browser.grant_permissions([PermissionType.GEOLOCATION], origin="https://www.google.com")
await tab.execute_command(EmulationCommands.set_geolocation_override(
    latitude=41.8781, longitude=-87.6298, accuracy=20))
await tab.execute_command(EmulationCommands.set_timezone_override("America/Chicago"))
await tab.execute_command(EmulationCommands.set_locale_override("en_US"))
await tab.execute_command({"method": "Emulation.setUserAgentOverride", "params": {
    "userAgent": UA, "acceptLanguage": "en-US,en;q=0.9", "platform": "Linux armv81",
    "userAgentMetadata": {
        "brands": [{"brand": "Chromium", "version": "142"}, {"brand": "Google Chrome", "version": "142"},
                   {"brand": "Not_A Brand", "version": "99"}],
        "fullVersionList": [{"brand": "Chromium", "version": "142.0.7444.59"},
                            {"brand": "Google Chrome", "version": "142.0.7444.59"},
                            {"brand": "Not_A Brand", "version": "99.0.0.0"}],
        "platform": "Android", "platformVersion": "14.0.0", "architecture": "", "model": "Pixel 7",
        "mobile": True, "bitness": "", "wow64": False, "formFactors": ["Mobile"]}}})
await tab.execute_command(EmulationCommands.set_device_metrics_override(
    width=412, height=839, device_scale_factor=2.625, mobile=True, screen_width=412, screen_height=915))
await tab.execute_command(EmulationCommands.set_touch_emulation_enabled(enabled=True, max_touch_points=5))
```
The version numbers in the brand lists above are illustrative. Read the real ones from `await browser.get_version()` and do not hard-code them.

### Inferences
- **Possible bug: missing geolocation accuracy.** `GeolocationFingerprint` documents `accuracy` as "default ~100", but `_apply_native_overrides` passes `accuracy=geo.get('accuracy')`. When it is omitted, `None` is sent, and the factory drops `None` fields. Pydoll's own Playwright layer says Chrome then reports POSITION_UNAVAILABLE. **Always pass `accuracy` explicitly** until this is confirmed fixed.
- **Raw CDP vs `apply_fingerprint`.** Raw CDP overrides are per page session (per tab). `apply_fingerprint` also covers workers and OOPIFs, which raw commands sent on the tab do not.
- **New tabs.** For new tabs or popups, you must call `apply_fingerprint` again on each new `Tab` object. The context registry (`_context_fingerprints`) suggests some reuse per browser context, but I did not verify that new tabs inherit automatically.

### Gaps
- I did not verify end-to-end on a live Chrome that pydoll's computed Android `Sec-CH-UA-*` headers match a real Pixel. This finding is based on source reading only.
- The exact public import path for `PermissionType` in 3.x is unconfirmed. It is defined in `pydoll/protocol/browser/types.py`; check whether `pydoll.constants` re-exports it.
- The upgrade guide at pydoll.tech/docs/upgrading/ was not fetched.

---

## 2. nodriver (0.50.99) and zendriver (0.17.1)

### Takeaway
Both use generated CDP bindings: `from nodriver import cdp` / `from zendriver import cdp`, then `await tab.send(cdp.emulation.<fn>(...))`. Neither has a high-level geolocation, timezone or client-hints helper. Both have `browser.grant_all_permissions()`. The built-in `tab.set_user_agent()` (zendriver) and SeleniumBase's equivalent use `Network.setUserAgentOverride` **without `userAgentMetadata`**, so for Android client hints you must call `cdp.emulation.set_user_agent_override(..., user_agent_metadata=cdp.emulation.UserAgentMetadata(...))` yourself. Zendriver adds per-context authenticated proxies through a local forwarder.

### Cited Findings
- **Function signatures** (identical in both packages): `cdp.emulation.set_geolocation_override(latitude, longitude, accuracy, altitude, altitude_accuracy, heading, speed)`, `set_timezone_override(timezone_id)`, `set_locale_override(locale)`, `set_user_agent_override(user_agent, accept_language, platform, user_agent_metadata)`, `set_device_metrics_override(...)` and `set_touch_emulation_enabled(enabled, max_touch_points)`. — [nodriver cdp/emulation.py](https://github.com/ultrafunkamsterdam/nodriver/blob/main/nodriver/cdp/emulation.py); [zendriver cdp/emulation.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/cdp/emulation.py)
- **Geolocation docstring:** the generated `set_geolocation_override` docstring says: "Omitting latitude, longitude or accuracy emulates position unavailable." So `accuracy` is effectively required. — [zendriver cdp/emulation.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/cdp/emulation.py)
- **Client-hints types:** `cdp.emulation.UserAgentMetadata` requires `platform`, `platform_version`, `architecture`, `model` and `mobile`. It optionally takes `brands`, `full_version_list`, `full_version`, `bitness`, `wow64` and `form_factors`. Brand entries are `cdp.emulation.UserAgentBrandVersion(brand, version)`. — [zendriver cdp/emulation.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/cdp/emulation.py)
- **Permissions:** `cdp.browser.grant_permissions(permissions: List[PermissionType], origin=None, browser_context_id=None)` and `cdp.browser.PermissionType.GEOLOCATION`. `Browser.grant_all_permissions()` exists in both (its docstring list includes geolocation). — [nodriver core/browser.py](https://github.com/ultrafunkamsterdam/nodriver/blob/main/nodriver/core/browser.py); [zendriver core/browser.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/browser.py)
- **Starting the browser:** `start(headless=False, browser_args=[...], lang=...)` in both. Zendriver also takes `user_agent=`, which becomes `--user-agent`, and `lang` becomes `--lang=`. — [zendriver core/util.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/util.py); [zendriver core/config.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/config.py)
- **Proxy, nodriver:** `browser.create_context(url, new_tab, new_window, dispose_on_detach, proxy_server, proxy_bypass_list, ...)`. Its docstring says "http/https proxies with authentication are also supported: http://USERNAME:PASSWORD@SERVER:PORT" and socks5 auth goes "by using a forwarder proxy". — [nodriver core/browser.py](https://github.com/ultrafunkamsterdam/nodriver/blob/main/nodriver/core/browser.py)
- **Proxy, zendriver:** `browser.create_context(url='about:blank', *, new_window=True, proxy_server=..., proxy_bypass_list=[...], proxy_ssl_context=None)`. The docstring says "credentials are supported for http, https and socks5 proxies… since chrome can not pass proxy credentials itself, zendriver then runs a local proxy which forwards to the given one". — [zendriver core/browser.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/browser.py); [zendriver core/proxy.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/proxy.py)
- **Zendriver UA helper:** `Tab.set_user_agent(user_agent, accept_language, platform)` sends `cdp.network.set_user_agent_override` with no metadata. The docstring recommends passing `user_agent` to `zendriver.start()` instead. — [zendriver core/tab.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/core/tab.py)

### Code: zendriver (nodriver is identical except for the import and start)
```python
import asyncio
import zendriver as zd          # nodriver: import nodriver as uc
from zendriver import cdp       # nodriver: from nodriver import cdp

UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36"

async def setup_tab(tab):
    await tab.send(cdp.emulation.set_user_agent_override(
        user_agent=UA, accept_language="en-US,en;q=0.9", platform="Linux armv81",
        user_agent_metadata=cdp.emulation.UserAgentMetadata(
            platform="Android", platform_version="14.0.0", architecture="", model="Pixel 7", mobile=True,
            brands=[cdp.emulation.UserAgentBrandVersion("Chromium", "142"),
                    cdp.emulation.UserAgentBrandVersion("Google Chrome", "142"),
                    cdp.emulation.UserAgentBrandVersion("Not_A Brand", "99")],
            full_version_list=[cdp.emulation.UserAgentBrandVersion("Chromium", "142.0.7444.59"),
                               cdp.emulation.UserAgentBrandVersion("Google Chrome", "142.0.7444.59"),
                               cdp.emulation.UserAgentBrandVersion("Not_A Brand", "99.0.0.0")],
            bitness="", wow64=False, form_factors=["Mobile"])))
    await tab.send(cdp.emulation.set_device_metrics_override(
        width=412, height=839, device_scale_factor=2.625, mobile=True, screen_width=412, screen_height=915))
    await tab.send(cdp.emulation.set_touch_emulation_enabled(enabled=True, max_touch_points=5))
    await tab.send(cdp.emulation.set_timezone_override(timezone_id="America/Chicago"))
    await tab.send(cdp.emulation.set_locale_override(locale="en_US"))
    await tab.send(cdp.emulation.set_geolocation_override(latitude=41.8781, longitude=-87.6298, accuracy=20))

async def main():
    browser = await zd.start(lang="en-US")               # nodriver: await uc.start(lang="en-US")
    tab = await browser.create_context("about:blank",
                                       proxy_server="http://USER:PASS@proxy.example:8000")
    await browser.connection.send(cdp.browser.grant_permissions(
        [cdp.browser.PermissionType.GEOLOCATION], origin="https://www.google.com"))   # or browser.grant_all_permissions()
    await setup_tab(tab)                                 # before navigating
    await tab.get("https://www.google.com/search?q=plumber+near+me")
    await browser.stop()

asyncio.run(main())
```
Note: when `grant_permissions` is called without a `browser_context_id`, it applies to the default context. For a tab created with `create_context`, pass `browser_context_id=tab.target.browser_context_id`. This advice comes from the CDP signature; I did not test it.

### Inferences
- **Overrides are per tab.** All `Emulation.*` overrides go to one target session. Every new tab or popup needs `setup_tab()` again, and dedicated workers keep the real UA. Pydoll handles workers; these libraries do not.
- **`--user-agent` does not set client hints.** Setting the UA only through `--user-agent` or `Network.setUserAgentOverride` leaves `navigator.userAgentData` and `Sec-CH-UA-*` showing desktop or Linux values. That is a detectable mismatch for an Android UA.

### Gaps
- I did not confirm whether nodriver's `create_context` proxy auth uses a forwarder for http credentials in 0.50.99. The docstring claims support, but the implementation was not traced.

---

## 3. undetected-chromedriver / Selenium

### Takeaway
Use `driver.execute_cdp_cmd("Emulation.setGeolocationOverride", {...})` and the related calls. Selenium 4.52 still has `execute_cdp_cmd(cmd, cmd_args)` and `set_permissions(name, value)` on Chromium drivers. undetected-chromedriver has had **no release since 3.5.5 (Feb 2024)**, so it is effectively superseded by nodriver, zendriver and SeleniumBase UC mode. Selenium has no built-in proxy auth: use `selenium-wire`, an extension, or a local forwarder.

### Cited Findings
- `ChromiumDriver.execute_cdp_cmd(self, cmd: str, cmd_args: dict)` and `set_permissions(self, name: str, value: str)` exist in selenium 4.52.0. — [selenium chromium/webdriver.py](https://github.com/SeleniumHQ/selenium/blob/trunk/py/selenium/webdriver/chromium/webdriver.py)
- undetected-chromedriver's latest version is 3.5.5, uploaded 2024-02-17. — [PyPI](https://pypi.org/project/undetected-chromedriver/)

### Code
```python
import undetected_chromedriver as uc   # or: from selenium import webdriver
opts = uc.ChromeOptions()
opts.add_argument("--lang=en-US")
opts.add_argument("--proxy-server=http://proxy.example:8000")  # no inline auth support in Chrome
driver = uc.Chrome(options=opts)
cdp = driver.execute_cdp_cmd
cdp("Browser.grantPermissions", {"permissions": ["geolocation"], "origin": "https://www.google.com"})
# or: driver.set_permissions("geolocation", "granted")
cdp("Emulation.setGeolocationOverride", {"latitude": 41.8781, "longitude": -87.6298, "accuracy": 20})
cdp("Emulation.setTimezoneOverride", {"timezoneId": "America/Chicago"})
cdp("Emulation.setLocaleOverride", {"locale": "en_US"})
cdp("Emulation.setUserAgentOverride", {"userAgent": UA, "acceptLanguage": "en-US,en;q=0.9",
    "platform": "Linux armv81", "userAgentMetadata": {...}})   # same dict as in the pydoll raw example
cdp("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 839, "deviceScaleFactor": 2.625,
    "mobile": True, "screenWidth": 412, "screenHeight": 915})
cdp("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
driver.get("https://www.google.com/search?q=plumber+near+me")
```
Alternative: Selenium's `options.add_experimental_option("mobileEmulation", {"deviceMetrics": {...}, "userAgent": UA, "clientHints": {...}})` is a ChromeDriver feature. I did not verify it in the source here (see Gaps).

### Inferences
- `execute_cdp_cmd` targets the current window's session. After switching windows, the overrides must be re-sent.

### Gaps
- I did not verify ChromeDriver's `mobileEmulation.clientHints` support in current ChromeDriver from primary docs during this session.

---

## 4. Playwright Python (+ patchright, rebrowser-playwright, camoufox)

### Takeaway
`browser.new_context(**p.devices["Pixel 7"], locale=..., timezone_id=..., geolocation={...}, permissions=["geolocation"], proxy={...})` covers everything except **complete** client hints. Playwright 1.65 now auto-computes a **partial** `userAgentMetadata` from the UA: mobile, `platform="Android"`, `platformVersion` and `architecture="arm"`, but `model=""` and no brands or fullVersionList. For realistic Android client hints, override per page with a `CDPSession`. Overrides apply context-wide, including new pages, which is the main ergonomic advantage. Patchright and rebrowser-playwright are drop-in forks with the same API. Camoufox is Firefox, **desktop-only**, and ignores `is_mobile`.

### Cited Findings
- **Device descriptors:** Playwright 1.65.2 ships descriptors up to "Pixel 10", "Pixel 10 Pro (XL)", "Pixel 9" and "Galaxy S24".
  - The "Pixel 7" descriptor is: UA `Mozilla/5.0 (Linux; Android 14; Pixel 7) ... Chrome/159.0.8154.6 Mobile Safari/537.36`, screen 412x915, viewport 412x839, `deviceScaleFactor: 2.625`, `isMobile: true`, `hasTouch: true`.
  - The UA carries Playwright's bundled Chromium major version, which will not match a `channel="chrome"` stable build.
  — [playwright deviceDescriptorsSource.json](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/deviceDescriptorsSource.json)
- **Client hints Playwright computes:** `crPage._updateUserAgent` sends `Emulation.setUserAgentOverride {userAgent, acceptLanguage: options.locale, userAgentMetadata: calculateUserAgentMetadata(options)}`. For an Android UA, `calculateUserAgentMetadata` yields `{mobile, model: "", architecture: "arm", platform: "Android", platformVersion: <from UA>}`, with no brands. — [playwright crPage.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)
- **Geolocation, timezone and locale calls:** geolocation goes through `Emulation.setGeolocationOverride` with the context's geolocation option. Timezone and locale go through `Emulation.setTimezoneOverride` and `Emulation.setLocaleOverride`. — [playwright crPage.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)
- **Spreading a device descriptor:** in Python, `p.devices[...]` includes `default_browser_type`. `new_context` accepts and ignores it ("default_browser_type is the browser of a device descriptor; it is not an…"), so `**p.devices["Pixel 7"]` is safe. — [playwright-python _impl/browser.py](https://github.com/microsoft/playwright-python/blob/main/playwright/_impl/browser.py)
- **CDP sessions:** `BrowserContext.new_cdp_session(page)` exists. — [playwright-python async_api](https://github.com/microsoft/playwright-python/blob/main/playwright/async_api/_generated.py)
- **Camoufox and mobile:** camoufox 0.5.9 warns on `is_mobile`. Its warning text reads: "Camoufox is built for desktops and only draws desktop identities, so is_mobile cannot produce a believable phone and will leak… Use has_touch, device_scale_factor and viewport for the parts you need." Its launch options include `geoip`, `locale`, `os`, `humanize`, `screen`, `window` and `proxy`. — [camoufox utils.py / warnings.yml](https://github.com/daijro/camoufox/tree/main/pythonlib/camoufox)
- **patchright:** 1.64.4, built on patchright-core 1.64.3, as a drop-in Playwright replacement (`from patchright.async_api import async_playwright`). — [patchright-python](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python)

### Code
```python
import asyncio
from playwright.async_api import async_playwright   # or patchright.async_api / rebrowser_playwright.async_api

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False)
        dev = dict(p.devices["Pixel 7"])
        dev["user_agent"] = UA                     # align the Chrome major with the real binary
        ctx = await browser.new_context(
            **dev,
            locale="en-US", timezone_id="America/Chicago",
            geolocation={"latitude": 41.8781, "longitude": -87.6298, "accuracy": 20},
            permissions=["geolocation"],
            proxy={"server": "http://proxy.example:8000", "username": "USER", "password": "PASS"},
        )
        page = await ctx.new_page()
        # full client hints (Playwright's own metadata has model="" and no brands)
        s = await ctx.new_cdp_session(page)
        await s.send("Emulation.setUserAgentOverride", {
            "userAgent": UA, "acceptLanguage": "en-US,en;q=0.9", "platform": "Linux armv81",
            "userAgentMetadata": {"brands": [...], "fullVersionList": [...], "platform": "Android",
                "platformVersion": "14.0.0", "architecture": "", "model": "Pixel 7", "mobile": True,
                "bitness": "", "wow64": False, "formFactors": ["Mobile"]}})
        await page.goto("https://www.google.com/search?q=plumber+near+me")
        # change location mid-session:
        await ctx.set_geolocation({"latitude": 34.0522, "longitude": -118.2437, "accuracy": 20})

asyncio.run(main())
```

### Inferences
- **What the CDP session override covers.** It applies only to that page's main session. Popups, new pages and workers get Playwright's partial metadata. To cover popups, repeat the call on `ctx.on("page", ...)`.
- **Proxy auth.** Playwright's `proxy=` handles authentication natively, which is simpler than Selenium or DrissionPage.

### Gaps
- I did not inspect whether patchright or rebrowser change `calculateUserAgentMetadata`. Assume they match upstream 1.64.

---

## 5. SeleniumBase UC/CDP mode, botasaurus, DrissionPage (brief)

### Takeaway
- **SeleniumBase CDP mode** has native kwargs: `tzone`/`timezone`, `geoloc`/`geolocation` (it grants the permission and sets accuracy=100), `locale`/`lang`/`locale_code`, `agent`/`user_agent`, `platform`, `proxy="user:pass@host:port"` and `mobile=True`. `mobile=True` only applies a fixed 412x732 @3x metrics override, with no client hints.
- **botasaurus** exposes `driver.run_cdp_command(cdp.emulation...)`.
- **DrissionPage** exposes `tab.run_cdp('Emulation.setGeolocationOverride', ...)`, but its `set_proxy` does **not** support user:pass or socks.

### Cited Findings
- **SeleniumBase `set_geolocation`:** `connection.set_geolocation(geolocation)` sends `cdp.browser.set_permission({"name":"geolocation"}, "granted")`, then `cdp.emulation.set_geolocation_override(lat, lon, accuracy=100)`. — [seleniumbase cdp_driver/connection.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/connection.py)
- **SeleniumBase locale, timezone and UA:** `set_locale` sends `Network.setUserAgentOverride(accept_language=locale)` plus `Emulation.setLocaleOverride`. `set_timezone` sends `Emulation.setTimezoneOverride`. `set_user_agent` uses `Network.setUserAgentOverride` **without metadata**. — [seleniumbase cdp_driver/connection.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/connection.py)
- **SeleniumBase start options:** `cdp_util.start(..., lang=, agent=, proxy="host:port" or "user:pass@host:port", tzone=, geoloc=[lat, lon], mobile=)`. When `mobile` is set, the browser sends `set_device_metrics_override(width=412, height=732, device_scale_factor=3, mobile=True)`. The `SB()` manager also takes `locale_code`, `proxy`, `agent`, `mobile` and `device_metrics="w,h,pr"`. — [cdp_util.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/cdp_util.py); [cdp_driver/browser.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/undetected/cdp_driver/browser.py); [sb_manager.py](https://github.com/seleniumbase/SeleniumBase/blob/master/seleniumbase/plugins/sb_manager.py)
- **botasaurus:** the `@browser` decorator takes `lang`, `proxy`, `user_agent` and `window_size`. botasaurus-driver 4.0.101 has `Driver.run_cdp_command(command)` and `from botasaurus_driver import cdp` with `cdp.emulation.set_geolocation_override` and `cdp.browser.grant_permissions`. — [botasaurus browser_decorator.py](https://github.com/omkarcloud/botasaurus); [botasaurus-driver driver.py](https://github.com/omkarcloud/botasaurus-driver)
- **DrissionPage:** `ChromiumOptions.set_proxy(proxy)` prints `UNSUPPORTED_USER_PROXY` for `user:pass@` and `UNSUPPORTED_SOCKS_PROXY` for socks. Also available: `set_user_agent()` (as `--user-agent`), `set_argument()`, `set_pref()`, and raw `page.run_cdp(cmd, **cmd_args)` / `run_cdp_loaded`. — [DrissionPage chromium_options.py / chromium_base.py](https://github.com/g1879/DrissionPage)

### Code
```python
# SeleniumBase CDP mode (pure CDP, no webdriver)
from seleniumbase import sb_cdp
sb = sb_cdp.Chrome(url="about:blank", lang="en-US", tzone="America/Chicago",
                   geoloc=(41.8781, -87.6298), proxy="USER:PASS@proxy.example:8000", agent=UA)
# then raw: sb.get_driver()/page CDP sends for userAgentMetadata + touch (not built in)

# botasaurus
from botasaurus.browser import browser, Driver
from botasaurus_driver import cdp
@browser(proxy="http://USER:PASS@proxy.example:8000", lang="en-US", user_agent=UA)
def task(driver: Driver, data):
    driver.run_cdp_command(cdp.emulation.set_geolocation_override(latitude=41.8781, longitude=-87.6298, accuracy=20))
    driver.run_cdp_command(cdp.emulation.set_timezone_override(timezone_id="America/Chicago"))
    driver.get("https://www.google.com/search?q=plumber+near+me")

# DrissionPage
from DrissionPage import Chromium, ChromiumOptions
co = ChromiumOptions().set_argument("--lang", "en-US").set_proxy("http://proxy.example:8000")  # no auth
tab = Chromium(co).latest_tab
tab.run_cdp("Browser.grantPermissions", permissions=["geolocation"], origin="https://www.google.com")
tab.run_cdp("Emulation.setGeolocationOverride", latitude=41.8781, longitude=-87.6298, accuracy=20)
tab.run_cdp("Emulation.setTimezoneOverride", timezoneId="America/Chicago")
```

### Inferences
- **SeleniumBase mobile UA.** In SeleniumBase CDP mode, a mobile UA via `agent=` produces mismatched client hints, because there is no metadata. Add `Emulation.setUserAgentOverride` with metadata manually.
- **botasaurus and DrissionPage.** I verified only the method names. The `sb_cdp.Chrome` constructor kwargs are inferred from `cdp_util.start` and should be checked against SeleniumBase docs.

### Gaps
- I did not confirm the exact `sb_cdp.Chrome(...)` entry-point signature or how to send raw CDP from an `sb_cdp` object.
- botasaurus's per-context proxy-auth mechanism was not examined.

---

## Cross-cutting gotchas (summary)

### Takeaway
1. **Set overrides before navigation, on every tab.** CDP `Emulation.*` overrides are per target session. Re-apply on each new tab or popup. Playwright and pydoll's playwright layer are the exceptions, since they apply context-wide.
2. **Always pass `accuracy`** in `setGeolocationOverride`, or Chrome reports position unavailable.
3. **Geolocation needs a permission grant** (`Browser.grantPermissions` or `Browser.setPermission`) per origin or context. Without it, the page gets a prompt or a denial.
4. **For an Android UA, send `Emulation.setUserAgentOverride` with full `userAgentMetadata`.** That means brands, fullVersionList, platform "Android", platformVersion, model, `mobile: true` and formFactors `["Mobile"]`, with the brand versions matching the real Chrome binary. Only **pydoll's `apply_fingerprint`** does this fully and automatically. Playwright does it partially (no model, no brands). nodriver, zendriver, SeleniumBase, Selenium, botasaurus and DrissionPage need a manual call.
5. **Re-assert touch emulation after navigation.** Pydoll measured `maxTouchPoints` reverting to 0 after the first navigation on Chrome 152.
6. **Keep timezone, locale and Accept-Language consistent with the proxy's exit IP geography.** Pydoll's README explicitly warns that mismatches are more suspicious than no spoofing.

### Cited Findings
- Accuracy is required: "Omitting latitude, longitude or accuracy emulates position unavailable" — [zendriver cdp/emulation.py](https://github.com/cdpdriver/zendriver/blob/main/zendriver/cdp/emulation.py); "Chrome reports POSITION_UNAVAILABLE when the override carries no accuracy" — [pydoll playwright/_browser_context.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/playwright/_browser_context.py)
- Touch reverting after navigation — [pydoll fingerprint_applier.py](https://github.com/autoscrape-labs/pydoll/blob/main/pydoll/browser/fingerprint_applier.py)
- Layer consistency warning ("A browser that renders as macOS while its Accept-Language says Brazilian Portuguese, its timezone says Tokyo, and its IP geolocates to Germany is more suspicious…") — [pydoll README](https://pypi.org/project/pydoll-python/)

### Inferences
- For mobile local-rank checks, the order of preference is: pydoll 3 `apply_fingerprint` (most complete), then Playwright or patchright with a device descriptor plus a CDPSession client-hints patch, then zendriver or nodriver with manual CDP.

### Gaps
- Nothing was executed against a live browser in this session. All findings come from source reading of the published packages.
- Google's use of `Sec-CH-UA-Model` and other high-entropy hints for local SERP was out of scope here.
