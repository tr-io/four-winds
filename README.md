# Four Winds

A playable, four-player mahjong table built with **TypeScript, Three.js, Vite, Express, and Socket.IO**. Create a lobby for your group, open a room, choose a tradition, and share the invitation. Bots fill empty seats; friends can take over their seats during play.

## Run locally

Use **Node.js 24 LTS** and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:5175**. The game server runs on port **3001**; Vite proxies its socket connection. Port 5175 avoids the other development services already present in the original workspace.

For a production build on one local port:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. `PORT` and `DATA_FILE` can override the server port and state file.

## Table controls

The Three.js table, player panels, tile rack, claims, and timers share one game window. Drag tiles to reorder them, or focus a tile and use **Alt + Left/Right**. **Sort tiles** restores suit order, and each incoming tile automatically sorts the rack. Hover or focus the small **Discards** button beside the center river for a sorted tile/count ledger; click to pin or unpin it. The toolbar opens the game log, table settings, and rules. Last-discard and last-turn bubbles retain the recent action. Hover or focus tiles for English names; tap on mobile. Select the meld meter to inspect your hand and declared sets, then open **Winning routes** for suggested completions and points calculated locally in a background worker. A shuffle-and-deal opening, claim cut-ins, and a separate mahjong celebration respect reduced-motion settings. Enable sound for synchronized tile clacks.

A complete MCR hand still needs eight fan before flowers. Click its qualification badge for a server-calculated breakdown; use a saved house ruleset with a lower minimum for basic-hand play.

## Play

- **Create a lobby** to group your tables under one invitation code, or use the shared Four Winds Club.
- **Create a table** with Chinese MCR, Japanese Riichi, Singapore, or a saved house ruleset.
- Tables appear under **Live tables** while a human player is connected. Disconnected rooms remain in **Saved tables** for reconnecting. A fresh server creates no default tables.
- Choose **Fill empty seats with bots** to start immediately. Otherwise, invite players and let the host start when all four seats are filled. The host can add bots in the waiting room.
- A joining friend replaces the first bot seat and inherits its hand and score. A player who leaves is replaced by a bot.
- Draws arrive automatically. Select a tile and press **Discard**. All available win and meld claims appear as buttons, including each legal chow sequence.
- After a hand, review the score and choose **Ready for the next hand**. The result shows the entire winning hand with colored melds and tooltips, a ready count out of four, and the next-hand countdown. By default the table continues when everyone is ready or after 60 seconds; hosts can force the next hand. All three advance mechanisms are configurable before play. At match end, the host can start a rematch.

The server validates every action. Higher-priority claims beat lower-priority claims; server receipt order breaks ties. One winning claim resolves each discard. The claim window and meld priorities are editable. A turn timeout automatically discards the drawn tile, or takes a legal win.

## Rules and house rules

Read [the rules research note](docs/rules-research.md) for sources, versions, differences, and the specific **Four Winds Singapore v1** profile. Riichi uses EMA 2025 plus its June 2026 annotations. The MCR scorer covers the 81-pattern family; integration fixes are shipped as reproducible dependency patches. The online game has explicit adaptations to physical tournament play.

Use **Configure rules** during table creation, or the settings button at a waiting table. The table host and containing lobby host can edit before the first deal; all seats receive the changes. Orange dots mark differences from the preset. Rules lock for the match when play starts, and any player can save a copy. Editing a saved ruleset separately does not alter an existing table.

The ruleset editor changes actual legal actions, timing, winning thresholds, settlements, tile sets, or ledgers. Custom bonuses have executable conditions: self-draw, closed hand, all pungs, or full flush. In Riichi, custom bonuses add flat points after the standard calculation and cannot substitute for a yaku.

**Points and chips are for play.** Fake chips have no monetary value. There are no payments, deposits, wagering, or cash-out features. Turning point tracking off leaves score validation active; fake chips can be tracked independently.

## Test and deploy

- **[Architecture](docs/architecture.md)** — system, command, worker, and deployment diagrams.
- **[Capacity audit](docs/capacity-audit.md)** — 50/100-game measurements and the remaining archival-storage blocker.
- **[TESTING.md](TESTING.md)** — local setup, four players on one computer, phones on a LAN, remote groups, reconnects, bot takeover, and automated checks.
- **[docs/game-state-testing.md](docs/game-state-testing.md)** — targeted commands and scenarios for starts, draws, claims, wins, exhaustion, scoring, and network state.
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — DigitalOcean VPS, subdomain/HTTPS, restricted CI key, GitHub tagged releases, health checks, rollback, and backups.

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm run test:mobile
npm run test:deploy
```

## Project map

For the current agent handoff and next steps, read [MEMORY.md](MEMORY.md).

| Location             | Responsibility                                               |
| -------------------- | ------------------------------------------------------------ |
| `client/main.ts`     | Lobby, rooms, profiles, rules editor, hand controls, dialogs |
| `client/table.ts`    | Three.js table, moving tile meshes, lighting, camera         |
| `client/tile-art.ts` | Locally rendered tile artwork, including bonus tiles         |
| `shared/`            | Protocol types, tile definitions, presets, rules validation  |
| `server/engine.ts`   | Authoritative hand and match state machine                   |
| `server/scoring.ts`  | MCR / EMA scoring adapters and Singapore scoring             |
| `server/service.ts`  | Sessions, lobbies, rooms, bot seats, persistence, sockets    |
| `server/security.ts` | Browser origin checks and handshake limits                   |
| `tests/`             | Seeded engine tests, real socket tests, browser flows        |
| `patches/`           | Reviewed fixes/extensions for the scoring dependencies       |

## Persistence and practical limits

State is atomically saved to `data/four-winds.json` after accepted commands and bot/timer transitions. Profiles and saved rules are associated with a random bearer credential stored in your browser; server storage contains only its hash. Reloading or reopening the browser restores the same profile. Clearing browser storage loses that credential. A `?guest=1` tab provides an isolated test identity.

One server process owns the game state. Use one instance and a persistent volume. Local fresh-state load tests pass at 100 games / 400 socket clients, but retained hand histories currently prevent sustained capacity at that level; see the [capacity audit](docs/capacity-audit.md). Limits are 100 rooms, 100 lobbies, 30 saved rulesets per profile, and 10,000 guest profiles. It does not include accounts/password recovery, moderation, matchmaking ratings, distributed state, or tournament referee penalties. Bots are deterministic heuristics that use their own hand and public information; they are practice partners.

See [THIRD_PARTY.md](THIRD_PARTY.md) for scoring and asset attribution. Artwork is drawn locally; fonts are bundled, so playing does not require a font CDN.
