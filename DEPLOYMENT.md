# Deploy Four Winds on a DigitalOcean VPS

This guide deploys **one authoritative game server** behind Caddy at a subdomain such as
`mahjong.example.com`. GitHub builds the app; the VPS pulls immutable container images.
Expect a short reconnect window during an update. Keep one game instance: separate replicas
would disagree about turns and saved rooms.

**Included:** checks on pushes/PRs, tagged-release deployment, automatic recovery after a failed
health check, manual image rollback, private state backups, and explicit backup restoration.
**You supply:** the Droplet, DNS record, SSH keys, GitHub secrets, and registry access. These steps
do not require moving your main website or changing its nameservers.

Provider sources and design decisions are in [deployment-research.md](docs/deployment-research.md).

## 1. Create the VPS and subdomain

In DigitalOcean, create an **Ubuntu 24.04 LTS x86-64 Droplet**, near your players. Start with
**2 GiB RAM** and 1–2 shared vCPUs; this is a small-group starting estimate, not a load-tested
capacity promise. Images are built in GitHub, so the Droplet does not need build resources.
Choose your personal SSH public key, enable monitoring, and consider DigitalOcean backups.
[Droplet creation](https://docs.digitalocean.com/products/droplets/how-to/create/)

At your domain's current DNS provider, create:

| Type | Name      | Value                     |
| ---- | --------- | ------------------------- |
| A    | `mahjong` | Your Droplet IPv4 address |

Use `mahjong.example.com` below with **your actual subdomain**. Add an AAAA record only if the
Droplet's IPv6 networking and firewall are configured. Remove a stale AAAA record. Start with
DNS-only mode if your DNS provider also offers a proxy.
[DNS records](https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/)

Attach a DigitalOcean **Cloud Firewall** to the Droplet:

| Direction | Protocol / port          | Sources / destinations                                                |
| --------- | ------------------------ | --------------------------------------------------------------------- |
| Inbound   | TCP 80, 443              | All IPv4 and IPv6                                                     |
| Inbound   | UDP 443                  | All IPv4 and IPv6; optional HTTP/3                                    |
| Inbound   | TCP 22                   | See the SSH choice below                                              |
| Outbound  | Default allowed outbound | Keep DNS, HTTPS registries, updates, and certificate requests working |

Do **not** expose 3001, 5175, or Docker's API. Only Caddy publishes application ports. Use the
Cloud Firewall even if you also use UFW: Docker-published ports can bypass UFW's normal rules.
[DigitalOcean firewall](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/),
[Docker firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

**SSH choice:** the supplied workflow uses standard GitHub-hosted runners, whose IPs change.
For the simplest setup, allow TCP 22 publicly and use the key-only, restricted account below.
For a tighter network boundary, use a static-IP runner or a VPN/tunnel and allow only that source
plus your administrative IP. Do not allowlist all of GitHub's changing runner ranges.
[GitHub runner networking](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#ip-addresses)

### Create and attach the firewall with doctl

Run these commands **on your computer** with `doctl` installed. Authenticate if needed and find
your Droplet's numeric ID:

```sh
doctl auth init
doctl compute droplet list --format ID,Name,PublicIPv4
```

Replace the placeholder below. This creates a new firewall and attaches it to that Droplet,
allowing public TCP 22/80/443, UDP 443 for HTTP/3, and outbound TCP/UDP/ICMP over IPv4 and IPv6.
[DigitalOcean's create command](https://docs.digitalocean.com/reference/doctl/reference/compute/firewall/create/)

```sh
DROPLET_ID="REPLACE_WITH_YOUR_DROPLET_ID"

FIREWALL_ID="$(doctl compute firewall create \
  --name "four-winds" \
  --droplet-ids "$DROPLET_ID" \
  --inbound-rules "\
protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0 \
protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 \
protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0 \
protocol:udp,ports:443,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "\
protocol:tcp,ports:1-65535,address:0.0.0.0/0,address:::/0 \
protocol:udp,ports:1-65535,address:0.0.0.0/0,address:::/0 \
protocol:icmp,address:0.0.0.0/0,address:::/0" \
  --format ID \
  --no-header)"

doctl compute firewall get "$FIREWALL_ID"
doctl compute firewall list-by-droplet "$DROPLET_ID"
```

`address:::/0` is intentional: the `address:` field followed by IPv6's `::/0`.
Save the returned firewall ID for later management. Use `doctl compute firewall list` to find it
again instead of creating another firewall.

**SSH is publicly reachable with these rules.** Complete the key-only SSH setup in section 2 and
the restricted `fwdeploy` setup in section 3. Restricting port 22 to only your home IP would block
the supplied GitHub Actions deployment workflow; use a static-IP runner or VPN for tighter rules.

The commands give no inbound allowance to 3001, 5175, or Docker's API. Check other attached
firewalls as well: their allow rules can open additional ports, and deny rules take precedence.
[Combined firewall rules](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/)

## 2. Prepare Ubuntu and an administrative account

Use DigitalOcean's console to verify the server's SSH fingerprint before trusting its first
SSH connection. Initially connect as root using the personal key selected when creating it:

```sh
ssh root@YOUR_DROPLET_IP
apt update
apt upgrade -y
apt install -y ca-certificates curl git python3 sudo unattended-upgrades
```

Create the administrator account as root. Set a password when prompted; it is used for `sudo`.
The commands after `adduser` run only if account creation succeeds:

```sh
adduser fwadmin &&
usermod -aG sudo fwadmin &&
install -d -m 700 -o fwadmin -g fwadmin /home/fwadmin/.ssh &&
install -m 600 -o fwadmin -g fwadmin /root/.ssh/authorized_keys /home/fwadmin/.ssh/authorized_keys
```

**Recovering from the earlier `adduser operator` error:** Ubuntu already has a system group named
`operator`, so that command fails before creating the user. Leave the system group in place and
run the `fwadmin` block above as root. Use `fwadmin` throughout the remaining steps. If you already
have a working administrator account, substitute its username, primary group, and home directory.
[Debian reserved account names](https://sources.debian.org/src/user-setup/1.81/reserved-usernames/)

Open **a second terminal** and verify `ssh fwadmin@YOUR_DROPLET_IP` and `sudo -v` work. Keep the
original session open until verified. Then, as `fwadmin`, disable password SSH and root SSH:

```sh
sudo tee /etc/ssh/sshd_config.d/00-four-winds.conf >/dev/null <<'CONFIG'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
CONFIG
sudo sshd -t
sudo systemctl reload ssh
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Keep your administrator's personal key separate from the CI key. Check that another new
`fwadmin` session still works.

DigitalOcean's **Web Console uses SSH**, so `PermitRootLogin no` also blocks its `root` login.
Use `fwadmin` for the Web Console. If its URL contains `os_user=root`, try changing that to
`os_user=fwadmin` and reload. Keep root SSH disabled. For recovery when SSH is unavailable, use
the separate **Recovery Console** under the Droplet's Settings; log in with `fwadmin` and the
password set by `adduser`. This console works independently of SSH.
[Web Console](https://docs.digitalocean.com/products/droplets/how-to/connect-with-console/),
[Recovery Console](https://docs.digitalocean.com/products/droplets/how-to/recovery/recovery-console/)

Install Docker Engine and Compose from Docker's official Ubuntu repository:

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF_DOCKER
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF_DOCKER
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker compose version
sudo systemctl enable --now docker
```

These commands assume a fresh Ubuntu Droplet without conflicting Docker packages. For an
existing installation, follow Docker's removal/migration notes first.
[Official Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/)

Do not add the CI account to the Docker group; Docker access is effectively root access.
The supplied controller uses narrowly scoped sudo instead.
[Docker privileges](https://docs.docker.com/engine/install/linux-postinstall/)

## 3. Install the restricted release controller

On **your computer**, generate a dedicated CI key **outside the repository**:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/four-winds-ci -C four-winds-ci -N ''
```

From this repository, copy the deployment files and **public** key using your personal admin key:

```sh
ssh fwadmin@YOUR_DROPLET_IP 'mkdir -p ~/four-winds-install'
scp -r deploy Caddyfile ~/.ssh/four-winds-ci.pub fwadmin@YOUR_DROPLET_IP:~/four-winds-install/
```

On the VPS:

```sh
sudo sh ~/four-winds-install/deploy/install.sh \
  mahjong.example.com ops@example.com ghcr.io/tr-io/four-winds \
  ~/four-winds-install/four-winds-ci.pub
```

Replace the domain/email; change the GHCR repository only if using a fork. The installer creates:

- `fwdeploy`, with a forced SSH command and no password, PTY, or forwarding for the CI key.
- Root-owned `/etc/four-winds/` containing the domain, Compose file, Caddyfile, and allowed image repository.
- `/usr/local/sbin/four-winds-release`, which accepts only that repository's `@sha256:` image digests.
- Root-private `/opt/four-winds/release.json` and `backups/`.
- A backup timer, initially disabled until the first successful deployment.

The CI account cannot rewrite its authorized key restrictions, Compose files, or controller.
It can deploy, roll back an image, or read release status; it cannot open an arbitrary shell or
restore old game data. A compromised deployment credential still controls which permitted app
image runs, so protect it like a production credential.
[OpenSSH key restrictions](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT)

Test locally:

```sh
ssh -i ~/.ssh/four-winds-ci -o IdentitiesOnly=yes fwdeploy@YOUR_DROPLET_IP status
# Expected initially: {}
ssh -i ~/.ssh/four-winds-ci -o IdentitiesOnly=yes fwdeploy@YOUR_DROPLET_IP 'uname -a'
# Expected: rejected
```

## 4. Allow the VPS to pull the container

GitHub Container Registry packages initially default to private. Pick one option:

**Private package:** create a classic GitHub personal access token with **read:packages** only,
using an account authorized for the package/organization. On the VPS run:

```sh
sudo docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Paste the token at the password prompt. Do not put it in a command, repository, or `.env`.
Docker stores credentials in root's Docker configuration; protect that file and rotate the token.
For organizations, authorize SSO if required. CI publishes using its built-in `GITHUB_TOKEN`;
it does not need this read token.

**Public package:** after the workflow's `publish` job creates the package, make it public under
GitHub package settings. If you have a required reviewer on the `production` environment, do this
before approving the first deploy. Otherwise, the first private pull may fail safely before
stopping anything; change visibility and rerun the failed `deploy` job.
[GHCR authentication, visibility, and digest pulls](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## 5. Set up GitHub Actions

In the repository, open **Settings → Environments → New environment**, name it `production`, and
add these **environment secrets**:

| Secret               | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `DEPLOY_HOST`        | Droplet IPv4 address or SSH hostname, without a scheme               |
| `DEPLOY_SSH_KEY`     | Entire contents of `~/.ssh/four-winds-ci`, including BEGIN/END lines |
| `DEPLOY_KNOWN_HOSTS` | Trusted host-key line for the exact `DEPLOY_HOST`                    |

For the trusted host-key line, use DigitalOcean's authenticated Web Console **as `fwadmin`**
(see section 2), or an SSH session whose host key you already verified. Run:

```sh
cat /etc/ssh/ssh_host_ed25519_key.pub
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Prefix the public key's type and base64 text with your exact host, for example:

```text
203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...actual-server-key...
```

Use the actual full key, not the abbreviated example. Never set `StrictHostKeyChecking=no` or
blindly trust a key scanned from an unverified network connection. A rebuilt Droplet needs a
new verified key in this secret.

Enable Actions and allow package publishing under your organization policy. Use a protected
`main` branch, require the **Check game** workflow, and limit who can create/publish release tags.
Where your GitHub plan supports it, restrict `production` to `v*` tags and protected `main`
(the manual rollback workflow runs from `main`), and require a deployment reviewer.
[Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[Workflow security](https://docs.github.com/en/actions/reference/security/secure-use)

The checked-in workflows are:

| File                                           | Trigger                           | Action                                                                  |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| [ci.yml](.github/workflows/ci.yml)             | Push to main / PR                 | Engine, sockets, deployment-controller, desktop and mobile tests; build |
| [release.yml](.github/workflows/release.yml)   | Published, non-prerelease release | Repeat checks, publish amd64 image, deploy its exact digest             |
| [rollback.yml](.github/workflows/rollback.yml) | Manual Actions run                | Return to the previous recorded image, keeping current data             |

Actions are pinned to full commit SHAs. Production deploy/rollback jobs are serialized. The VPS
also takes an exclusive filesystem lock, covering commands run outside GitHub.

## 6. Publish the first release

Make sure DNS resolves to the Droplet and the Cloud Firewall allows 80/443:

```sh
nslookup mahjong.example.com
```

After pushing your reviewed changes to `main`:

1. In GitHub, open **Releases → Draft a new release**.
2. Create a tag such as **`v1.1.0`**, targeting the desired commit on `main`.
3. Write release notes and save the draft. **Saving a draft does not deploy.**
4. When ready, click **Publish release**, leaving “pre-release” unchecked.
5. Follow **Actions → Publish and deploy release**. Approve the production job if configured.

Tags must use `vMAJOR.MINOR.PATCH`; their commit must be an ancestor of `main`. Pushes run tests
only. Publishing a prerelease does not deploy production. Create a new version rather than
moving an existing release tag.
[GitHub release-event behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)

The controller pulls the image, stops public traffic and the game, backs up saved state, starts
one new game process, waits for container health, starts Caddy, and checks public HTTPS health.
Caddy obtains and renews the certificate using persistent certificate storage.
[Caddy HTTPS](https://caddyserver.com/docs/automatic-https),
[Socket.IO reverse proxies](https://socket.io/docs/v4/reverse-proxy/)

Verify:

```sh
curl --fail https://mahjong.example.com/api/health
# {"ok":true,"game":"Four Winds"}
ssh -i ~/.ssh/four-winds-ci fwdeploy@YOUR_DROPLET_IP status
```

Open the URL on two devices, create a table, join by invitation, discard, and reconnect. Reload
open browser tabs after a release to load the new client bundle. Browser credentials restore
profiles and seats. [TESTING.md](TESTING.md) includes the multiplayer checklist.

## 7. Roll back an app release

In GitHub, choose **Actions → Roll back production → Run workflow → main**. Or run locally:

```sh
ssh -i ~/.ssh/four-winds-ci -o IdentitiesOnly=yes fwdeploy@YOUR_DROPLET_IP rollback
```

This takes another backup, restores the previous exact image, and **keeps current saved game
data**. Repeating rollback toggles between the two recorded images. You can also deploy an older
known digest shown in a previous release workflow's summary:

```sh
ssh -i ~/.ssh/four-winds-ci fwdeploy@YOUR_DROPLET_IP \
  'deploy ghcr.io/tr-io/four-winds@sha256:REPLACE_WITH_64_HEX_DIGEST'
```

If a deployment health check fails, the controller tries the previous image without rewinding
state. An incompatible saved-state version stops automatic recovery and requires an explicit
administrator decision. Releases using state version `1` must remain backward compatible;
future breaking migrations need their own reviewed migration plan and a version bump.
Do not delete GHCR images/digests still needed for rollback.

## 8. Backups and disaster recovery

After the first deployment, enable daily snapshots:

```sh
sudo systemctl enable --now four-winds-backup.timer
sudo systemctl list-timers four-winds-backup.timer
sudo /usr/local/sbin/four-winds-release backup
sudo ls -l /opt/four-winds/backups
```

The controller retains the newest **20 local snapshots**. Each contains `four-winds.json` and a
manifest recording its image digest/state version. The server writes its state by atomic rename,
so a scheduled file copy captures one complete saved snapshot. Deploy snapshots are taken while
stopped. Check `journalctl -u four-winds-backup.service` for backup failures.

**Copy backups off the Droplet.** Example, run from your computer using the personal admin key
and an account whose sudo policy permits this command (ordinary `fwadmin` sudo may prompt; run
it interactively first or arrange a narrowly scoped backup-export command):

```sh
# On the VPS, create a private export for your administrator account:
sudo tar -C /opt/four-winds -czf /home/fwadmin/four-winds-backups.tgz backups
sudo chown fwadmin:fwadmin /home/fwadmin/four-winds-backups.tgz
sudo chmod 600 /home/fwadmin/four-winds-backups.tgz
# On your computer:
scp fwadmin@YOUR_DROPLET_IP:~/four-winds-backups.tgz ./four-winds-backups.tgz
```

Store exports outside the repository, encrypt them in your backup system, and remove staging
exports after copying. They contain private profiles and unrevealed hands. A local backup cannot
survive loss of the Droplet. DigitalOcean backups/snapshots can add another recovery layer;
follow its consistency recommendations.
[Droplet snapshots](https://docs.digitalocean.com/products/snapshots/how-to/snapshot-droplets/)

**Restore old game data only when intended:** this discards hands/profile changes after that
snapshot. On the VPS, with the personal administrator account:

```sh
sudo /usr/local/sbin/four-winds-release 'restore 20260926T120000Z-1234abcd'
```

Replace the folder name with an actual backup. The controller archives the current state, restores
the selected file with the runtime user's ownership, and starts the matching image. CI keys cannot
run this operation. If recovery fails, keep traffic stopped and inspect logs; do not repeatedly
switch images against an incompatible state file.

For a lost Droplet: create a replacement, repeat setup, restore root-private `backups/` from your
off-server export, deploy the backup's matching digest to initialize the volumes, then use the
restore command. Update DNS and GitHub's trusted SSH host key. Test this on an isolated recovery
Droplet before relying on the process.

## 9. Operations and security limits

To inspect containers, read the current digest with `status`, then use it for Compose:

```sh
sudo /usr/local/sbin/four-winds-release status
sudo env FOUR_WINDS_IMAGE='ghcr.io/tr-io/four-winds@sha256:ACTUAL_DIGEST' \
  docker compose --project-name four-winds --env-file /etc/four-winds/.env \
  -f /etc/four-winds/compose.yaml ps
sudo env FOUR_WINDS_IMAGE='ghcr.io/tr-io/four-winds@sha256:ACTUAL_DIGEST' \
  docker compose --project-name four-winds --env-file /etc/four-winds/.env \
  -f /etc/four-winds/compose.yaml logs --tail=100 game caddy
```

- Monitor memory, disk space, backup timer failures, and HTTPS uptime. Container logs rotate at
  3 × 10 MB per service. Schedule Ubuntu/Docker updates and review base-image/action updates.
- App releases do not replace root-owned infrastructure. To change Caddy, Compose, or the release
  controller, review the files, copy them with your admin key, and rerun the installer. Preserve
  `/opt/four-winds` and Docker volumes. Never use `docker compose down -v` on production.
- Runtime: unprivileged game user, read-only root filesystem, dropped capabilities, bounded memory
  and process count, internal-only game port, exact allowed browser origin, and HTTPS.
- The server validates actions and host permissions. Hand analysis never reads opponents' hidden
  hands or secret indicators. Profile tokens are bearer credentials; protect browser storage and
  backups. Only hashes are saved server-side.
- Room/lobby codes are invitations, not access-controlled accounts. The app has no membership gate,
  password recovery, moderation, or DDoS protection. For an invite-only club needing stronger entry
  control, add an access gateway that supports WebSockets. Origin checks do not authenticate custom
  non-browser clients. This is not a third-party security audit.
- No real money, payment integration, or cash-out exists; all chips are fake.

## Local container smoke test

```sh
docker build -t four-winds:local .
docker run --rm --name four-winds-test -p 127.0.0.1:3102:3001 \
  -e NODE_ENV=development -e ALLOWED_ORIGINS=http://localhost:3102 \
  four-winds:local
```

Open `http://localhost:3102`. The development setting here permits plain HTTP only for this
loopback smoke test. Production uses HTTPS. For the original local-build deployment, `compose.yaml`
and `.env.example` remain available; the release workflow uses `deploy/compose.release.yaml`.
