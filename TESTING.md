# Testing Four Winds locally and with other people

## 1. Start the game

Install Node.js **24 LTS**, then run in this directory:

```sh
npm ci
npm run dev
```

When reinstalling dependencies, stop the running dev server with **Ctrl+C** first, run `npm ci`, then start `npm run dev` again. This ensures both processes use the installed package versions.

Open **http://localhost:5175**. You should see the Four Winds lobby, a 3D table preview, and **Connected** in the header. If another service already occupies that address, use the Network address printed by Vite or change the `server.port` in `vite.config.ts`.

Use a recent Chrome, Firefox, Safari, or Edge. WebGL renders the table; the hand buttons and game controls remain available if WebGL is unavailable. Sound starts muted on the first visit. The speaker button toggles sound; the table settings panel includes a volume slider. Both preferences are saved in this browser.

## 2. One person, three bots

1. Open your profile in the top right. Choose a name and color.
2. Select **Play with bots**, choose a ruleset, and select **Take your seat**.
3. Watch the table and seat entrance animations. To hear the opening, create a waiting table, enable the speaker, fill the seats with bots, then start. Tiles mix at the center, form the wall, and fly to the four seats with shuffle/deal clacks. Reduced motion replaces movement with a static hand announcement.
4. The table fills one game window. Select a tile in the rack, then press **Discard** in the action dock above it. Bots draw, discard, call, and win through the same legal-action engine as humans.
5. When a discard is claimable, use the **Mahjong / Ron**, **Pong / Pon**, **Kong / Kan**, or **Chow / Chi** buttons in that dock. A different button is shown for each legal chow sequence. The offered tile, countdown, and pending/received status remain visible without scrolling the page.
6. Review the full winning hand and scoring breakdown, then select **Ready**. The ready count, next-hand clock, and host's **Start next hand** control stay visible.
7. Try all three presets. Singapore exposes flowers and animals and draws replacements automatically.

### Configure a table before dealing

1. Select **Create a table → Configure rules**. Choose MCR, Riichi, or Singapore. Use the **Play**, **Scoring**, **Chips**, and **Bonuses** tabs to edit the clocks, calls, scoring, fake chips, and house bonuses. The Play tab also sets the next-hand countdown (0 disables it), advance-when-ready, and host-force permissions. At least one advance mechanism must remain enabled. Variant-specific controls appear for the selected preset.
2. Orange dots and highlighted fields mark changes from that preset. Select **Use these rules**, then create the table. For immediate bot play, configure rules before checking **Fill empty seats with bots**.
3. At a waiting table, the **settings** button opens the full editor for the table host or the containing lobby's host. Select **Apply table rules**. Other players should immediately see the new values, including updated starting balances. Their settings panel is read-only.
4. Start the game. Settings now show **Locked for this match** for everyone. The server rejects edits after the first deal. **Save a copy to my rulesets** keeps the active configuration for a future table.

### Table controls and effects

- **Recent actions:** the **Last discard** bubble retains the discarded tile and its player after a claim or the next draw. Stacked beneath it, **Last turn** shows the most recent draw, discard, call, bonus, or win. Reload to verify these restore from the server's log. An opponent's draw never reveals its tile.
- **Tile names:** hover any rack, meld, bonus, indicator, discard, claim, or result tile for its English name. Keyboard focus works on HTML tiles; on touch screens, tap. Face-up tiles on the 3D table also support pointer inspection. Tile backs must never reveal names.
- **Your hand:** select the meld meter beside **Sort tiles**. Declared melds fill the four set slots; the inspector shows the current concealed tiles, larger melds, suit counts, and possible pairs. Open the **Winning routes** tab for suggested completions, tiles to collect/release, scoring patterns, and their point payments. These bounded-search estimates use your hand and public information, assuming an ordinary self-draw; they are not guaranteed future draws. Analysis runs in a browser Web Worker and stops when the dialog closes; it sends no analysis request to the server. The server still decides whether a hand qualifies to win. Hover individual exposed tiles in either view.
- **Arrange the rack:** drag a tile to another position with a mouse or finger. On a keyboard, focus a tile and press **Alt + Left/Right**. **Sort tiles** restores suit/rank order. Receiving a new tile automatically sorts the entire rack. Your arrangement survives other state updates until the next incoming tile. Arrange tiles during other players' turns too. Refresh to confirm that your order survives reconnects. Moving a tile must never discard it.
- **Read the river:** hover over or focus the compact **Discards** button at the bottom-right of the board. Click/tap it to toggle a pinned ledger that stays open when you move away. The ledger groups discards by tile kind, sorted by suit and rank, with each count underneath. Called discards remain in the historical count and show a separate “called” annotation. Tap again to unpin and close it, or use its close button or **Escape**.
- **Inspect scoring:** a complete MCR shape shows its qualifying fan beside your hand. Click it for a breakdown. MCR needs eight fan **excluding flowers**. For basic four-set-and-pair play, save a house ruleset with **Minimum fan = 0** before creating a new table.
- **Claims and wins:** a resolved call produces a character/title cut-in, a single stylized impact burst, ember trails, tile movement, and a brief camera impact. Mahjong has a longer fire-and-gold celebration before the score panel. These visuals do not delay the server or block action buttons. Enable sound for tile clicks, bonus chimes, percussion on calls, and a rising victory chord. Adjust volume in table settings. Enable the operating system's reduced-motion setting to check the static presentation.
- **Winning hand and readiness:** the result includes concealed tiles, all declared chows/pungs/kongs, and bonus tiles. Check the color legend and English tooltips. Bots count as ready; each human click updates the shared **N/4 ready** count. A host can force the next hand if enabled. Disable readiness or the timer before play to check each advance mechanism independently; disabling every mechanism is rejected.
- **Game log and help:** use the clock and book buttons in the table toolbar. Both open inside the game view. On desktop, the diagonal-arrow button toggles fullscreen.
- **Small screens:** try 390 × 844 portrait and 844 × 390 landscape. The rack uses two rows in portrait and moves beside the board in landscape. Also try effective viewports of 960 × 540 and 640 × 360 (a 1920 × 1080 display at 200% and 300% zoom). All three opponent hands should be visible around the wall, clear of player cards. On short screens, scroll within the game window to reach the rack and actions; the board should not collapse or create horizontal scrolling. Open the discard ledger and check that its heading, close button, and complete tiles are reachable.

