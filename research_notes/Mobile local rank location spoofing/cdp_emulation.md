# CDP mechanics for emulating a mobile device in a specific location, and the fingerprint consistency pitfalls

Method note: chromedevtools.github.io, playwright.dev, pptr.dev, developer.chrome.com, source.chromium.org and issues.chromium.org could not be reached from the research sandbox (they were blocked by the network policy). Instead, the exact command and parameter definitions below come from the **official protocol JSON shipped in the `devtools-protocol` npm package, version 0.0.1746437** (Chromium tip-of-tree, late 2026). This is the same source that chromedevtools.github.io/devtools-protocol/tot is generated from. Citations to it use the npm page. How the frameworks apply the overrides was read from the **playwright-core 1.65.1** bundle on npm and from **Puppeteer's `EmulationManager.ts` on GitHub `main`**. Web-search findings are cited inline. Many of them come from vendor or affiliate blogs, and these are flagged where they appear.

Primary source links:
- Protocol JSON: [devtools-protocol npm (0.0.1746437)](https://www.npmjs.com/package/devtools-protocol), rendered docs at [chromedevtools.github.io/devtools-protocol/tot](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)
- [Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts)
- [playwright-core npm 1.65.1](https://www.npmjs.com/package/playwright-core). The relevant code is in `server/chromium/crPage.ts` and `crServiceWorker.ts`, which are bundled into `lib/coreBundle.js`.

---

## Q1. Exact CDP commands and parameters

### Takeaway
Every override except Browser permissions is **per CDP session/target**: per page, per out-of-process iframe (OOPIF), and per worker. Each one has to be reapplied on every target you auto-attach to. Client hints (`Sec-CH-UA-*`, `navigator.userAgentData`) are emulated only when `userAgentMetadata` is passed. A UA string on its own leaves the real desktop client hints in place.

### Cited Findings

**Emulation.setGeolocationOverride** (stable, not experimental) — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- Params, all optional: `latitude`, `longitude`, `accuracy`, `altitude`, `altitudeAccuracy`, `heading`, `speed` (numbers).
- The protocol says: "Omitting latitude, longitude or accuracy emulates position unavailable." So `accuracy` must always be sent. Otherwise the page receives POSITION_UNAVAILABLE.
- `Emulation.clearGeolocationOverride` removes it.
- Puppeteer's `page.setGeolocation()` defaults `accuracy = 0`, checks that -90≤lat≤90 and -180≤lng≤180, and sends only lat/lng/accuracy — [Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts)
- Scope is per page/target. A Mozilla bug notes that the CDP override is per-page, while Gecko had only a browser-wide one — [Bugzilla search result](https://bugzilla.mozilla.org/show_bug.cgi?id=1549436). Puppeteer keeps geolocation as `EmulatedState` and **replays it onto every "speculative"/secondary session** (OOPIF targets) through `registerSpeculativeSession()` — [Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts). Playwright sends `Emulation.setGeolocationOverride` in each FrameSession's `_initialize` (main frame and OOPIFs) — [playwright-core](https://www.npmjs.com/package/playwright-core)
- The override supplies the coordinates, but the page still needs the `geolocation` permission. Without it the page sees a prompt or a denial (see grantPermissions below). A Selenium user reported that Google Maps still showed the real location after the override, which points to a missing permission or target scope — [StackOverflow mirror](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/64133356/python-selenium-override-geolocation-not-working)

**Browser.grantPermissions** (marked **experimental and deprecated**: "Use setPermission instead") — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- `permissions: PermissionType[]` (required), `origin?: string` ("all origins if not specified"), `browserContextId?` (default context if omitted).
- Semantics: "Grant specific permissions to the given origin and **reject all others**."
- The `PermissionType` enum includes `geolocation`, `notifications`, `sensors`, `idleDetection`, `localNetworkAccess`, `localNetwork`, `loopbackNetwork`, `windowManagement`, `storageAccess` and others.
- **Browser.setPermission** (experimental, the replacement): `permission: PermissionDescriptor{name, sysex?, userVisibleOnly?, allowWithoutSanitization?, allowWithoutGesture?, panTiltZoom?}`, `setting: 'granted'|'denied'|'prompt'`, `origin?` (embedding origin, all if omitted), `embeddedOrigin?` (for iframes; it defaults to the embedding origin), `browserContextId?`. For geolocation, use `{permission:{name:'geolocation'}, setting:'granted', origin:'https://www.google.com'}`.
- `Browser.resetPermissions{browserContextId?}` clears the grants.
- These are **browser-level** commands, scoped by BrowserContext and origin, not by target. So they cover new tabs in that context automatically. Playwright calls `Browser.grantPermissions` on the browser session with `origin: undefined` for "*" plus the `browserContextId`, and implements clearPermissions as `Browser.resetPermissions` — [playwright-core](https://www.npmjs.com/package/playwright-core)

**Emulation.setTimezoneOverride** (stable) — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- `timezoneId: string` (required). This is an ICU/IANA ID such as `America/Chicago`. An empty string restores the host timezone.
- Errors seen in framework code: `"Invalid timezone"` and `"Timezone override is already in effect"`. Playwright swallows the second one, which shows the override is shared by targets that share a renderer, so a second session that sets it gets an error — [playwright-core](https://www.npmjs.com/package/playwright-core)

**Emulation.setLocaleOverride** (**experimental**) — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- `locale?: string`, an "ICU style C locale (e.g. "en_US")". Omitted or empty restores the host locale.
- It affects ICU/Intl defaults (number and date formatting, `Intl.*().resolvedOptions().locale`). It does **not** change `navigator.language(s)` or the Accept-Language header. Those come from `acceptLanguage` in setUserAgentOverride, as described next. Playwright sends **both**: `Emulation.setLocaleOverride{locale}` and `Emulation.setUserAgentOverride{acceptLanguage: locale}`. It also swallows the error "Another locale override is already in effect" — [playwright-core](https://www.npmjs.com/package/playwright-core)

**Emulation.setUserAgentOverride / Network.setUserAgentOverride** (identical params) — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- `userAgent: string` (required), `acceptLanguage?: string` ("Browser language to emulate". This drives the Accept-Language header and navigator.languages), `platform?: string` ("The platform navigator.platform should return"), and `userAgentMetadata?: UserAgentMetadata` (experimental, "To be sent in Sec-CH-UA-* headers and returned in navigator.userAgentData").
- The protocol says: "`userAgentMetadata` must be set for Client Hint headers to be sent."
- `UserAgentMetadata` fields: `brands?: {brand,version}[]` (Sec-CH-UA), `fullVersionList?: {brand,version}[]`, `fullVersion?` (deprecated), **required** `platform`, `platformVersion`, `architecture`, `model`, `mobile: boolean`, plus optional `bitness`, `wow64`, `formFactors?: string[]` (Sec-CH-UA-Form-Factors). "Missing optional values will be filled in by the target with what it would normally use." This means that if `brands`/`fullVersionList` are left out, the real Chrome brand list is used.
- Playwright's `calculateUserAgentMetadata()` takes `platform:"Android"`, `platformVersion` and `architecture:"arm"` from an `Android x` UA. It sets `mobile` from `isMobile` and leaves `model:""` empty. It does not set brands, so they come from the real browser — [playwright-core](https://www.npmjs.com/package/playwright-core). An empty `model` on an Android profile is a small consistency gap, because real Android Chrome returns the device model (for example `Pixel 8`) from `getHighEntropyValues(['model'])`.
- The current real Android Chrome UA is the reduced form `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/<major>.0.0.0 Mobile Safari/537.36`. The Android version and model are frozen to "Android 10; K" (rolled out fully in Chrome 113 / May 2023), and the real model and version are available only through the Sec-CH-UA-Model and Sec-CH-UA-Platform-Version hints — [Chrome for Developers](https://developer.chrome.com/blog/user-agent-reduction-android-model-and-version), [MDN UA reduction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction). A spoofed UA that contains a real model and Android version (for example "Android 14; Pixel 8") is therefore an *outdated*, inconsistent string for a current Chrome version.

**Emulation.setDeviceMetricsOverride** (stable) — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- Required: `width`, `height` (int, 0 disables), `deviceScaleFactor` (0 disables), `mobile: boolean` ("viewport meta tag, overlay scrollbars, text autosizing and more").
- Optional: `screenOrientation{type, angle}`. The experimental ones are `scale`, `screenWidth`, `screenHeight`, `positionX`, `positionY`, `dontSetVisibleSize`, `viewport`, `scrollbarType`, `screenOrientationLockEmulation`, `viewportMeta`, `textLayoutMode`. `displayFeature` and `devicePosture` are deprecated (they are replaced by `setDisplayFeaturesOverride` and `setDevicePostureOverride`).
- It overrides `screen.width/height`, `innerWidth/innerHeight` and the device-width/height media queries.
- **Must be set when the page target attaches, before navigation.** Puppeteer flags `reloadNeeded` when `isMobile` or `hasTouch` changes, and swallows the error "Target does not support metrics override" (which affects some targets, for example OOPIFs) — [Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts)
- Other mobile-related experimental commands: `setSafeAreaInsetsOverride` (env(safe-area-inset-*)), `setSmallViewportHeightDifferenceOverride` (svh vs lvh, used to imitate a mobile URL bar), `setHardwareConcurrencyOverride{hardwareConcurrency}`, `setDataSaverOverride`, `setSensorOverrideEnabled` (accelerometer, gyroscope and so on), and `setEmulatedOSTextScale` — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)

**Emulation.setTouchEmulationEnabled** (stable) — `enabled: boolean`, `maxTouchPoints?: integer` ("Defaults to one"). Real phones report 5 or more, so pass `maxTouchPoints: 5` (or the target device's real value) explicitly. Otherwise `navigator.maxTouchPoints === 1` gives the emulation away. `Emulation.setEmitTouchEventsForMouse{enabled, configuration?: 'mobile'|'desktop'}` is experimental — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol). Puppeteer sends `setTouchEmulationEnabled{enabled: hasTouch}` **without** maxTouchPoints, and Playwright sends `{enabled:true}`. Both therefore produce 1 by default — [Puppeteer](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts), [playwright-core](https://www.npmjs.com/package/playwright-core)

**Emulation.setEmulatedMedia** (stable) — `media?: string` (an empty string disables it), `features?: {name, value}[]`. For a phone profile, set `features: [{name:'pointer',value:'coarse'},{name:'hover',value:'none'},{name:'any-pointer',value:'coarse'},{name:'any-hover',value:'none'}]` when these aren't already flipped by touch emulation. `prefers-color-scheme` and `prefers-reduced-motion` are also available. Playwright only sends color-scheme, reduced-motion, forced-colors and contrast — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol), [playwright-core](https://www.npmjs.com/package/playwright-core)

**Network.setExtraHTTPHeaders** (stable) — `headers: Headers` ("Specifies whether to always send extra HTTP headers with the requests from this page"). It is page-scoped. Using it to set Accept-Language changes the header **but not** `navigator.languages`, which creates a header/JS mismatch. `acceptLanguage` in `setUserAgentOverride` is preferred because it covers both — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)

**Target plumbing** — `Target.setAutoAttach{autoAttach, waitForDebuggerOnStart, flatten?, filter?}` "automatically attach[es] to new targets which are considered to be directly related to this one (for example, iframes or workers)… You might want to call this recursively." With `waitForDebuggerOnStart: true`, overrides are sent first and then `Runtime.runIfWaitingForDebugger` is called. `Target.createBrowserContext{proxyServer?, proxyBypassList?, disposeOnDetach?}` gives a separate proxy for each context. `Page.addScriptToEvaluateOnNewDocument{source, worldName?, runImmediately?}` runs in every frame but **not in workers** — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)

**Network conditions** — `Network.emulateNetworkConditions` is now **deprecated** in favor of `Network.emulateNetworkConditionsByRule` plus `Network.overrideNetworkState{offline, latency, downloadThroughput, uploadThroughput, connectionType?}`. The latter sets `navigator.connection` and can make it report `cellular4g` on a mobile profile — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)

### Inferences
- Minimum per-target sequence for a "mobile in City X" page target: `Emulation.setUserAgentOverride{userAgent, acceptLanguage, platform:'Linux armv8l', userAgentMetadata{brands, fullVersionList, platform:'Android', platformVersion, architecture:'', model, mobile:true, bitness:'', formFactors:['Mobile']}}` → `setDeviceMetricsOverride{width, height, deviceScaleFactor, mobile:true, screenOrientation}` → `setTouchEmulationEnabled{enabled:true, maxTouchPoints:5}` → `setEmulatedMedia{features: pointer/hover}` → `setTimezoneOverride` → `setLocaleOverride` → `setGeolocationOverride{lat, lng, accuracy}`. Once per context: `Browser.setPermission{geolocation, granted, origin}`. The values for navigator.platform ("Linux armv8l" or "Linux aarch64") and for the empty architecture/bitness on Android come from common knowledge of real devices. I did not verify them against a primary source in this session. Check them on a real phone.
- Because the target fills in missing `brands`, passing only `platform`/`mobile`/`model` keeps the correct real Chrome brand/version list. That is good, as long as the UA string's major version matches the real browser version.

### Gaps
- I could not reach the rendered CDP docs or the Chromium source to confirm exactly how the timezone override is scoped (per renderer process vs per frame). The "already in effect" errors suggest it is shared per process. This is an inference.
- I found no primary source that states whether geolocation overrides persist across same-target navigations. Framework code applies them once per session and does not reapply them on navigation, which implies they persist for the life of the target.

---

## Q2. Chrome launch flags and environment

### Takeaway
Launch-level settings change the browser's *real* baseline, which workers and other un-instrumented targets inherit. CDP overrides only change instrumented targets. The most robust setup sets both: launch flags and env so the baseline is consistent, and CDP overrides as well.

### Cited Findings
- `--accept-lang` is described in the Chromium switch list as "Specifies Accept-Language to send to servers and expose to JavaScript via the navigator.language DOM property". `--lang` is reported to work reliably only on Windows. On Linux, the `LANGUAGE` env var is the reported method, and headless Linux has been reported to take Accept-Language from the OS — [peter.sh switch list](https://peter.sh/experiments/chromium-command-line-switches/), [StackOverflow mirror (Cypress)](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/54671266/setting-the-browser-language-in-cypress), [StackOverflow mirror (headless Accept-Language)](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/49553714/headless-chrome-does-not-send-accept-language-header). These sources conflict. Treat the behavior as version-dependent and test it.
- Profile preference `intl.accept_languages` (in the Preferences file of the user data dir) is a further option. One report says it did not change navigator.languages — [StackOverflow mirror](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/36072584/how-to-change-chrome-settings-to-test-using-navigator-language)
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` (or the enterprise policy `WebRtcIPHandling`) stops WebRTC UDP from bypassing the proxy. Chrome has no UI setting for this. The mDNS flag hides only local IPs and does not hide the public IP — [WebRTC-Leak-Prevent docs](https://github.com/aghorler/WebRTC-Leak-Prevent/blob/master/DOCUMENTATION.md), [Mullvad](https://mullvad.net/help/webrtc)

### Inferences
- `TZ=America/Chicago` in the Chrome process environment (Linux/macOS) sets the real baseline timezone for **all** renderer processes, including service workers. This closes the worker timezone leak that CDP alone leaves open. This is standard POSIX/ICU behavior, but I found no Chromium-specific source in this session.
- `--user-agent=<mobile UA>` sets the UA string for every context, including workers, but it does **not** set client hints. `navigator.userAgentData.platform` and `mobile` would still describe the host (for example `"Linux"`, `mobile:false`). That is a classic mismatch. I found no flag that sets UA-CH metadata.
- A dedicated `--user-data-dir` for each persona keeps cookies, permissions, Preferences (accept_languages) and the service-worker cache separate between "locations". Service workers registered under one persona would otherwise carry over.

### Gaps
- I could not confirm a current (2025-2026) authoritative statement on how `--lang` behaves on Linux headless (`--headless=new`).

---

## Q3. Which overrides reach workers, iframes and new tabs (common leaks)

### Takeaway
Same-process iframes inherit the page's overrides. OOPIFs and workers are separate targets and receive nothing unless you auto-attach and reapply the overrides. Even Playwright reapplies only the UA/Accept-Language to dedicated workers. It reapplies **no** timezone, locale or geolocation to workers, and it detaches from service workers that appear under a page. Detectors exploit these gaps by reading `navigator` and `Intl` inside a Worker and comparing them with the page.

### Cited Findings
- Playwright's `_onAttachedToTarget`: an `iframe` target gets a full new FrameSession (timezone, locale, geolocation, UA, touch and so on are all reapplied). A `service_worker` target attached under a page is **detached immediately**. A `worker` (dedicated) target receives **only** `_updateUserAgent(session)` (UA + acceptLanguage + userAgentMetadata), and only when userAgent or locale was set. Separately, the context-level `CRServiceWorker` applies `updateUserAgent()`, extra HTTP headers and offline state to service workers. It applies no timezone or locale — [playwright-core 1.65.1](https://www.npmjs.com/package/playwright-core)
- Puppeteer replays all EmulatedState (viewport, timezone, locale, geolocation, media and so on) onto secondary sessions registered with `registerSpeculativeSession` (OOPIF frames) — [Puppeteer EmulationManager.ts](https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/EmulationManager.ts)
- A known puppeteer-extra issue: "Web Workers are leaking the true navigator.platform" even when it is overridden on the page. The maintainer mentioned an internal fix covering all three worker types — [lightrun/puppeteer-extra](https://lightrun.com/answers/berstend-puppeteer-extra-web-workers-are-leaking-the-true-navigatorplatform)
- CreepJS flags both `hasHeadlessUA` and `hasHeadlessWorkerUA`. Detectors start a worker, read the WorkerNavigator (userAgent, platform, hardwareConcurrency, deviceMemory, languages) and compare it with the page. The described fix is `Target.setAutoAttach{waitForDebuggerOnStart:true}` followed by replaying the overrides on each worker session before resuming it — [Pydoll execution-realms docs (vendor)](https://pydoll.tech/docs/deep-dive/fingerprinting/execution-realms/), [Castle blog](https://blog.castle.io/how-to-detect-headless-chrome-bots-instrumented-with-playwright/)
- In Firefox, the WebDriver BiDi `emulation.setTimezoneOverride` does not yet apply in service workers (open P3 bug). This shows that worker-scope timezone is a recognized gap across engines — [Bugzilla 2039330](https://bugzilla.mozilla.org/show_bug.cgi?id=2039330)
- `Page.addScriptToEvaluateOnNewDocument` runs "in every frame", which excludes workers. So JS-patch spoofing of navigator or Intl does not reach worker realms — [devtools-protocol](https://www.npmjs.com/package/devtools-protocol)
- WebRTC: most proxies carry only TCP, so WebRTC UDP/STUN can reveal the real public IP unless the IP-handling policy is set to `disable_non_proxied_udp`. Test at browserleaks.com/webrtc or ipleak.net — [Pydoll network docs (vendor)](https://pydoll.tech/docs/deep-dive/network/network-fundamentals/), [WebRTC-Leak-Prevent docs](https://github.com/aghorler/WebRTC-Leak-Prevent/blob/master/DOCUMENTATION.md)
- Puppeteer's `page.setGeolocation` is per page. Popups and new tabs are new targets, so the override has to be reapplied to them. This is my inference from the per-target design. A third-party guide also describes the overrides as "per-tab CDP state" — [cascadinglabs guide](https://cascadinglabsfe.pages.dev/voidcrawl/guides/emulation/)

### Inferences
- Leak matrix (based on the code above; verify by testing):
  | Signal | Page (CDP) | OOPIF | Dedicated worker | Service/shared worker | New tab/popup |
  |---|---|---|---|---|---|
  | UA string / acceptLanguage / UA-CH | yes | only if reapplied | only if reapplied (Playwright does) | only if attached and reapplied | only if reapplied |
  | navigator.platform (via `platform` param) | yes | reapply | reapply | reapply | reapply |
  | Timezone (Intl, Date) | yes | reapply (may share process) | **likely leaks** unless same-process inheritance or TZ env | **leaks** unless TZ env | reapply |
  | Locale (Intl default) | yes | reapply | likely leaks | leaks unless OS locale/LANG | reapply |
  | Geolocation coords | yes | reapply | n/a (no geolocation API in workers) | n/a | reapply |
  | Permissions | context-wide | context-wide | — | — | covered |
  | Device metrics/touch | top frame | inherits viewport | `hardwareConcurrency` / `deviceMemory` leak real values | same | reapply |
- The safest pattern: set the real OS-level baseline to match the persona (TZ env, LANG/LANGUAGE, `--accept-lang`, a proxy in the target city), and use CDP only for what the OS cannot change (mobile metrics, touch, UA-CH). Then auto-attach recursively to all targets (`Target.setAutoAttach{autoAttach:true, waitForDebuggerOnStart:true, flatten:true}` plus `Target.setDiscoverTargets`) and reapply on each.

### Gaps
- I did not find an authoritative Chromium statement on whether `Emulation.setTimezoneOverride` set on a page also applies to dedicated workers in the same renderer process. Test it with `new Worker(URL.createObjectURL(new Blob(['postMessage(Intl.DateTimeFormat().resolvedOptions().timeZone)'])))`.

---

## Q4. Fingerprint consistency checklist

### Takeaway
Detectors (and Google's own risk systems) score coherence across signals. Spoofing one signal while leaving others inconsistent is often worse than not spoofing at all. On a desktop host, the hardest signals to make consistent with "mobile" are GPU/WebGL, fonts, audio/canvas hashes and hardware counts.

### Cited Findings
- Pixelscan checks IP vs timezone vs language. It shows JS time/timezone next to the time derived from the IP, classifies the IP as datacenter, residential or mobile, and tests WebRTC. Whoer compares system time and language with the IP's timezone and checks DNS and WebRTC leaks — [Octo Browser blog (vendor)](https://blog.octobrowser.net/how-anonymity-checkers-pixelscan-browserleaks-whoer-and-creepjs-work), [dev.to Octo](https://dev.to/octobrowser/how-anonymity-checkers-work-pixelscan-browserleaks-whoer-and-creepjs-5b37)
- CreepJS probes many signals and looks for contradictions ("lies"), including in workers. It does not check IP reputation. BrowserLeaks shows raw values without judging them ("BrowserLeaks shows what you have. Pixelscan checks whether you're lying") — [Octo Browser blog](https://blog.octobrowser.net/how-anonymity-checkers-pixelscan-browserleaks-whoer-and-creepjs-work), [send.win (vendor)](https://blog.send.win/what-is-the-best-creepjs-alternative-for-your-check/)
- GPU: headless Chromium often reports a "Google SwiftShader" WebGL renderer (llvmpipe and Mesa strings are similar tells). Detectors check whether GPU vendor/renderer, canvas and extensions agree with the claimed UA/OS. A mobile UA with an "ANGLE (NVIDIA … Direct3D11)" or SwiftShader renderer is incoherent, because real Android reports Adreno, Mali or PowerVR — [Castle blog on WebGL renderer](https://blog.castle.io/the-role-of-webgl-renderer-in-browser-fingerprinting/), [twsc wiki](https://publish.obsidian.md/twsc-public/Web+Scraping/Wiki/concepts/browser-fingerprinting)
- Touch: desktop reports `maxTouchPoints` 0 and mobile reports a positive value. A mobile UA with 0 (or exactly 1 from CDP's default) is a mismatch — [twsc wiki](https://publish.obsidian.md/twsc-public/Web+Scraping/Wiki/concepts/browser-fingerprinting)
- UA vs `navigator.platform` mismatches are a standard red flag — [trustmyip fingerprint consistency](https://trustmyip.com/fingerprint-consistency)
- Android UA format: a current Chrome on Android sends a reduced UA ("Android 10; K") and exposes the model only via UA-CH. A spoofed UA must follow this format, and `userAgentData.getHighEntropyValues(['model','platformVersion'])` should return real-looking values — [Chrome for Developers](https://developer.chrome.com/blog/user-agent-reduction-android-model-and-version)

### Inferences — checklist
1. **IP geolocation** (a residential or mobile-carrier proxy in the target city/metro) agrees with **timezone** (`setTimezoneOverride` + TZ env), with **geolocation coords** (within the IP's metro area, with a realistic `accuracy` of about 20–100 m rather than 0), with **locale** / **Accept-Language** / `navigator.languages` (for example `en-US,en;q=0.9` for the US), and with the Google domain/`hl`/`gl` params used.
2. **UA string** (the reduced Android format, with a Chrome major version equal to the real binary's) agrees with `userAgentData.brands` / `fullVersionList` (leave them to the target), `platform:"Android"`, `mobile:true`, a non-empty `model`, `navigator.platform` (Linux armv8l/aarch64, not "Linux x86_64" or "Win32"), and `Sec-CH-UA-Mobile: ?1`.
3. **Screen** agrees with the viewport: `screen.width/height` equals the device's CSS pixels (for example 412×915), `devicePixelRatio` is about 2.625–3.5, `innerWidth` ≤ `screen.width`, `outerWidth/Height` are consistent, `screen.orientation` matches, and `availHeight` is slightly smaller than height.
4. **Input** media: `pointer:coarse`, `hover:none`, `any-hover:none`, `maxTouchPoints` ≥ 5, and `ontouchstart in window`.
5. **Hardware**: `hardwareConcurrency` (8 is typical for phones, set via `setHardwareConcurrencyOverride`), `deviceMemory` (cannot be set via CDP; phones commonly report 4 or 8), and battery and sensors present.
6. **GPU/WebGL/canvas/audio/fonts**: these cannot be made to look like a phone through CDP. A desktop host shows desktop fonts (for example Windows Segoe UI, or Linux DejaVu) and a desktop GPU. This is the largest residual inconsistency.
7. **Workers/OOPIFs/new tabs** all report the same values as the page (Q3).
8. **WebRTC** reveals no non-proxy IP. **DNS** resolves through the proxy.
9. **Automation tells**: `navigator.webdriver`, the `HeadlessChrome` UA, CDP `Runtime.enable` side effects. These are out of scope here, but detectors weigh them as well.

### Gaps
- I found no primary (browser-vendor or academic) source quantifying how Google specifically weighs these signals for search localization. Most fingerprint-checker descriptions come from vendor or affiliate blogs.

---

## Q5. Verification tools

### Takeaway
Use several tools together. Pixelscan and Whoer check IP vs timezone/language. CreepJS checks internal lies, including worker mismatches. BrowserLeaks shows raw values for each subsystem (WebRTC, WebGL, client hints, geolocation).

### Cited Findings
- Pixelscan: location (IP/timezone/language) mismatch, IP type, blacklists, WebRTC. Whoer: system time and language vs IP timezone, DNS, WebRTC. CreepJS: about 21 signal groups and contradiction detection, with no IP reputation check. BrowserLeaks: raw canvas, WebGL, audio, fonts, network and WebRTC pages — [Octo Browser blog](https://blog.octobrowser.net/how-anonymity-checkers-pixelscan-browserleaks-whoer-and-creepjs-work)
- Useful BrowserLeaks pages to check: /webrtc, /webgl, /client-hints (Sec-CH-UA headers vs JS), /geo, /javascript (navigator, screen, Intl). For timezone and Intl in particular, scrapfly's timezone-intl detector is another option — [scrapfly tool](https://scrapfly.io/web-scraping-tools/timezone-intl), [Pydoll network docs](https://pydoll.tech/docs/deep-dive/network/network-fundamentals/)

### Inferences
- Add your own test page that compares page vs dedicated worker vs service worker values for `navigator.userAgent`, `userAgentData`, `platform`, `languages`, `hardwareConcurrency` and `Intl.DateTimeFormat().resolvedOptions()`. The public checkers do not always test service workers.

### Gaps
- I could not fetch the checkers' own documentation or source. The descriptions above are from secondary sources.

---

## Q6. Real Android device / emulator vs desktop CDP emulation

### Takeaway
For accuracy, a real Android phone driven over ADB-forwarded CDP is the most coherent option. Every hardware, GPU, font, sensor, UA-CH and worker signal is genuine, and you then override only timezone and geolocation (or set them at the OS level). The trade-off is weaker tooling support (Puppeteer does not officially support it) and the work of running real hardware.

### Cited Findings
- Setup: `adb forward tcp:9222 localabstract:chrome_devtools_remote`. Read `http://localhost:9222/json/version` for the browser WebSocket and then call `puppeteer.connect({browserWSEndpoint})` — [Chrome DevTools remote debugging](https://developer.chrome.com/docs/devtools/remote-debugging), [chrome-devtools-mcp Android doc](https://glama.ai/mcp/servers/@ChromeDevTools/chrome-devtools-mcp/blob/fbba3c9461cec8113216fa4569e879c85312ea29/docs/debugging-android.md)
- The chrome-devtools-mcp docs call this "experimental", because "Puppeteer does not officially support Chrome on Android as a target" — [chrome-devtools-mcp Android doc](https://glama.ai/mcp/servers/@ChromeDevTools/chrome-devtools-mcp/blob/fbba3c9461cec8113216fa4569e879c85312ea29/docs/debugging-android.md)
- Playwright has an "isClank" (Chrome-on-Android) code path and skips viewport emulation on it. This shows that framework support for driving Android Chrome over CDP exists but is limited — [playwright-core](https://www.npmjs.com/package/playwright-core)
- Hosted bridges (for example Mobilerun) expose the device's `chrome_devtools_remote` socket over WebSocket for puppeteer-core — [Mobilerun docs](https://docs.mobilerun.ai/browser-automation)

### Inferences
- **Real device**: has a genuine GPU (Adreno or Mali), fonts, touch, sensors, UA-CH model and workers. The IP comes from the phone's network (mobile carrier) or a proxy configured on the device. Timezone can be changed in Android settings or over adb (`adb shell settings put global auto_time_zone 0` + `setprop persist.sys.timezone`), which is consistent everywhere including workers. GPS can be set with a mock-location app or with CDP `setGeolocationOverride` + `Browser.setPermission`. The OS location services also matter, because Chrome on Android can use network location.
- **Android emulator (AVD)**: real Android Chrome with genuine UA-CH, but the GPU is usually a host-translated or SwiftShader-like renderer ("Android Emulator OpenGL ES Translator", or a host GPU string). `ro.kernel.qemu` and build props, the sensor and battery profile, and the x86_64 ABI (on non-ARM images) are tells. The emulator has `adb emu geo fix <lng> <lat>` for GPS. It sits between desktop emulation and a real device in accuracy.
- **Desktop CDP emulation**: cheapest and most scalable, but it cannot hide the desktop GPU, fonts or audio stack, and it needs careful per-target reapplication. It is acceptable when the target (for example Google SERP localization) mainly uses IP, UA-CH/mobile flag, Accept-Language and the geolocation permission, rather than hard fingerprint scoring.

### Gaps
- I found no measured comparison of how Google SERP or local-pack results differ between real-device, emulator and desktop-emulated sessions for the same location. This would need an empirical test.
- I could not verify the emulator GPU renderer strings for current (2025-2026) AVD images from a primary source.
