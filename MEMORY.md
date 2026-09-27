# Four Winds — agent handoff

Updated **26 September 2026**. This records the last session; verify Git, CI, and running services
before relying on the snapshot. Start with the user's latest request.

## Resume here

1. Read `git status` and recent commits. The last code change is **`5da0447`**, pushed to `main`.
   The working tree was clean before this documentation update.
2. Check GitHub Actions for the latest commit. The full workflow for **`48bd23c` passed**;
   the workflow for **`5da0447` was still running** when this handoff was written.
3. Feature requests through the saved-table fix are implemented. No feature task is currently
   unfinished. The user is setting up GitHub deployment secrets for a DigitalOcean Droplet.
   The current issue is Web Console authentication as `root` after disabling root SSH; use
   `fwadmin`. Server setup and the first production release remain to be verified.
4. Use the guides below for testing or deployment; keep saved games and browser identities intact.

## User preferences and decisions

- Commit and push completed changes. The repository is `tr-io/four-winds`, remote
  `git@github.com:tr-io/four-winds.git`; the current branch is `main`.
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

## Deployment still pending

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

The user has supplied the deployment domain/IP in chat and prepared the installer command;
installer success, DNS, registry access, and production deployment remain unverified. They are
currently configuring GitHub's `production` environment secrets, including `DEPLOY_KNOWN_HOSTS`.
The server's verified public host key is still needed. Keep credentials out of the repository
and memory.

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