### Local table themes

Open **Table settings** (sliders in the game toolbar), then choose **Jade Night** or
**Porcelain Day**. This works before dealing and during a match for every player. The choice
applies immediately and persists for that player in this browser. Rules remain shared;
appearance is local. Returning to the club always shows its dark forest palette.

- **Normal turn:** select a rack tile, switch themes, and close settings. The same tile should
  remain selected and Discard should still work. Reload to check the saved theme and hand order.
  Your concealed hand appears once, in the interactive rack. Three.js shows opponents' backs,
  public melds, bonuses, walls, and discards.
- **Claim prompt:** wait for a legal discard, then check the offered tile, player, timer,
  **Pung / Pong**, **Chow / Chi**, win, kong, and Pass buttons as applicable. Switching themes
  must preserve the offered actions and deadline. The game clock continues while settings are
  open. Use a 30-second claim window when checking manually.
- **Multiple players:** choose Porcelain Day in one player's browser and leave another on
  Jade Night. Each should keep their own appearance through a discard and reconnect.
- **Motion:** repeat with the operating system's reduced-motion setting enabled. Selection
  outlines and static claim/win feedback should remain visible without tile lifts or camera shakes.

For repeatable turn/claim scenarios without waiting for a random deal, run
`npm run test:e2e -- tests/browser/themes.spec.ts`. This uses an isolated in-memory server,
executes real legal actions, and saves desktop/mobile screenshots under `test-results/`.
Run `npm run test:mobile` separately for Android Chromium and iPhone WebKit coverage.

Rendering notes: `client/main.ts` builds the landing page, lobby, player badges, and legal-action
dock; `client/hand-rack.ts` owns rack input and local order; `client/table.ts` owns the Three.js
scene. The former duplicate was a face-up 3D copy of the local concealed hand. The rack is now
its sole main-game view; the explicit hand inspector and results still show hand details.

For a short match, save a house ruleset with **1 wind**. This is four dealer rotations; dealer repeats can add hands. To speed testing, set 10-second turns and 3-second claims.

## 3. Four players on one computer

**Each player needs a separate browser identity.** Normal tabs in the same browser share the saved profile. Duplicating a tab may also copy its session storage.

Choose either approach:

- Use four browser profiles, different browsers, or separately isolated browser contexts. Multiple windows in one incognito session may still share storage.
- Open three fresh tabs by pasting **http://localhost:5175/?guest=1** into each new tab. This starts an isolated guest identity in each tab. Do not duplicate an already open guest tab. A guest profile survives reloads in that tab; it is intentionally not saved as the browser's primary profile.

Then:

1. Player A creates a lobby, such as “Sunday Club.” Use **Invite to lobby** to copy its link, or share the six-character lobby code.
2. Other players open that link, or use the lobby selector and enter the lobby code.
3. Player A creates a table with bots unchecked.
4. Other players choose that table or select **Join with a code** and enter its room code.
5. The host selects **Start the game** when four seats are filled.
6. Check that everyone sees the same turn, wall count, discards, and claims, and only their own concealed hand.

