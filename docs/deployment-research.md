# DigitalOcean deployment research

Checked **26 September 2026**. This note records the sources and design choices behind the
[deployment guide](../DEPLOYMENT.md). Recommendations below are project decisions; provider
capabilities are linked to their official documentation.

## Recommended shape

Use one **Ubuntu 24.04 LTS, x86-64 Droplet**, initially **2 vCPU / 2 GiB RAM**, near the players.
This sizing is a starting estimate for small groups, not a measured capacity guarantee. Build
images in GitHub Actions so the VPS only pulls and runs them. DigitalOcean lets you select the
region, OS, SSH key, monitoring, and backups during creation; check its live control panel for
available sizes and prices. [Droplet creation](https://docs.digitalocean.com/products/droplets/how-to/create/)

Ubuntu 24.04 has standard security maintenance through May 2029. Install Docker Engine and the
Compose plugin from Docker's official Ubuntu apt repository. Keep the existing Node 24 container
baseline and Caddy 2 configuration, and update their reviewed image versions regularly.
[Ubuntu lifecycle](https://ubuntu.com/about/release-cycle),
[Docker installation](https://docs.docker.com/engine/install/ubuntu/)

The repository uses one authoritative process and one JSON state file. Run **one game container**
behind Caddy; independent replicas would disagree about rooms and timers. Keep named volumes for
game state and Caddy certificates. The existing runtime already uses an unprivileged user,
read-only filesystem, dropped capabilities, and an internal game port. See
[compose.yaml](../compose.yaml), [Dockerfile](../Dockerfile), and
[server/service.ts](../server/service.ts).

## DNS, HTTPS, and public ports

- At the domain's existing DNS provider, add an **A** record named `mahjong` pointing to the
  Droplet IPv4 address. Moving the whole domain's nameservers is unnecessary. Add an **AAAA**
  record only when IPv6 is configured and reachable. DNS record types are documented in
  [DigitalOcean's DNS guide](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/).
- Set `DOMAIN=mahjong.example.com`, an ACME contact email, and the exact allowed origin
  `https://mahjong.example.com`. Caddy obtains and renews certificates when DNS resolves correctly,
  ports 80/443 reach it, and certificate storage persists.
  [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- Attach a **DigitalOcean Cloud Firewall**: allow TCP 80/443 publicly, optionally UDP 443 for
  HTTP/3, and SSH only from the sources appropriate to the deployment method below. Keep the
  game's port 3001 unpublished. Preserve outbound access for DNS, HTTPS registries, package
  updates, and certificate issuance.
  [Cloud Firewall rules](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/)
- Do not rely on UFW to hide a published Docker port: Docker diverts that traffic before UFW's
  usual filtering path. Do not disable Docker's firewall management as a workaround.
  [Docker and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

Caddy's reverse proxy supports the Socket.IO route. Any additional proxy must allow WebSocket
upgrades and timeouts greater than the ping interval plus ping timeout: 45 seconds under the
current Socket.IO defaults. [Socket.IO reverse proxies](https://socket.io/docs/v4/reverse-proxy/)

## Releases and deployment credentials

Use this release trigger:

```yaml
on:
  release:
    types: [published]
```

Saving a draft is a staging step; **publishing** starts delivery. A published prerelease also
triggers this event, so the production job should explicitly exclude prereleases. Ordinary
pushes and pull requests should run checks without deploying.
[GitHub release events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)

Recommended workflow:

1. Check out the release tag, verify its commit belongs to `main`, run unit/network/mobile tests,
   and build the container for `linux/amd64`.
2. Publish to `ghcr.io/tr-io/four-winds` using the job's `GITHUB_TOKEN` with only the required
   `contents: read` and `packages: write` permissions. Record the resulting image digest.
3. Deploy **`ghcr.io/tr-io/four-winds@sha256:…`**, not a moving `latest` tag. A digest identifies
   the exact image. A public GHCR package can be pulled anonymously; a private package requires
   VPS credentials, usually a classic PAT limited to `read:packages`.
   [GHCR authentication and digests](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
4. Serialize production deployments, use a `production` environment, and store SSH credentials
   there. Environment branch/tag restrictions and optional reviewers depend on repository
   visibility and the GitHub plan.
   [Deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Pin workflow actions to reviewed full commit SHAs. Pass external strings through environment
variables and validate them before shell use. Keep release/CI configuration protected because
anyone who can publish arbitrary deployment code can change the running service.
[GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use)

### SSH choices

Standard GitHub-hosted runners have changing IP ranges, so restricting SSH to a developer's home
IP prevents CI from connecting. GitHub discourages using its entire runner range as an allowlist.
A static-IP runner or private tunnel offers tighter network access; the simpler setup uses
publicly reachable **key-only SSH** with the constrained deployment account below.
[Runner networking](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#ip-addresses)

Give CI a dedicated key and account with `restrict,command="…"` in its authorized-key entry.
The root-owned wrapper should accept only a validated deployment digest or a rollback command,
then call a fixed, root-owned deployment script through narrowly scoped sudo. Disable password
authentication, forwarding, PTYs, and interactive access for this key. Pin the server's host key
from the DigitalOcean console; never disable host-key verification.
[OpenSSH authorized keys](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT)

Keep Compose files, scripts, the deployment account's home/authorized keys, and environment files
unwritable by that account. Do not add it to the Docker group: that membership grants root-level
privileges. This design limits the CI key to replacing the app image; a compromised permitted
image can still read the game's data volume.
[Docker privileges](https://docs.docker.com/engine/install/linux-postinstall/)

## Update, rollback, and recovery

The deployment script should pull the new digest first, take a private snapshot of stopped game
state, record the current digest, replace the game container, and wait for its health check.
Compose supports waiting for healthy services. Also check the public HTTPS health endpoint and
join a room with two browsers; an HTTP check alone does not test multiplayer.
[Compose health waiting](https://docs.docker.com/reference/cli/docker/compose/up/)

**Image rollback** restores the previous image while retaining current game state. It is safe
only while the saved-state schema remains backward compatible. The current server rejects
unknown store versions. **State restoration** is a separate maintenance operation: stop the
game, archive current data, restore a chosen backup, and start the matching image. It discards
hands and profile changes made after that backup; do not silently restore state during an
automatic health-check rollback. These are project-specific requirements inferred from
[the persistence implementation](../server/service.ts).

Keep several previous digests and off-server private backups. A snapshot on the same Droplet
does not cover loss of that Droplet. DigitalOcean recommends powering down for consistent
Droplet snapshots; stopping the game while copying its JSON file provides a narrower application
backup. Test restoration on an isolated instance.
[Droplet snapshots](https://docs.digitalocean.com/products/snapshots/how-to/snapshot-droplets/)

Use Docker's rotating `local` log driver or explicit size limits, monitor disk/RAM and HTTPS
availability, and schedule OS/image updates. Public ports, profile bearer tokens, saved hidden
hands, and deployment keys all deserve protection; the application currently has no stronger
club membership or moderation gate.
[Docker log rotation](https://docs.docker.com/engine/logging/configure/)
