#!/bin/sh
# Run as root on Ubuntu after installing Docker's official Engine/Compose packages.
set -eu
if [ "$(id -u)" != 0 ]; then echo 'Run with sudo.' >&2; exit 1; fi
if [ "$#" != 4 ]; then echo 'Usage: install.sh mahjong.example.com email@example.com ghcr.io/owner/repo /path/to/ci-key.pub' >&2; exit 1; fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
/usr/bin/docker compose version
/usr/bin/python3 - "$1" "$2" "$3" "$4" <<'PY'
import base64,json,pathlib,re,sys
host,email,repository,keyfile=sys.argv[1:]
if not re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}',host): raise SystemExit('Use a plain lower-case domain, with no scheme or path.')
if not re.fullmatch(r'[A-Za-z0-9._+\-]+@[A-Za-z0-9.\-]+',email): raise SystemExit('Invalid email.')
if not re.fullmatch(r'ghcr.io/[a-z0-9_.-]+/[a-z0-9_.-]+',repository): raise SystemExit('Use a lower-case GHCR owner/repository.')
key=pathlib.Path(keyfile).read_text().strip().split()
if len(key)<2 or key[0]!='ssh-ed25519': raise SystemExit('Use an Ed25519 public key.')
base64.b64decode(key[1],validate=True)
path=pathlib.Path('/etc/four-winds');path.mkdir(mode=0o700,exist_ok=True)
(path/'config.json').write_text(json.dumps({'domain':host,'repository':repository})+'\n')
(path/'.env').write_text(f'DOMAIN={host}\nACME_EMAIL={email}\n')
(path/'deploy.pub').write_text(' '.join(key[:2])+'\n')
PY
id fwdeploy >/dev/null 2>&1 || useradd --create-home --shell /bin/sh fwdeploy
passwd -l fwdeploy >/dev/null
# The deploy account may neither change its key restrictions nor edit root-run files.
chown root:root /home/fwdeploy
chmod 755 /home/fwdeploy
install -d -o root -g root -m 755 /home/fwdeploy/.ssh
install -d -o root -g root -m 700 /opt/four-winds /opt/four-winds/backups
install -o root -g root -m 755 "$script_dir/release.py" /usr/local/sbin/four-winds-release
install -o root -g root -m 755 "$script_dir/ssh-command.sh" /usr/local/sbin/four-winds-ssh
install -o root -g root -m 600 "$script_dir/compose.release.yaml" /etc/four-winds/compose.yaml
install -o root -g root -m 600 "$script_dir/../Caddyfile" /etc/four-winds/Caddyfile
printf 'restrict,command="/usr/local/sbin/four-winds-ssh" %s\n' "$(cat /etc/four-winds/deploy.pub)" > /home/fwdeploy/.ssh/authorized_keys
chown root:root /home/fwdeploy/.ssh/authorized_keys
# sshd reads authorized_keys as fwdeploy. Root ownership prevents edits, but
# this public-key file must remain readable by that user.
chmod 644 /home/fwdeploy/.ssh/authorized_keys
chmod 600 /etc/four-winds/* /etc/four-winds/.env
printf '%s\n' 'fwdeploy ALL=(root) NOPASSWD: /usr/local/sbin/four-winds-release *' > /etc/sudoers.d/four-winds
chmod 440 /etc/sudoers.d/four-winds
visudo -cf /etc/sudoers.d/four-winds
install -m 644 "$script_dir/four-winds-backup.service" /etc/systemd/system/
install -m 644 "$script_dir/four-winds-backup.timer" /etc/systemd/system/
systemctl daemon-reload
printf '%s\n' 'Installed. Add the GitHub production secrets, publish your first release, then enable four-winds-backup.timer. See DEPLOYMENT.md.'
