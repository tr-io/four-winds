# Four Winds — agent handoff

Updated **27 September 2026**. This records the last session; verify Git, CI, and running services
before relying on the snapshot. Start with the user's latest request.

## Resume here

1. Continue on **`feat/social-table-experience`**, [PR #2](https://github.com/tr-io/four-winds/pull/2).
   The user explicitly requested staying on this feature branch. [PR #3](https://github.com/tr-io/four-winds/pull/3)
   was merged into it as `f8859c3`; PR #2 remains open and main is unchanged. The top opponent hand was rendered but covered by its player card. Short
   viewports also overlapped seat cards with recent actions and clipped the discard ledger.
   `client/table-viewport.css` now reserves room around the canvas, and `table-camera.ts` fits
   the whole table to that space. Short windows scroll internally. The ledger opens above its
   bottom-right button, keeps tile faces from shrinking, and scrolls into view when pinned or
   focused. Tile tooltips follow focused/hovered tiles during scroll. All opponent faces remain
   concealed; the local hand remains in the HTML rack. Nine new regressions cover live viewport
   resizing, seat/hand occlusion, ledger clipping, action access, and focused tooltips.
2. **How to play** is now an interactive page with preset switching, tile explanations, a moving
   turn walkthrough, hand grouping/checking, and competing-claim examples. `server/lessons.ts`
   validates separate preset examples through the existing engine in isolated games; scoring,
   minimums, dealer progression, and configured claim arbitration remain unchanged.
3. Table additions: scoped lobby/table chat, emoji reactions, queued discards, player meld
   inspection, DiceBear avatars, complete hand logs and profile history, saved-table bookmarks,
   last-player seat reservation/pause, local board rotation, turn notifications, and interactive
   garden/rain/pond ambience. See [feature guide](docs/social-and-learning.md) for behavior,
   storage, supported notifications, attribution, and setup conventions.
4. The server now records public dice/break/slot metadata. MCR has two throws, Riichi one;
   Singapore uses the documented one-throw digital convention. Deals use packets and replacement
   draws; the renderer walks adjacent wall stacks instead of removing tiles from all sides.
   Tile dimensions/rows and wall corners are separated. Opponent concealed faces are never built
   in Three.js, including when rotating. Existing saved games use a count-based wall fallback
   until their next deal. Stable seats and initial host-as-East are preserved.
5. Verification for the table/zoom fix: **92 unit/network tests**, **37 desktop browser tests**,
   **12 mobile tests** (Android Chrome/iPhone WebKit), type/build, formatting, and diff checks pass.
   The iPhone opening deal exposed an 18px rack overflow; the board minimum is now 360px, with
   320px reserved for the landscape split layout. Viewport tests cover 320, 390, 640, 700, 768,
   844, 960, and 1280 CSS pixels, including resizing after mount. Screenshots are in
   `.cache/ui-review/table-zoom/` (ignored). All tests use isolated stores; production is unchanged.
   The prior feature work also passed five deployment tests and release Compose validation.
   The local review server at **localhost:3102** was last started with
   `/tmp/four-winds-feature-review.json`; check availability before using it.

6. The npm audit warning was DiceBear Core <=9.4.2 ([advisory](https://github.com/advisories/GHSA-gcr2-9v8m-gq45)).
   Core and the three bundled styles are now 9.4.3. Fresh `npm ci` applies both scoring patches;
   `npm audit` reports zero vulnerabilities. PR #3’s CI failed only during fixture shutdown.
   A partial HTTP request reproduced the hang on Node 24; `tests/fixtures/http-server.ts` now
   tracks and terminates test connections when closing. The regression fails with the old
   cleanup and passes with the fix. This affects test servers only. On Node 24.21.0, all **93 unit**,
   **37 desktop**, and **12 mobile** tests pass, as do build/types, formatting, and five deployment
   tests. The dependency and fixture fixes are committed on the feature branch; check the latest
   PR #2 CI run for remote verification.

## User preferences and decisions

- Follow the branch → commit → push → PR workflow in [AGENTS.md](AGENTS.md), requested on
  27 September 2026. This supersedes the previous direct-to-main preference.
  Repository: `tr-io/four-winds`, remote `git@github.com:tr-io/four-winds.git`.
- Continue this work on the existing feature branch per the user’s follow-up; do not create
  another branch/PR for follow-up fixes to PR #2.
- Work through authorized tasks without repeated confirmation. Explain actual blockers clearly.
- The table, rack, claim prompts, settings, and help belong inside the game window. Keep actions
  visible on desktop and mobile. The user prefers a mahjong-themed game UI, clear visual state,
  and short copy.
- Tile names are English tooltips on hover, focus, or touch. Draws automatically sort the rack;
  players can manually arrange tiles between draws.
- Use dramatic claim/win/start animation and layered sound, with mute, volume, and reduced-motion
  support. Presentation must leave server turns and action buttons usable.
- Claims use **configured priority first, then earliest valid server receipt at equal priority**.
  One winning claim resolves a discard. This is an intentional online adaptation of the rulebooks.
- Presets and editable options affect real legality/scoring. Points and **fake chips only**;
  there are no real-money features.

## Current game

TypeScript, vanilla browser UI, Three.js, Vite, Express, and Socket.IO. A single authoritative
server owns rooms, turns, bots, timers, and settlement. Player-specific views hide other hands
and wall order. Profiles use saved bearer credentials; server storage contains credential hashes.

Implemented: four-player lobbies/rooms, bots and human takeover, reconnect/persistence, complete
matches, custom saved rulesets, MCR, EMA Riichi, and the documented Singapore profile including
flowers/animals and special wins. HTML controls overlay the Three.js table within one game frame.

Recent work:

- **`1fcca03`**: table settings, visible rule changes, tile inspection, last actions, sound and effects.
- **`48bd23c`**: automatic draw sorting; stacked last-action panels; pinned compact discard ledger;
  winning-route tab; full winning hands with colored melds/tooltips; shared ready count, configurable
  next-hand timer and host advance; mobile/state tests; shuffle/deal clacks; deployment tooling.
- **`5da0447`**: corrected the misleading “four default live tables” display. Those were four
  persisted practice rooms with no connected humans. A fresh server creates **zero rooms**.
  Live tables now require an online human; inactive rooms sit in a collapsed **Saved tables**
  section. Bots do not count as online humans. Saved games were preserved.

Important implementation details:

- `server/hand-analysis.ts` provides bounded suggestions using the player's hand and public tiles.
  It calls the actual scorer under an ordinary self-draw assumption. Suggestions are neither
  exhaustive nor guaranteed available draws. The private `analyze-hand` ACK does not broadcast
  or persist state. `client/hand-results.ts` renders routes and complete winning hands.
- `nextHandSeconds`, `advanceWhenReady`, and `hostCanAdvance` are server-enforced, with defaults
  60/true/true. Zero disables the timer; all three mechanisms cannot be disabled together.
  Old saved rules get defaults on load. Ready/force commands carry the current decision ID.
- `client/deal-sequence.ts` coordinates the 2.3-second opening with `table.ts`, `table-effects.ts`,
  and `game-audio.ts`. Repeated snapshots and reloads must not replay the deal. Mobile WebKit
  tooltips show after a tap finishes; touch `pointerout` previously hid them immediately.
- `RoomSummary.online` counts connected humans; `phase` describes waiting/playing/results.
  `client/main.ts` separates live and saved rows. The engine pauses when no humans are connected.

## Rules and past pitfalls

Read [rules research](docs/rules-research.md) and [implementation choices](docs/rules-implementation.md)
before changing rules. They identify the MCR source, current EMA baseline, **Four Winds Singapore v1**,
and deliberate online adaptations. Keep dependency scoring patches and their tests together.

The user's pictured “basic MCR win” was a complete shape with only **five qualifying fan**.
Four flowers do not satisfy the official eight-fan minimum. The UI explains this; a custom
minimum of zero enables basic-hand play. Preserve that distinction.

## Testing and verification

- [TESTING.md](TESTING.md): local setup, separate identities, LAN/mobile devices, remote groups,
  reconnects, bots, and troubleshooting.
- [Individual state tests](docs/game-state-testing.md): scenario map, seed replay, targeted tests,
  and adding regressions. `npm run test:state -- -t 'pung|chow|kong'` selects claim-related cases.
- [package.json](package.json): authoritative command list. Run desktop/mobile browser suites
  sequentially; both build and use port **3101**. Fixtures run isolated in-memory services.
  There are no production fixture endpoints. Keep tests away from `data/four-winds.json`.

Verification for `48bd23c`: 74 unit/network/UI tests, 17 desktop browser tests, 8 mobile tests
(Android Chromium and iPhone WebKit), and 5 deployment-controller tests passed. Format, type/build,
Compose validation, and Docker build passed. Four clients survived a container restart with their
seats/hands/discard intact. A real isolated Ubuntu SSH test allowed status and rejected shell,
restore, and injection attempts using the restricted deployment key.

For `5da0447`: all **11 socket tests**, the new lobby browser regression, build/type checks, and
format checks passed. The original issue was also rechecked at **localhost:5175**: four old rooms
were saved separately from one connected live table. Counts are a historical observation.

## Deployment status

[DEPLOYMENT.md](DEPLOYMENT.md) is the complete DigitalOcean VPS/subdomain guide;
[deployment research](docs/deployment-research.md) links the provider documentation.

The guide now includes copyable `doctl` commands to authenticate, find the Droplet, create/attach
the firewall, and inspect all attached firewalls. Syntax was verified with installed doctl against
a local mock API; no cloud resources were changed. Its public SSH rule supports the current
GitHub-hosted deployment runner and assumes the documented key-only/restricted-account setup.

Checked-in workflows test pushes/PRs, build/publish a GHCR image for a published non-prerelease
`vMAJOR.MINOR.PATCH` release, and deploy its immutable digest. **Saving a release draft does not
deploy.** Manual rollback restores the previous image while preserving current game state;
restoring old state is a separate administrator operation.

The user has created the Ubuntu Droplet and encountered `adduser operator` failing because
Ubuntu already has an `operator` system group. The guide now uses **`fwadmin`** for the personal
administrator throughout account setup, SSH, file uploads, and backup exports; **`fwdeploy`** is
still the separate restricted CI account. The conflict and replacement account's sudo membership
and SSH file permissions were verified in a disposable Ubuntu 24 container. Keep the original
root session open until a second terminal verifies the new administrator's SSH and sudo access.

Further setup findings: the user's local `four-winds` SSH alias selects a custom personal key;
connecting directly to the IP skips that alias. Use `ssh fwadmin@four-winds`. If `sudo` group
membership changes, reconnect before testing `sudo -v`. DigitalOcean's regular Web Console
uses SSH: the reported authentication error showed `os_user=root`, which is blocked by the
guide's `PermitRootLogin no`. The guide now explains using `fwadmin` for Web Console access and
the separate password-based Recovery Console when SSH is unavailable. The actual remote
cause and successful Web Console login have not yet been verified.

On 27 September 2026, after the user applied the firewall, read-only checks confirmed:

- `doctl compute firewall list-by-droplet 603993824 --output json` returned one attached
  `four-winds` firewall with status `succeeded`, no pending changes, and the documented inbound
  TCP 22/80/443, UDP 443, and outbound TCP/UDP/ICMP allowances for IPv4 and IPv6.
- TCP connections to `167.99.224.146` succeeded on 22/80/443; 3001/5175/2375/2376 timed out.
- `https://mahjong.leonardliu.com/api/health` returned HTTP 200 over verified HTTPS with
  `{"ok":true,"game":"Four Winds"}`. The response passed through Caddy.

These checks did not change infrastructure or game state. IPv6, UDP/HTTP3, outbound connections,
SSH authentication, release workflow status/digest, multiplayer play, and rollback were not
tested in this pass. Keep credentials out of the repository and memory.

## Local environment notes

- Development UI: **5175**; backend: **3001**. Vite proxies the socket and `/api` to the backend.
  A dev server was running at handoff; check ports before starting another process.
- In this macOS workspace, system Git hit an Xcode license issue. The working invocation is
  `DEVELOPER_DIR=/Library/Developer/CommandLineTools git …`. This is a local workaround.
- User-provided agent instructions reference `@RTK.md`, but the file was not found in the checkout
  or parent directories. Apply it if it becomes available; its contents are unknown.
- Vite caches dependencies in `.cache/vite`, outside `node_modules`. The earlier blank-page MIME
  errors came from stale optimized dependency requests after dependency replacement; see TESTING.
- `data/`, test artifacts, and browser storage are local state. Clearing a browser credential loses
  that guest identity. Use isolated test services or fresh `?guest=1` tabs for extra players.

Keep this file concise: update completed work, verification, unresolved issues, and next steps;
leave detailed rules/testing/deployment procedures in their linked guides.
