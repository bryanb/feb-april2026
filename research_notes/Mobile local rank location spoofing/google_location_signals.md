# How Google Search Determines a Searcher's Location (for local rank tracking)

Research note on method: WebFetch was blocked for almost every relevant host in this session (support.google.com, serpapi.com, whitespark.ca, brightlocal.com, seroundtable.com, geogrid.dev, khoury.northeastern.edu). So most findings below come from search-engine snippets of those pages, not full-page reads. Exact wording, especially Google Help wording, should be checked against the live pages before anyone quotes it.

## 1. What signals does Google use, and in what priority?

### Takeaway
Google's own documentation names four location sources: (1) precise device location, sent only when the user grants location permission to google.com or a Google app; (2) IP address, giving a "general area"; (3) saved Home/Work places; (4) past activity. When permission is granted, Google says the precise device location is what gets used. IP is the fallback or default when no precise location is available. The `uule` parameter and cookie is a separate, undocumented channel. In practice it carries the same kind of payload that the device-location channel (the X-Geo header) carries. `gl`, `hl` and Accept-Language mainly control country and language, not city-level location.

### Cited Findings
- **Precise device location takes priority when permission is granted.** Google Help (Android version): if both the browser-level and site-level location permissions are granted, "your precise location will be used by Google to show you the best search results." — [Google Search Help, Android](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DAndroid); same wording on the desktop version: [Google Search Help, Computer](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- Google Help: you control whether location is sent from your device to a site like google.com through the browser's location permissions. — [Google Search Help, Computer](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- **IP is the coarse fallback.** Google Help: if your IP address was used to estimate your current general area, the footer says "From your internet address." Another Google page: by default Google identifies your approximate city from your computer's IP address. — [Google Search Help, Computer](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop); [Google Search Help, results differ](https://support.google.com/websearch/answer/12412910?hl=en)
- Google's location-data policy: Google can infer a "general area" from the IP address, since addresses are "roughly based on geography." It also uses IP for basic features such as detecting a sign-in from a new city. — [Google Policies: How Google uses location information](https://policies.google.com/technologies/location-data?hl=en-US)
- On Android, the device estimates location from GPS, sensors, mobile network signals and Wi-Fi. Google Location Accuracy refines that estimate. — [Google Policies: location data](https://policies.google.com/technologies/location-data?hl=en-IN)
- **Home and Work.** If set, these can be used "to help you ... find results closer to your home or work". The footer then says "Based on your places (Home)" or "(Work)". — [Google Policies](https://policies.google.com/technologies/location-data?hl=en-US); [Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- **Past activity.** Saved activity can include the general area a search came from. That area is at least 3 sq km, or larger until it covers at least 1,000 people. Timeline (formerly Location History) is a separate optional setting. — [Google Policies](https://policies.google.com/technologies/location-data?hl=en-US)
- Google Policies: the precise location your device sent is not stored; only its general area is. — [Google Policies](https://policies.google.com/technologies/location-data?hl=en-US)
- Third-party guide: when you are not signed in, turn off Search customization so Google won't use past searches to estimate location. This implies cookie-based (NID) activity is a signal even when logged out. — [Mangools](https://mangools.com/blog/how-to-change-location-on-google/)
- **X-Geo header, Chrome's path for sending device location.** A 2013 Chromium code review: "Send location via X-Geo header with omnibox searches to google.com", sent when the user has allowed location sharing with Google. The header is a protobuf, base64-encoded. — [Chromium code review 12189002](https://codereview.chromium.org/12189002/)
- Chromium Android `GeolocationHeader.java`: X-Geo is sent only to Google domains, only in non-incognito mode, only if the user hasn't blocked geolocation for that URL, and only if a fresh location is available. — [GeolocationHeader.java (crosswalk mirror)](https://github.com/crosswalk-project/chromium-crosswalk/blob/master/chrome/android/java/src/org/chromium/chrome/browser/omnibox/geo/GeolocationHeader.java)
- **UULE.** Third-party tools describe UULE as an encoded location (a place name or a precise lat/lng) usable as a cookie, a URL parameter, or the x-geo header that Google's app uses. — [Multilogin](https://multilogin.com/blog/how-to-check-google-results-by-location/); [Linktrust UULE tool](https://linktrust.pro/tools/uule)
- The gslocation Chrome extension (built to spoof search location) works by adding an X-Geo header to google.com requests and writing a UULE cookie. — [VorticonCmdr/gslocation](https://github.com/VorticonCmdr/gslocation); [valentin.app GS Location Changer](https://valentin.app/gs-location-changer.html)
- **There are two UULE formats.** "w+CAIQICI…" is the canonical-name format: base64 of a protobuf with role 2, producer 32, and a canonical location name from Google Ads geotargets. "a+cm9sZT…" is an ASCII text payload ("role:1\nproducer:12…") with a `latlng` block holding `latitude_e7` and `longitude_e7` (coordinates × 10^7). SerpApi publishes a generator and decoder for both. — [SerpApi UULE Generator](https://serpapi.com/tools/uule-generator); [serpapi/uule_converter](https://awesome.ecosyste.ms/projects/github.com%2Fserpapi%2Fuule_converter); [valentin.app UULE](https://valentin.app/uule.html); [NetNut docs](https://help.netnut.io/netnut-documentation/netnut-scraper-apis/serp-api/google-scraper/google-search/geo-location)
- **Old research (2013–2015).** Northeastern University found that geolocation was the single feature causing the most personalization in Google results, and that Google infers location from IP. — [Kliman-Silver et al., IMC 2015](https://personalization.ccs.neu.edu/Projects/Location); [NSI page](https://networkscienceinstitute.org/publications/location-location-location-the-impact-of-geolocation-on-web-search-personalization)

### Inferences
- **Inferred priority order, highest first:**
  1. Explicit location in the request: the `uule` parameter or cookie, or the X-Geo header from Chrome or the Google app.
  2. Precise browser or device location, when permission is granted. This reaches Google through the same X-Geo/uule-type channel.
  3. Saved Home/Work places, when the query or context makes them relevant.
  4. Past activity.
  5. IP geolocation (city-level).
- This order is inferred. Google only explicitly confirms that precise location is used when permitted and that IP is used to estimate a "general area".
- **For the tester's claim:** "the IP isn't as important as the browser information" is largely correct for city- and neighborhood-level local results, if "browser information" means precise geolocation passed with permission (X-Geo) or via uule. A precise location overrides IP-derived city for map-pack and "near me" results. It is not correct if "browser information" means timezone, Accept-Language or user-agent strings. There is no evidence those set the search location (see section 3).
- IP still matters in three ways:
  - It decides the country/market default when no other signal exists.
  - It is what bot detection scores. Datacenter IPs trigger CAPTCHAs and "unusual traffic" blocks.
  - Some vendors report that IP colors results even when uule is set (see section 4).

### Gaps
- Google publishes no explicit precedence ranking. Its Help page lists the sources and footer labels, but not a tie-breaking rule when, say, Home address and device location conflict.
- I could not get the full text of the Kliman-Silver 2015 paper (host blocked). From memory, and unverified here: the authors fed spoofed coordinates through the JavaScript Geolocation API and validated that Google used those coordinates rather than the crawler's IP. This would be the strongest academic support for "precise location beats IP". Verify it from the PDF ([khoury.northeastern.edu](https://khoury.northeastern.edu/home/ancsaaa/files/Geolocation-IMC.pdf)) before citing.
- I found no current (2025–26) documentation of whether desktop Chrome still sends X-Geo. The Chromium evidence is about ten years old and Android-specific.

## 2. What does the SERP footer location line show, and how does it indicate the source?

### Takeaway
The footer shows the location used for the search and which source it came from. Google's documented labels are "From your device" (precise location), "Based on your places (Home)/(Work)", and "From your internet address" (IP). Third-party guides sometimes write the IP label as "From your IP address", and older footers also showed "Based on your past activity". The footer is the single best diagnostic for a tester: it shows directly whether the spoofed location or the IP won.

### Cited Findings
- "From your device": shown when device location was used. — [Google Search Help, Computer](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- "Based on your places (Home) or (Work)": shown when saved Home/Work was used. — [Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- "From your internet address": shown when IP was used to estimate the general area. — [Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)
- Mangools calls the IP label "From your IP address". It advises that if the footer says "From your device", you should block location access for google.com to see the IP-based version. — [Mangools](https://mangools.com/blog/how-to-change-location-on-google/)
- The footer's "Update location" link uses the device's precise location. — [Mangools](https://mangools.com/blog/how-to-change-location-on-google/); [Go Fish Digital](https://gofishdigital.com/blog/google-results-change-location/)
- The footer also carries a personalization note with a "Try without" link to see non-personalized results. — [Google Search Help: Personalization](https://support.google.com/websearch/answer/12410098?)
- Snippet metadata on the Google Help page suggests a last-updated date about 1,305 days back (around 2023). The labels may have been reworded since. — [Google Search Help](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DDesktop)

### Inferences
- "Based on your past activity" is not in the current Google Help snippets I could see. It is probably an older label (pre-2023), or one shown only to signed-in users or users with customization on. Treat it as possibly outdated.
- A practical test protocol for the tester: run the same query three ways — IP only, IP plus geolocation override with permission granted, and a uule parameter. Record the footer label and place name each time. That settles the claim empirically.
- Footer behavior with a uule parameter is not documented by Google. Anecdotally the footer shows the uule-decoded place. Confirm this in the test.

### Gaps
- I could not see the live 2026 wording of the Help page (host blocked).
- I found no Google statement on what the footer shows when uule is supplied.

## 3. Do timezone, locale or Accept-Language mismatches with IP influence results, or only trigger bot detection?

### Takeaway
I found no evidence that browser timezone sets or changes Google's geographic location for search results. Accept-Language, `hl` and `gl` affect language, and country to some degree. Timezone/IP/locale mismatches matter mainly to bot and fingerprint detection. All the evidence is weak: vendor blogs, no controlled tests.

### Cited Findings
- A Mozilla bug discussion says Google picks the result language from Accept-Language combined with GeoIP lookup or a cookie preference. — [Bugzilla 670450](https://bugzilla.mozilla.org/show_bug.cgi?id=670450)
- Location-changer extensions implement `hl`/`gl` by setting the Accept-Language header. They treat these as language/country controls, separate from uule. — [valentin.app GS Location Changer](https://valentin.app/gs-location-changer.html)
- Search Laboratory notes that a mismatch between the Google domain and the browser region can produce the wrong results. — [Search Laboratory, 2021](https://www.searchlaboratory.com/2021/03/easily-change-google-location-settings-with-our-free-chrome-extension/)
- An anti-detect browser vendor says detection systems compare IP geolocation with timezone, language and locale, and flag mismatches as suspicious. — [BotCloud](https://botcloud-dev.pages.dev/blog/timezone-locale-configuration/)
- LLMRefs: browser geolocation overrides change only the reported location, not the whole search environment. Blocking location permission does not stop personalization. — [LLMRefs](https://llmrefs.com/blog/google-search-from-location)
- SerpApi ranks city-level location as the most important SERP factor, followed by device type and Google domain. — [SerpApi blog](https://serpapi.com/blog/how-location-affects-serp-results/)
- **ccTLD change.** SerpApi release notes say that from around Apr 15, 2025, Google began phasing out ccTLD domains (google.de, google.co.uk), redirecting them to google.com. That makes `gl` and other signals more important for country targeting. — [SerpApi Google Local API release notes](https://serpapi.com/google-local-api/release-notes)

### Inferences
- Timezone and locale belong in the "don't get flagged" category, not the "set location" category. A timezone that doesn't match the IP or spoofed location is unlikely to move the map pack. It can raise CAPTCHA and "unusual traffic" rates, which corrupt tracking data.

### Gaps
- I found no controlled experiment that varied timezone alone against Google local results.

## 4. How do commercial rank trackers simulate location, and are there published comparisons?

### Takeaway
The industry standard is uule, increasingly the lat/lng "a+" format for grid trackers. It is often combined with a proxy in the same country or market, plus a mobile user-agent for mobile SERPs. Vendors disagree on how much the IP still matters once uule is set. Whitespark says uule overrides location settings. Several proxy vendors say IP still shapes results; they have a commercial incentive to say so. There are no rigorous public head-to-head experiments, only vendor comparisons.

### Cited Findings
- **Whitespark.** Trackers pass a UULE parameter that pins the search to a city, ZIP or coordinates, overriding device GPS and location settings. Manual checks differ because of location, time and IP: the tracker uses its own server IP. Its position is that the tracker is "accurate at that specific moment, with those specific location settings." — [Whitespark: reported vs manual rankings](https://whitespark.ca/blog/reported-versus-manual-rankings)
- **Local Falcon.** A geo-grid scanner that runs scans "from the exact GPS points where searches happen" across a grid around the business. — [Local Falcon features](https://www.localfalcon.com/features/local-rank-tracker); [LocalVisibilitySystem 2018 review](https://www.localvisibilitysystem.com/2018/10/29/the-lowdown-on-local-falcon-a-new-and-different-local-search-rank-tracking-tool/)
- **Local Falcon vs BrightLocal (vendor comparison, biased).** BrightLocal's ZIP centroid was about 200 m from the business, which "makes a big difference". BrightLocal "loses a bit of accuracy" the further a business is from the ZIP center. — [Local Falcon: Is Local Falcon accurate?](https://localfalcon.com/is-local-falcon-accurate/)
- **BrightLocal.** City- and ZIP-level "location emulation". Its Local Rank Tracker toggles between Mobile and Desktop. BrightLocal says mobile local results vary more because mobile relies more heavily on real-time GPS proximity. — [BrightLocal location emulation blog](https://www.brightlocal.com/blog/location-emulation-track-search-rankings-at-city-or-zipcode-level/); [BrightLocal Local Rank Tracker](https://www.brightlocal.com/tools/local-rank-tracker/)
- **DataForSEO.** Accepts `location_coordinate` (lat,lng, or lat,lng,zoom for Maps, e.g. `40.689199,-73.975035,14z`), `location_code` or `location_name`. Each coordinate is one task, so a 9-point grid means 9 tasks. In its own Brooklyn test, the Organic local pack, Local Finder and Maps endpoints disagreed. — [DataForSEO help: local pack/finder/maps](https://dataforseo.com/help-center/track-local-pack-local-finder-and-google-maps-rankings-with-api); [DataForSEO Maps task_post docs](https://docs.dataforseo.com/v3/serp/google/maps/task_post/); [DataForSEO grid tracker](https://dataforseo.com/help-center/build-grid-rank-tracker-maps)
- **SerpApi.** `location` (canonical name, converted to uule), `uule`, `gl`, `hl`, `google_domain`. Its public UULE generator handles both name- and GPS-based formats. — [SerpApi UULE Generator](https://serpapi.com/tools/uule-generator)
- **Proxy and tool vendors' claims, conflicting and unsourced.** Some say uule is a "weak signal that IP geolocation overrides", or that "the exit IP still shapes the page you get back". Others claim uule delivers "85–95% accuracy". None cite a methodology. — [PXM2](https://pxm2.io/use-cases/business/mobile-proxy-seo-rank-tracking/); [IPBurger](https://www.ipburger.com/blog/how-to-track-local-seo-rankings-with-geo-targeted-residential-proxies/); [mobileproxies.org](https://mobileproxies.org/blog/best-proxies-for-seo-rank-tracking-2026); [LLMRefs](https://llmrefs.com/blog/google-search-from-location); contrast with [Whitespark](https://whitespark.ca/blog/reported-versus-manual-rankings)
- Browser GPS applies only to browser-based searches, not to API rank tracking. Desktop Google without permission relies on IP, which is often accurate only to city level. — [GeoGrid.dev blog](https://geogrid.dev/blog/geo-location-rank-tracking)

### Inferences
- The professional local-grid trackers (Local Falcon, DataForSEO grid, SerpApi lat/lng uule) rely on uule or coordinates, not on residential IPs in each grid cell. That is strong practical evidence that coordinates (uule/X-Geo) dominate IP for local pack ranking. If IP dominated, sub-city geo-grids would show identical results in every cell. Geo-grid heatmaps visibly vary over a few hundred meters, which no IP geolocation can resolve.
- The "IP still matters" claims come mostly from proxy sellers. The likely real effects of IP: (a) the country/market default; (b) CAPTCHA and block rates; (c) possibly some blending for organic (non-pack) results. None of these were rigorously demonstrated.
- I found nothing on Places Scout specifically; it is presumed to work like the other grid trackers.

### Gaps
- I found no independent, published controlled experiment (2024–2026) comparing IP-only vs geolocation-override vs uule on the same queries.
- No Places Scout documentation was found.
- BrightLocal's exact current mechanism (uule format, proxy type) is not publicly documented in what I could reach.

## 5. Mobile vs desktop differences

### Takeaway
Mobile searches are far more likely to carry a precise device location: GPS through the Google app, Android, or Chrome mobile with permission. So mobile map-pack and "near me" results track proximity tightly. Desktop searches without permission default to IP (city-level) or saved places. Rank trackers therefore model mobile with coordinate uule plus a mobile user-agent.

### Cited Findings
- BrightLocal: mobile searches rely more heavily on real-time GPS proximity, so local results vary between devices. — [BrightLocal Local Rank Tracker](https://www.brightlocal.com/tools/local-rank-tracker/)
- Desktop Google typically relies on IP-based geolocation, which is often city-level only. — [GeoGrid.dev](https://geogrid.dev/blog/geo-location-rank-tracking)
- Android supplies GPS, Wi-Fi, cell and sensor location. When permissions are granted, Google uses the precise location for search. — [Google Policies](https://policies.google.com/technologies/location-data?hl=en-IN); [Google Search Help, Android](https://support.google.com/websearch/answer/179386?hl=en&co=GENIE.Platform%3DAndroid)
- Chromium Android sends X-Geo with fresh device location on Google searches in non-incognito mode. — [GeolocationHeader.java](https://github.com/crosswalk-project/chromium-crosswalk/blob/master/chrome/android/java/src/org/chromium/chrome/browser/omnibox/geo/GeolocationHeader.java)
- DataForSEO's Local Finder returns up to 20 results by default on desktop. Local pack, Local Finder and Maps can disagree for the same location. — [DataForSEO help](https://dataforseo.com/help-center/track-local-pack-local-finder-and-google-maps-rankings-with-api)
- "Near me" queries: a Search Engine Land study found that having "near me" in a brand name does not help rankings. The query is resolved against the searcher's location, not the keyword. — [Search Engine Land](https://searchengineland.com/?p=385227)

### Inferences
- For a mobile local rank-tracking setup, the meaningful variable is the coordinate supplied: a geolocation override with permission, or a lat/lng uule. A mobile-carrier or residential IP in the same metro mostly reduces blocking and sets the market. This supports the tester's claim for mobile in particular.

### Gaps
- I found no published 2025–26 quantification of how much mobile and desktop pack results diverge for the same coordinate.

## 6. Current state (2025–2026) and changes

### Takeaway
UULE still works and is still the industry standard. SerpApi is still patching uule-related issues in 2026. Google never documented `&near=`, which has been unreliable and intermittently broken for years. The Search Tools location filter was removed long ago (about 2012–2013). Google began redirecting ccTLDs to google.com from April 2025. No authoritative 2025 deprecation of uule was found.

### Cited Findings
- SerpApi release notes list UULE-related fixes in mid-2026, and the ccTLD phase-out starting around Apr 15, 2025. — [SerpApi release notes](https://serpapi.com/google-local-api/release-notes)
- `&near=city` was reported to have stopped working at points (undated comment thread), while uule tracking "stopped working, but now it's working again". — [Blumenthals blog thread](https://blumenthals.com/blog/?p=18834)
- An SER article reports `&near` working at some point. It is older; the date was not retrieved. — [Search Engine Roundtable](https://www.seroundtable.com/google-near-parameter-works-21277.html)
- Google permanently removed the Search Tools location filter (older, about 2012–2013), and dropped the "more results near…" link. — [SearchEnginePeople](https://www.searchenginepeople.com/blog/15123-google-local-search-tool-filter.html); [Search Engine Land](https://searchengineland.com/google-local-results-drops-more-results-near-to-improve-local-search-experience-158470)
- Location History has been renamed Timeline and is now an optional, separate setting. Google notes searches store only a general area of at least 3 sq km or 1,000 people. — [Google Policies](https://policies.google.com/technologies/location-data?hl=en-US)

### Inferences
- `&near=` should not be relied on in 2026. Use uule (lat/lng format for grid precision) or a browser geolocation override with google.com permission granted, and verify with the footer label.

### Gaps
- I could not confirm the exact dates of `&near` breakage, or whether it works at all in late 2026.
- I found no Google announcement about the "a+" lat/lng uule format. Whether it is "newer" than "w+" is asserted only by third parties.