A room invitation opens the correct lobby automatically. A full table of humans rejects further players. A full table containing bots allows a friend to replace a bot.

## 4. Friends and phones on the same Wi-Fi

1. Start `npm run dev` on the host computer.
2. Find Vite's **Network** URL, such as `http://192.168.1.20:5175`.
3. Allow Node through the host's local-network firewall if your operating system asks.
4. Each player opens that Network URL on their device. `localhost` refers to their own device, so do not share a localhost invitation.
5. Create a lobby and table from the Network URL. Copied invitations now contain the correct network address.
6. On mobile, try portrait and landscape modes. Tap a tile, then use the discard button. The clock button opens the live table log; the book button opens table-specific rules.

The page and socket use the same address. You only need to expose Vite's port **5175** on the trusted LAN; its proxy forwards the socket to the local server. The client includes a request-ID fallback for LAN HTTP, where `crypto.randomUUID` may be unavailable.

Use [the HTTPS deployment instructions](DEPLOYMENT.md) for internet play. Do not expose the development server as the public deployment.

## 5. Remote players

Deploy one instance using [DEPLOYMENT.md](DEPLOYMENT.md). Share the site's **HTTPS** address and the room or lobby invitation. The deployment proxy carries both the website and WebSocket connection; players do not need to configure ports or install software.

Anyone with a lobby/room code can join when a seat is available. Codes are invitations, not password-protected accounts. Keep your group's invitation within the intended group.

## 6. Reconnect, bots, and claims checklist

| Test                 | Steps                                                     | Expected behavior                                                                              |
| -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Refresh              | Reload during your turn                                   | Same profile, seat, hand, and current deadline                                                 |
| Brief disconnect     | Disconnect Wi-Fi, then reconnect                          | Reconnecting banner; server sends current authoritative state                                  |
| Entire table offline | Disconnect all human players                              | Server stops advancing that table until a human returns; an elapsed deadline is then processed |
| Server restart       | Stop/restart the server without deleting its data         | Rooms, hands, scores, profiles, and rulesets reload; reconnect with the same browser           |
| Bot takeover         | Start a bot table, join from a new identity               | Human takes a bot's hand and score; other players see a seat-arrival animation                 |
| Leave                | Leave a live table                                        | Bot finishes the departing player's seat; remaining humans can keep playing                    |
| Claim priority       | Two players can claim; lower-priority player clicks first | Pending message remains until higher-priority opportunities answer or expire                   |
| Same-priority claim  | Two players can win or pung; both click                   | Earliest valid server-received click wins; latency is part of receipt order                    |
| Timeout              | Let claim clock or turn clock expire                      | Silence passes a claim; turn timeout takes a win or discards the drawn tile                    |
| Duplicate click      | Double-click a discard/claim                              | Request deduplication and decision IDs prevent a second state transition                       |
| Fake chips           | Save a ruleset with chips and a non-default conversion    | Hand and instant-bonus point changes update the fake-chip ledger                               |
| Pregame settings     | Table/lobby host edits the waiting table                  | Every seat receives the changes; regular players cannot edit                                   |
| Rules lock           | Try editing after the first deal                          | Settings are read-only and the server rejects edits                                            |
| Saved rules          | Edit a saved ruleset independently                        | Existing tables keep their snapshot until a host explicitly applies table settings             |
| Reduced motion       | Enable OS/browser reduced motion                          | Entrance/claim effects stop; gameplay remains usable                                           |

The result screen is available again from the table if you close it. A match has a defined end after its selected winds, followed by a host-controlled rematch.

## 7. Automated checks

```sh
# Seeded dealing, legal actions, claim ordering, scoring, full hands,
# four real Socket.IO clients, reconnect, persistence, origin rejection,
# development module serving after dependency-cache cleanup,
# local rack ordering, grouped discard counts, host rule authorization and locks
npm test

# Type check and production client build
npm run build

# Real Chromium interactions: profiles, custom rules, lobby/room creation,
# four players, turns, reconnect, bots, mobile, safe text, reduced motion,
# dragging, MCR qualification, grouped discards, claims and win effects,
# tile tooltips, hand inspector, last actions, and synchronized table settings
npx playwright install chromium webkit
npm run test:e2e

# Android Chromium and iPhone WebKit: touch, portrait/landscape, full results,
# readiness, winning routes, pinning discards, automatic sorting, and starts
npm run test:mobile

# Restricted deployment commands, health checks, recovery, state-version guard
npm run test:deploy
```

