# Browser startup and bundle size

The main JavaScript bundle fell from **1,262 kB to 719 kB** after replacing avatar generators
with fixed SVGs and deferring lessons and rule-form validation. Its Vite-reported gzip size
fell from **394 kB to 193 kB**. The existing **850 kB** chunk warning remains enabled; the
production build now completes without that warning.

## What loads when

- The lobby loads the game UI and Three.js, which also renders its table preview.
- Avatars use 24 generated SVGs with the same DiceBear seeds, colors, dimensions, and attribution.
  The client imports their URLs and requests each image when displayed. Vite emits separate
  files with content hashes for caching; the `?no-inline` imports keep the SVG contents out of
  JavaScript. See [Vite asset handling](https://vite.dev/guide/assets#explicit-inline-handling).
- **How to play** downloads its 17 kB JavaScript and 9 kB CSS when opened. A delayed download
  checks that the user is still on that page before mounting. A failed download shows recovery
  controls and leaves the main navigation usable.
- Rule presets are plain data. The browser downloads the 85 kB validation module, including
  Zod, when a rules form is submitted. A delayed download checks that the form is still open
  before submitting; a failure keeps the draft and re-enables the submit button. The server
  imports the same schema synchronously and continues validating all incoming rules.
- Winning routes already run in a separate 112 kB worker requested when needed.

## Avatar maintenance

`client/generated/avatars/` contains the checked-in SVGs. After changing the fixed choices,
generator options, or DiceBear versions:

```sh
npm run avatars:generate
npm run avatars:check
```

Commit the regenerated files with the source change. CI runs the check to catch stale assets.
The generator packages are development dependencies; the production client and server do not
need them. The existing `jade`, `clay`, `gold`, and `blue` profile values still map to the same
Adventurer choices.

## Startup comparison

Measured on 27 September 2026 against the feature branch before these changes (`37ee8dd`).
[Raw runs](performance-results/2026-09-27-startup.json) contain five fresh browser contexts per
build. The harness serves a temporary in-memory game, fixes the profile/avatar, and applies:

- Chromium with a Pixel 7 viewport and reduced motion.
- Empty browser caches, 4× CPU slowdown, 1.6 Mbps download, and 150 ms network latency.
- Gzip for text assets, matching the compression format supported by deployment Caddy.

| Median over five runs                     | Before |  After |
| ----------------------------------------- | -----: | -----: |
| First contentful paint                    | 3.49 s | 2.30 s |
| Lobby ready                               | 3.68 s | 2.57 s |
| JavaScript execution time reported by CDP | 395 ms | 323 ms |

“Lobby ready” requires a connected session, the preview canvas, and loaded avatar images.
It does not measure the first interactive game turn or a rendered 3D frame. These are local
emulation results, not physical-phone or production measurements. CPU/GPU load and real networks
will change the timings. The harness's gzip byte counts differ slightly from Vite's compression
report because they use different compression settings.

To compare another change, build and measure the baseline before editing, then measure the
updated build. Run the measurements without other browser suites competing for CPU:

```sh
npx vite build --outDir .cache/bundle-before
npm run measure:startup -- .cache/bundle-before 5
# Apply the change, then:
npm run build
npm run measure:startup -- dist 5
```

The benchmark uses fresh contexts and an in-memory server. It never reads production game
storage. Browser regression tests also verify deferred requests, all avatar choices and legacy
values, failed downloads, and navigation during slow downloads.
