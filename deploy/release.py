#!/usr/bin/python3 -I
"""Root-owned release controller. The SSH key can deploy only this repository's digests."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid


def parse_command(raw, repository, deploy_user=False):
    parts = shlex.split(raw)
    if parts == ['status'] or parts == ['rollback'] or parts == ['backup']:
        return parts[0], None
    if len(parts) == 2 and parts[0] == 'deploy' and re.fullmatch(
        re.escape(repository) + r'@sha256:[a-f0-9]{64}', parts[1]
    ):
        return parts[0], parts[1]
    if not deploy_user and len(parts) == 2 and parts[0] == 'restore' and re.fullmatch(
        r'\d{8}T\d{6}Z-[a-f0-9]{8}', parts[1]
    ):
        return parts[0], parts[1]
    raise ValueError('Use deploy <approved repository@sha256:digest>, rollback, backup, or status. State restore requires an administrator.')


def atomic_json(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n')
    tmp.chmod(0o600)
    tmp.replace(path)


class Releases:
    def __init__(self, config_dir=Path('/etc/four-winds'), root=Path('/opt/four-winds')):
        self.config_dir, self.root = config_dir, root
        self.config = json.loads((config_dir / 'config.json').read_text())
        self.state_file = root / 'release.json'
        self.state = json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        self.backups = root / 'backups'
        self.backups.mkdir(parents=True, exist_ok=True, mode=0o700)

    def run(self, args, image, **kwargs):
        env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
               'FOUR_WINDS_IMAGE': image}
        return subprocess.run(args, env=env, text=True, check=True, **kwargs)

    def compose(self, image, *args, **kwargs):
        return self.run(['/usr/bin/docker', 'compose', '--project-name', 'four-winds',
                         '--env-file', str(self.config_dir / '.env'),
                         '-f', str(self.config_dir / 'compose.yaml'), *args], image, **kwargs)

    def validate_image(self, image):
        parse_command('deploy ' + image, self.config['repository'])
        self.run(['/usr/bin/docker', 'pull', image], image)
        version = self.run(['/usr/bin/docker', 'image', 'inspect', '--format',
                            '{{ index .Config.Labels "io.four-winds.state-version" }}', image],
                           image, capture_output=True).stdout.strip()
        if not version.isdigit():
            raise ValueError('Image must declare io.four-winds.state-version.')
        return int(version)

    def snapshot(self, image):
        name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
        folder = self.backups / name
        folder.mkdir(mode=0o700)
        try:
            destination = folder / 'four-winds.json'
            self.compose(image, 'cp', 'game:/app/data/four-winds.json', str(destination))
            destination.chmod(0o600)
            data = json.loads(destination.read_text())
            atomic_json(folder / 'manifest.json', {'image': image, 'version': data['version'], 'created': name})
        except Exception:
            shutil.rmtree(folder)
            raise
        print('State backup:', name, flush=True)
        # Keep the newest 20 locally. Copy backups off-server independently.
        complete = sorted(p for p in self.backups.iterdir() if (p / 'manifest.json').exists())
        for old in complete[:-20]:
            shutil.rmtree(old)
        return folder

    def start(self, image):
        self.compose(image, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'game')
        self.compose(image, 'up', '-d', '--no-deps', 'caddy')
        health = self.run(['/usr/bin/curl', '--fail', '--silent', '--show-error', '--retry', '12',
                  '--retry-all-errors', '--retry-delay', '5', '--max-time', '10',
                  'https://' + self.config['domain'] + '/api/health'], image, capture_output=True)
        if json.loads(health.stdout) != {'ok': True, 'game': 'Four Winds'}:
            raise RuntimeError('Public HTTPS endpoint did not return Four Winds health.')

    def deploy(self, image):
        schema = self.validate_image(image)  # Pull before interrupting players.
        old = self.state.get('current')
        if old == image:
            print('This image is already deployed.'); return
        self.compose(old or image, 'stop', 'caddy')
        self.compose(old or image, 'stop', '-t', '30', 'game')
        try:
            if old:
                backup = self.snapshot(old)
                if json.loads((backup / 'manifest.json').read_text())['version'] != schema:
                    raise ValueError('Saved-state version differs. Use a reviewed migration, not automatic deployment.')
            self.start(image)
        except Exception:
            self.compose(image, 'stop', 'caddy')
            self.compose(image, 'stop', '-t', '30', 'game')
            if old:
                # Preserve current data. Refuse to run old code on a migrated snapshot.
                current = self.snapshot(image)
                actual = json.loads((current / 'manifest.json').read_text())['version']
                if self.validate_image(old) != actual:
                    raise RuntimeError('Recovery paused: state schema changed. Administrator must restore a backup explicitly.')
                print('Deployment failed; recovering previous image without rewinding state.', flush=True)
                self.start(old)
            raise
        self.state = {'current': image, 'previous': old, 'deployed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        atomic_json(self.state_file, self.state)
        print('Deployed:', image)

    def restore(self, name):
        folder = self.backups / name
        manifest = json.loads((folder / 'manifest.json').read_text())
        image = manifest['image']
        schema = self.validate_image(image)
        data = json.loads((folder / 'four-winds.json').read_text())
        if data['version'] != schema:
            raise ValueError('Backup does not match the image state version.')
        old = self.state.get('current') or image
        self.compose(old, 'stop', 'caddy')
        self.compose(old, 'stop', '-t', '30', 'game')
        # Keep the selected backup bytes before snapshot retention can rotate its folder.
        selected = json.dumps(data)
        self.snapshot(old)
        with tempfile.TemporaryDirectory(dir=self.root) as temp:
            path = Path(temp) / 'four-winds.json'
            path.write_text(selected)
            path.chmod(0o600)
            os.chown(path, 1000, 1000)
            self.compose(old, 'cp', '-a', str(path), 'game:/app/data/four-winds.json')
        self.start(image)
        self.state = {'current': image, 'previous': old, 'restored_backup': name}
        atomic_json(self.state_file, self.state)
        print('Restored backup:', name)


def main():
    if os.geteuid() != 0:
        raise PermissionError('Run through sudo or the restricted deployment key.')
    os.umask(0o077)
    root = Path('/opt/four-winds')
    root.mkdir(mode=0o700, exist_ok=True)
    with (root / 'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manager = Releases(root=root)
        if len(sys.argv) != 2:
            raise ValueError('Pass one quoted command, for example: "deploy ghcr.io/owner/repo@sha256:…"')
        operation, value = parse_command(sys.argv[1], manager.config['repository'], os.environ.get('SUDO_USER') == 'fwdeploy')
        if operation == 'status': print(json.dumps(manager.state, indent=2))
        elif operation == 'backup':
            if not manager.state.get('current'): raise ValueError('No deployed image yet.')
            manager.snapshot(manager.state['current'])
        elif operation == 'restore': manager.restore(value)
        else:
            image = value if operation == 'deploy' else manager.state.get('previous')
            if not image: raise ValueError('No previous image recorded. Deploy a known digest explicitly.')
            manager.deploy(image)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('Deployment error:', error, file=sys.stderr)
        sys.exit(1)
