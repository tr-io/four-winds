# Server capacity audit

27 September 2026. Target: **50–100 simultaneous games, up to 400 human players**.

## Finding

The Winning routes server stall is fixed: suggestions now run in a cancellable browser worker.
Table updates are scoped to their participants. A local fresh-state test passed with 100 games
and 400 socket clients. **Sustained 400-player production capacity is not established:** the
same server with ten archived hands per player hit the 15-second command timeout. Full-store
synchronous persistence must be addressed before treating 100 long-running games as supported.

No production traffic, user records, or infrastructure was changed during these tests.

## Diagnosis and implemented changes

The original `analyze-hand` handler called the bounded route search synchronously in the
Socket.IO callback. On an Apple M5 / Node 24.21.0, nine seeded starting-hand probes took
65–196 ms each. A timer scheduled for 10 ms could not fire until analysis returned. A CPU
profile showed both candidate ranking and scoring-library work; simultaneous callers shared
that same event loop. Its per-decision cache did not eliminate cold requests across players.

This branch:

1. Runs analysis in a browser worker using the existing private view and scorer. It has one
   active job per browser, cancellation, an eight-second timeout, stale-result checks, and retry.
   Legacy server analysis requests fail cheaply with a refresh message.
2. Precomputes beam costs and comparison keys without changing the search's candidate limits.
3. Sends gameplay snapshots only to the affected table. Other tables get small public directory
   deltas when the summary changes. Invalid/private requests no longer broadcast globally.
4. Removes duplicate persistence on successful actions. Shutdown avoids repeated persistence
   and broadcasts for every socket disconnect. Disconnected transient caches and removed-table
   bot schedules are released.
5. Counts proxy connections by forwarded client address only when explicit proxy trust is
   enabled. Previously every production visitor could consume the same Caddy-address limit.
   The connection-rate map now also has a hard bound.
6. Adds aggregate operational logs and a reproducible, isolated load harness.

## Measurements

Single local server child process, Node 24.21.0, Apple M5, macOS. Load generator runs in a
separate process on the same machine. Real Socket.IO WebSocket clients, real engine/scorers,
real synchronous JSON persistence to temporary storage. Tables rotate through MCR, Riichi,
and Singapore. Every table attempts legal actions about every two seconds, with starts
staggered across the first two seconds. Claims pass unless a win is available.

| Scenario                                                                        | Actions |              Action p95 / p99 | Event-loop p99 | Application data received | Result                    |
| ------------------------------------------------------------------------------- | ------: | ----------------------------: | -------------: | ------------------------: | ------------------------- |
| Before: 50 games, 200 players, 10-second workload                               |     457 |                966 / 1,011 ms |         721 ms |                 1,651 MiB | Latency target failed     |
| After: 50 games, 200 players, 10-second workload                                |     574 |                     7 / 12 ms |          15 ms |                    50 MiB | Passed; no failed actions |
| After: 100 games, 400 players, 30-second workload; 400 legacy analysis requests |   3,356 |                   70 / 101 ms |          61 ms |                   512 MiB | Passed; no failed actions |
| After: 100 games, ten saved hands per player                                    |       — | Command timeout at 15 seconds |              — |                         — | Failed; run stopped       |

The 100-game fresh run observed approximately 362 MiB server RSS, 0.72 CPU core used on average,
and 110 ms maximum health-request latency. The [final raw report](capacity-results/2026-09-27-100-games.json)
also records a 1.72 MB snapshot and 24 ms maximum save time. An earlier fresh 100-game run
observed 25 ms action p95, so local timings vary; the table uses the final run. The history run creates 4,000 records with 150 events
each; its server RSS exceeded 1 GiB during the stalled run, above the production 768 MiB limit.
It does not represent the maximum allowed history (100 hands per profile).

These are local observations, not VPS benchmarks or SLO guarantees. Initial connection/table
creation is excluded from steady-state timing. Fresh tables use shuffled hands, so action counts
vary between runs. Traffic numbers count application JSON, including directory deltas after the
change; they exclude transport/TLS overhead and static assets. Workload duration is configured
active time; in-flight actions and the final pacing delay can extend the measured interval.
The analysis burst exercises compatibility with old clients; current browsers perform no server
analysis requests. Browser worker behavior is covered separately by browser tests.

### Reproduce safely

```sh
# Fresh tables and 400 human socket clients, with persistence enabled.
LOAD_GAMES=100 LOAD_SECONDS=30 LOAD_ANALYSIS=1 npm run test:load

# Match the 50-table comparison.
LOAD_GAMES=50 LOAD_SECONDS=10 npm run test:load

# Deliberately expose the current archive bottleneck. This is expected to fail.
LOAD_GAMES=100 LOAD_SECONDS=10 LOAD_HISTORY_HANDS=10 npm run test:load
```

Use Node 24. The harness creates a child service on a loopback ephemeral port and a temporary
store, removes that store on completion, and cannot point at production. It omits the origin/IP
handshake gate because hundreds of local clients share one IP; separate tests exercise the
400-address proxy case and spoof resistance. It does not model Caddy, TLS, a slow disk, mobile
networks, browser rendering, bot-heavy rooms, a reconnect storm, or horizontal replicas.