Engine tests use fixed seeds, physical tile-conservation checks, and scoring fixtures. Production tables use a cryptographic shuffle rather than exposing or reusing test seeds. Browser tests start their own production-build server on **3101** and use `test-results/browser-state.json`; they do not use the main game data file. The table-window scenarios also launch isolated in-memory services on random local ports and install deterministic hands directly in those test services. There is no fixture endpoint or game-state override in the deployed app. Playwright saves screenshots and traces on failure.

**[Individual game-state testing guide](docs/game-state-testing.md)** maps each transition to its test and explains deterministic hands, seed replay, visual inspection, and adding regressions. Mobile emulation covers touch and layout in real browser engines; also test on physical phones for audio/GPU/network behavior.

Run desktop and mobile suites sequentially because both use port 3101. A convenient targeted run:

```sh
npm run test:state
npm run test:state -- -t 'pung|chow|kong'
npx vitest run tests/engine.test.ts
npx vitest run tests/multiplayer.test.ts
npx vitest run tests/dev-server.test.ts
npx playwright test tests/browser/table-window.spec.ts
npx playwright test --headed
```

## 8. Troubleshooting

- **Old practice tables after restarting:** the server restores `data/four-winds.json`. No rooms are created by default. **Live tables** contains rooms with connected humans; **Saved tables** only lists this browser profile's bookmarked paused rooms. Use **Save and leave** to create a local bookmark, then resume in the same browser. Another browser or isolated guest must not inherit that list. Bots do not count as online players. Old server-only bookmarks are no longer listed; an existing table can still be joined by invitation code.

- **Blank page with module MIME errors or `504 Outdated Optimize Dep`:** restart `npm run dev`, then reload the page. If it persists, stop the server, remove only `.cache/vite`, and restart. Four Winds keeps [Vite's dependency cache](https://vite.dev/config/shared-options.html#cachedir) outside `node_modules` because [`npm ci` replaces that directory](https://docs.npmjs.com/cli/v11/commands/npm-ci/). Keep `data/` and browser storage to preserve games and profiles.
- **Wrong website on localhost:** another development service may own that port. Change Vite's port and use the printed URL. The original workspace had unrelated services on 5173 and 5174.
- **Reconnecting indefinitely:** ensure the server is running. Check the browser Network panel for `/socket.io/`. In production, verify `ALLOWED_ORIGINS` exactly matches the browser's origin, including `https://` and any nonstandard port, without a trailing slash.
- **A tab joins as the same person:** use a fresh `?guest=1` tab or a separate browser profile. Do not duplicate the tab.
- **No claim button:** the server does not consider that action legal. Check the minimum score, whose discard can be chowed, furiten in Riichi, and Singapore's missed-call restrictions.
- **A valid-looking hand cannot win:** MCR requires qualifying fan before flowers; Riichi requires a yaku before dora; Singapore requires its configured minimum. The table's book button shows its active rules.
- **Ruleset disappeared after clearing browser data:** the saved bearer credential identifies the profile. Guest identity has no password recovery. Keep the same browser storage to retain access.
- **Dependency patch fails:** run `npm ci` against the checked-in lockfile. The patches intentionally target the pinned scorer versions; update them together with the scoring tests.

## Interactive lessons and social tables

See [Social tables and interactive lessons](docs/social-and-learning.md) for the walkthrough,
setup conventions, avatar licenses and storage details. New focused checks:

```sh
npx vitest run tests/lessons.test.ts tests/setup.test.ts tests/wall-layout.test.ts tests/multiplayer.test.ts
npm run test:e2e -- tests/browser/learning.spec.ts tests/browser/social.spec.ts
```

Use the normal browser's notification permission prompt to opt into turn alerts. Keep the tab
open in the background and play from another identity to test an incoming turn or claim.
Check audible garden, rain and pond ambience after a pointer/keyboard gesture; switching to a
hidden tab should mute ambience. These depend on browser permissions and audio output.

## Capacity tests

`npm run test:load` creates 100 isolated tables and 400 socket clients with temporary persistence.
See the [capacity audit](docs/capacity-audit.md) for workload controls, acceptance thresholds,
measurements, and the known failure with retained hand histories. Keep load tests on isolated
staging or local services. The [architecture guide](docs/architecture.md) explains the data flow.

### Opening sequence and board view

Start a fresh hand: the opening title finishes before the dice appear, and dealing follows the
recorded throws. Check both normal and reduced motion. Under **Table settings**, enable
**Scroll or pinch to zoom the board**; try the wheel, pinch, Zoom in/out buttons, and Reset view.
Rotation and zoom have separate local switches. Game updates should preserve the camera, and
opponent concealed faces should remain hidden. Tap/click the lotus, or focus it and press Enter,
to see petals, rain droplets, or pond rings for the selected surroundings.
