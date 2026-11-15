# ECHO PROOF

**NASA Space Apps Challenge 2026 · The Earth Information Jukebox**

ECHO PROOF is a browser-only, deterministic sonification experience. Its PRIMARY story compares two NASA SVS 5675 Krasheninnikov visualization frames labelled Jun 18 and Jun 30, 2026. A secondary METHOD TRANSFER applies the same disclosed mapping family to NASA Black Marble Night Lights annual visualizations for 2012 and 2023.

## What the application does

- divides each frozen visual input into a fixed 6×4 grid;
- measures display brightness density with the disclosed EP-MAP-1.0 rule;
- maps the per-cell value deterministically to tone frequency and stereo pan;
- uses Matched A/B playback (same cell before/after) as the primary comparison;
- exposes an in-app Translation Receipt so the mapping can be inspected.

ECHO PROOF does **not** classify lava, infer population or economic activity, or treat display brightness as physical radiance. NASA supplies the scientific interpretation of the source visualizations; ECHO PROOF translates a disclosed visual measurement into sound.

## Run locally

From this folder:

```text
python -m http.server 8012 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8012/`.

The application has no backend, login, database, runtime model/API call, analytics, telemetry, CDN dependency, or user-data collection. NASA source links are ordinary outbound hyperlinks opened only when the user selects them.

## Primary / method-transfer boundary

- **PRIMARY:** Krasheninnikov / NASA SVS 5675
- **METHOD TRANSFER:** NASA Black Marble Night Lights / NASA SVS 5313, with annual-series provenance from NASA SVS 5276

Night Lights is evidence that the same deterministic mapping principle can be applied to a different Earth-observation story; it is not a second PRIMARY project.

## Evidence

`echo-proof-runtime-receipt-EP-MAP-1.0.json` is the machine-readable PRIMARY receipt artifact. `RELEASE_SHA256.txt` records hashes of the release files.

## Sources, licensing and AI assistance

Original ECHO PROOF code/content is licensed under Apache-2.0. See `SOURCES_AND_CREDITS.md`, `THIRD_PARTY_NOTICE.md`, `AI_USE_DISCLOSURE.md`, and `LICENSE`.