The harness exits nonzero on failed commands, action p95 above 250 ms, or event-loop p99 above
100 ms. These are **engineering acceptance targets**, not external service guarantees. A timeout
is a failure, not a missing sample that may be counted as success.

## Remaining work, in order

| Priority                        | Finding and evidence                                                                                                                                                            | Recommended change                                                                                                                                                                                                                                   | Acceptance check                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 before sustained 400 players | Every mutation serializes and rewrites all profiles, rooms, chat, and full hand archives. Ten histories per player already timed out.                                           | Introduce a storage module with transactional per-room/profile updates and a separate indexed hand archive. SQLite on a single host is a reasonable first candidate; benchmark it. Keep history summaries in memory and page full records on demand. | 100 games / 400 users with 100 histories each; p95 action <250 ms, p99 loop delay <100 ms, bounded RSS; crash/restart preserves acknowledged actions and settlement exactly once. |
| P0 with storage migration       | Backup/restore and image rollback currently understand one version-1 JSON file.                                                                                                 | Design migration, schema versioning, backups, and rollback together. Test restoring existing user data and both sides of a failed deployment before changing the live format.                                                                        | Real backup/restore drill and migration idempotency tests; no partial archive migration.                                                                                          |
| P1                              | Membership, profile, chat, and rule edits still broadcast full state to every connected profile. Reconnects can be expensive.                                                   | Extend scoped delivery to those operations; index online profiles and lobby membership. Cache public directory data per revision.                                                                                                                    | 400-client reconnect wave and busy lobby chat while other tables keep meeting latency targets.                                                                                    |
| P1                              | At 100 fresh games, roughly 512 MiB application traffic in the 30-second workload. Full private snapshots include growing events, repeated rules, and the full lobby directory. | Separate stable directory/profile state from per-table changes. Send event deltas with a revision and fall back to a full snapshot on reconnect or a detected gap.                                                                                   | Measure bytes/action; test dropped updates, reconnect, private-hand isolation, and old-client compatibility.                                                                      |
| P1                              | Limits count saved/inactive tables too; 100 stored rooms means fewer than 100 new active games. Up to 10,000 profiles can retain histories indefinitely.                        | Define active/saved quotas and an explicit retention/archive policy. Never silently delete saved user tables to free capacity.                                                                                                                       | Capacity tests with old profiles, saved tables, and pruning; user-visible retention behavior.                                                                                     |
| P1                              | Timer/bot work and legal-action scoring still share one loop. The current harness covers human actions, not 300 simultaneous bots or many complex near-win Riichi hands.        | Measure those workloads, cache legal-action projections by the complete relevant revision, then isolate CPU work only where the measurements justify it. Preserve receipt ordering and deadlines.                                                    | Bot-heavy and late-hand stress tests; verify timers and claim priority under load.                                                                                                |
| P1                              | Per-socket command quotas allow more traffic through multiple tabs. Shared-NAT groups still share the 240/minute IP handshake limit.                                            | Add per-profile command budgets, cap concurrent sockets per credential, and tune reconnect/NAT policy from measured demand. Bound Socket.IO slow-client buffers.                                                                                     | Spam and slow-reader tests without rejecting normal reconnects or active games.                                                                                                   |
| P2                              | One authoritative owner is a single failure domain. Adding replicas today produces independent room state and competing timers.                                                 | After storage/traffic work, consider table ownership, fencing, a shared directory, and routed commands. A Redis Socket.IO adapter alone is insufficient.                                                                                             | Owner failure and handoff preserve exactly one settlement/turn; rolling deploys reconnect to the correct owner.                                                                   |

An async filesystem call alone is insufficient for the archive issue: serializing the complete
store still consumes CPU on the main loop, and concurrent writes require ordering. Moving the
entire snapshot to a worker also retains copying, bandwidth, growing storage, and durability
questions. The storage boundary should change before adding concurrency around the old format.

## Release and operating checks

- Run the existing unit, browser, mobile, build/type, formatting, deployment, and Compose checks.
- Re-run the load matrix on an isolated staging service on the actual VPS class with realistic
  archive size and Caddy/TLS. Do not load-test the live table service without scheduling it.
- Run a longer soak and reconnect/bot/slow-client scenarios before claiming sustained capacity.
- Watch `server-metrics` logs: event-loop p99/max, RSS, snapshot bytes/save duration, active games,
  and connection counts. Review spikes alongside action latency from the load generator.
- Keep one production game process and one volume. Keep backend port 3001 private when using
  `TRUST_PROXY=1`. Existing page instances may need a refresh to use local Winning routes.

The [architecture guide](architecture.md) contains current and proposed diagrams. Sources used
for mechanism checks: [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers),
[Node event-loop measurements](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html),
[Caddy proxy headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults), and
[Socket.IO multi-node requirements](https://socket.io/docs/v4/using-multiple-nodes/).
