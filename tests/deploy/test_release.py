import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[2] / 'deploy/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
REPO = 'ghcr.io/tr-io/four-winds'
OLD = REPO + '@sha256:' + 'a'*64
NEW = REPO + '@sha256:' + 'b'*64


class ReleaseTests(unittest.TestCase):
    def test_restricted_key_cannot_inject_commands_or_change_registry_or_restore_data(self):
        for command in ['deploy '+NEW+'; id', 'deploy '+NEW+' extra', 'deploy evil.io/game@sha256:'+'a'*64,
                        'deploy '+REPO+':latest', 'deploy $(id)', 'restore 20260926T010101Z-12345678']:
            with self.assertRaises(ValueError): release.parse_command(command, REPO, True)
        self.assertEqual(release.parse_command('deploy '+NEW, REPO, True), ('deploy', NEW))
        self.assertEqual(release.parse_command('rollback', REPO, True), ('rollback', None))
        self.assertEqual(release.parse_command('restore 20260926T010101Z-12345678', REPO, False)[0], 'restore')

    def manager(self, root):
        config=root/'config'; config.mkdir()
        (config/'config.json').write_text(json.dumps({'domain':'mahjong.example.com','repository':REPO}))
        state=root/'state';state.mkdir()
        release.atomic_json(state/'release.json',{'current':OLD,'previous':None})
        return release.Releases(config,state)

    def test_success_records_digest_only_after_health_checks_and_keeps_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=self.manager(Path(folder)); backup=Path(folder)/'backup'; backup.mkdir()
            (backup/'manifest.json').write_text('{"version":1}')
            with patch.object(manager,'validate_image',return_value=1), patch.object(manager,'compose') as compose, \
                 patch.object(manager,'snapshot',return_value=backup) as snapshot, patch.object(manager,'start') as start:
                manager.deploy(NEW)
                snapshot.assert_called_once_with(OLD)
                start.assert_called_once_with(NEW)
                self.assertEqual(compose.call_args_list[0].args,(OLD,'stop','caddy'))
                state=json.loads(manager.state_file.read_text())
                self.assertEqual(state['current'],NEW); self.assertEqual(state['previous'],OLD)

    def test_health_failure_recovers_previous_image_without_restoring_data(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=self.manager(Path(folder)); backup=Path(folder)/'backup'; backup.mkdir()
            (backup/'manifest.json').write_text('{"version":1}')
            original=manager.state_file.read_text()
            with patch.object(manager,'validate_image',return_value=1), patch.object(manager,'compose'), \
                 patch.object(manager,'snapshot',return_value=backup), patch.object(manager,'restore') as restore, \
                 patch.object(manager,'start',side_effect=[RuntimeError('unhealthy'),None]) as start:
                with self.assertRaisesRegex(RuntimeError,'unhealthy'):manager.deploy(NEW)
                self.assertEqual([call.args[0] for call in start.call_args_list],[NEW,OLD])
                restore.assert_not_called()
                self.assertEqual(manager.state_file.read_text(),original)

    def test_public_health_must_identify_this_game(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=self.manager(Path(folder))
            with patch.object(manager,'compose'), patch.object(manager,'run',return_value=Mock(stdout='{"ok":true,"game":"Other app"}')):
                with self.assertRaisesRegex(RuntimeError,'Four Winds health'):manager.start(NEW)
            with patch.object(manager,'compose'), patch.object(manager,'run',return_value=Mock(stdout='{"ok":true,"game":"Four Winds"}')):
                manager.start(NEW)

    def test_failed_upgrade_with_incompatible_state_requires_explicit_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            manager=self.manager(Path(folder)); before=Path(folder)/'before'; before.mkdir()
            after=Path(folder)/'after'; after.mkdir()
            (before/'manifest.json').write_text('{"version":1}')
            (after/'manifest.json').write_text('{"version":2}')
            with patch.object(manager,'validate_image',return_value=1), patch.object(manager,'compose'), \
                 patch.object(manager,'snapshot',side_effect=[before,after]), \
                 patch.object(manager,'start',side_effect=RuntimeError('failed')) as start:
                with self.assertRaisesRegex(RuntimeError,'state schema changed'): manager.deploy(NEW)
                start.assert_called_once_with(NEW)


if __name__ == '__main__':unittest.main()
