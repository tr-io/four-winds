# Deploying Four Winds

## Recommended: Docker Compose with HTTPS

Use a server with Docker Engine and Docker Compose. Point a domain's DNS A/AAAA records at it, and allow inbound **80/tcp**, **443/tcp**, and optionally **443/udp**. Only Caddy exposes public ports; the game container stays on the internal network.

```sh
cp .env.example .env
```

Edit `.env`:

```dotenv
DOMAIN=mahjong.your-domain.example
ACME_EMAIL=you@your-domain.example
```

Then run:

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 game caddy
```

Open `https://mahjong.your-domain.example`. Caddy obtains and renews the certificate and redirects HTTP to HTTPS. Its reverse proxy supports Socket.IO's WebSocket upgrade. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [Socket.IO's reverse-proxy guide](https://socket.io/docs/v4/reverse-proxy/).

Both the website and networking server use this one origin. `ALLOWED_ORIGINS` is set to your exact HTTPS origin. The browser never connects directly to port 3001.

## Local container smoke test

```sh
docker build -t four-winds:local .
docker run --rm --name four-winds-test \
  -p 127.0.0.1:3102:3001 \
  -e NODE_ENV=development \
  -e ALLOWED_ORIGINS=http://localhost:3102,http://127.0.0.1:3102 \
  four-winds:local
```

Open `http://localhost:3102`. `NODE_ENV=development` in this local-only example prevents the production HTTPS-upgrade header on a plain HTTP smoke test. Stop it with Ctrl+C. For persistence, add a named volume: `-v four-winds-test-data:/app/data`.

## Existing container platform or reverse proxy

Build the supplied Dockerfile, run **one replica**, expose internal port **3001** through the platform's HTTPS endpoint, and mount a persistent writable volume at `/app/data`.

| Environment variable | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `PORT`               | Internal listener port; default `3001`                                    |
| `DATA_FILE`          | State file; Docker default `/app/data/four-winds.json`                    |
| `ALLOWED_ORIGINS`    | Comma-separated exact browser origins, e.g. `https://mahjong.example.com` |
| `NODE_ENV`           | Set to `production` behind HTTPS                                          |

The reverse proxy must forward the WebSocket upgrade and allow long-lived connections. Idle timeouts must exceed Socket.IO's ping interval plus timeout (45 seconds with the supplied defaults); 60 seconds or more is appropriate. See [the Socket.IO proxy requirements](https://socket.io/docs/v4/reverse-proxy/).

Health check: **`GET /api/health`** returns `{"ok":true,"game":"Four Winds"}`. A static-site-only host cannot run the authoritative multiplayer server.

## Networking and state protection

- The server owns tiles, scoring, timers, turn order, claim receipt order, and rule snapshots. Clients send an action ID and the current decision ID, never scores or wall contents.
- A 256-bit random bearer token reconnects a profile. Only its SHA-256 hash is stored server-side. Profiles are anonymous; a displayed player ID cannot claim another person's seat.
- Production walls use Node's cryptographic random integer generator. Test fixtures use explicitly supplied deterministic seeds. The seed, wall order, hidden hands, and unrevealed indicators are excluded from normal client views.
- Socket handshakes reject unapproved browser origins. Commands have bounded schemas, per-socket rate limits, a 32 KiB message limit, and host checks. Decision IDs and request IDs prevent duplicate or stale turn resolution.
- User names and house-rule names are escaped before HTML rendering. Helmet adds CSP, frame protection, content-type protection, and related headers. Fonts and tile artwork are served locally.
- The runtime container uses the unprivileged `node` user, a read-only root filesystem, no added Linux capabilities, no privilege escalation, a memory limit, and a writable data volume. Do not mount the Docker socket or unrelated host directories.

CSP permits inline styles because the interface sets progress and animation styles. Its scripts remain restricted to this origin. Origin restrictions protect browser handshakes; they do not authenticate arbitrary non-browser clients. Keep HTTPS enabled because a bearer credential grants access to its profile.

## Persistence, backups, and updates

The game writes a complete JSON snapshot to a temporary file and atomically renames it after each accepted mutation. Room hands, pending claims, balances, bot seats, profiles, and saved rules survive a normal process restart. Back up the **`game-data`** volume regularly. A host or storage failure still requires your backup strategy.

For a quiet maintenance window:

```sh
docker compose stop game
docker compose cp game:/app/data/four-winds.json ./four-winds-backup.json
docker compose start game
```

Keep backups private: they contain unrevealed game state and profile metadata. Do not commit them. The main `data/` directory is ignored by git and excluded from the Docker build.

Update and restart:

```sh
docker compose up -d --build
```

Connected browsers reconnect automatically. A table with no connected humans stops advancing; elapsed deadlines are processed when someone reconnects. The same browser credential restores the same seat.

## Operating boundaries

This is a single-process application for small groups. Do not scale it to multiple replicas with independent files: those processes would disagree about room state. Distributed deployment would require a shared transactional store, room ownership, and coordinated timers, in addition to Socket.IO routing.

There are limits of 100 rooms, 100 lobbies, 30 saved rulesets per profile, and 10,000 guest profiles. The server does not implement account recovery, password-protected rooms, moderation, public-service abuse controls, or a distributed denial-of-service service. A room code is an invitation. For a private club deployment, place the whole site behind your existing access gateway if stronger admission control is needed.

The included tests exercise origin rejection, hidden-state projections, session reconnection, stale/duplicate actions, and bot takeover. They are not a third-party security audit. No public deployment, domain purchase, or external account changes are performed by the project setup.
