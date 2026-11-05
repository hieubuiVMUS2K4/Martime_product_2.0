"""Regression checks for independent builds and safe selective deployments."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


changes = load('changes')
if sys.platform == 'win32':
    sys.modules['fcntl'] = types.SimpleNamespace(flock=lambda *_: None, LOCK_EX=2)
deployment = load('deploy')


class ChangesTests(unittest.TestCase):
    def test_release_is_restricted_to_production_branch(self):
        workflows = HERE.parents[1] / '.github' / 'workflows'
        reusable = (workflows / 'ci-cd.yml').read_text(encoding='utf-8')
        self.assertEqual(reusable.count("github.ref == 'refs/heads/production'"), 3)
        self.assertNotIn("github.ref == 'refs/heads/master'", reusable)
        for app in ('shore', 'edge'):
            entry = (workflows / f'{app}-ci-cd.yml').read_text(encoding='utf-8')
            self.assertEqual(entry.count('branches: [production,'), 2)

    def test_shore_frontend_is_independent(self):
        files = ['shore_product/frontend/src/App.tsx']
        self.assertEqual(changes.components('shore', files), (False, True))
        self.assertEqual(changes.components('edge', files), (False, False))

    def test_edge_backend_is_independent(self):
        files = ['edge_product/edge-services/Program.cs']
        self.assertEqual(changes.components('edge', files), (True, False))
        self.assertEqual(changes.components('shore', files), (False, False))

    def test_both_shared_trees_check_both_backends(self):
        for tree in ('shore', 'edge'):
            for app in ('shore', 'edge'):
                self.assertEqual(changes.components(app, [f'{tree}_product/shared/DTOs/A.cs']), (True, False))

    def test_test_only_change_checks_own_backend(self):
        self.assertEqual(changes.components('shore', ['shore_product/backend.Tests/A.cs']), (True, False))
        self.assertEqual(changes.components('edge', ['edge_product/edge-services.Tests/A.cs']), (True, False))

    def test_mobile_and_documents_do_not_build_web(self):
        for app in ('shore', 'edge'):
            self.assertEqual(changes.components(app, ['docs/guide.md', 'edge_product/frontend-mobile/App.tsx']), (False, False))

    def test_nginx_and_dockerfile(self):
        self.assertEqual(changes.components('edge', ['edge_product/production/nginx/default.ssl.conf.template']), (False, True))
        self.assertEqual(changes.components('shore', ['shore_product/production/Dockerfile.backend']), (True, False))

    def test_workflow_change_checks_every_component(self):
        for app in ('shore', 'edge'):
            self.assertEqual(changes.components(app, ['.github/workflows/ci-cd.yml']), (True, True))


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        (self.directory / 'docker-compose.yml').write_text('services: {}')
        (self.directory / 'backend').mkdir()
        (self.directory / 'backend' / 'appsettings.json').write_text('{}')
        (self.directory / 'nginx').mkdir()
        (self.directory / 'nginx' / 'default.conf').write_text('server { listen 443 ssl; }')
        self.config = {'name': 'production', 'services': {'frontend': {'volumes': []}}}
        self.request = {'app': 'shore', 'directory': str(self.directory), 'compose_files': 'docker-compose.yml',
                        'project': '', 'commit': 'a' * 40, 'sequence': 12,
                        'registry_user': 'ci-user', 'registry_token': 'temporary-token',
                        'images': {'frontend': 'ghcr.io/company/project/shore-frontend:' + 'a' * 40}}
        self.calls = []
        self.fail_pull = self.fail_update = False
        self.health_failures = 0

    def docker(self, args, capture=False, stdin=None):
        self.calls.append(args)
        if 'config' in args and '--format' in args:
            output = json.dumps(self.config)
        elif 'ps' in args:
            output = 'container-' + args[-1]
        elif 'inspect' in args:
            output = 'sha256:old-' + args[-1]
        else:
            output = ''
        if 'pull' in args and self.fail_pull:
            raise subprocess.CalledProcessError(1, args)
        if any('exec wget ' in arg for arg in args) and self.health_failures:
            self.health_failures -= 1
            raise subprocess.CalledProcessError(1, args)
        if 'up' in args and 'pending.json' in ' '.join(args) and self.fail_update:
            self.fail_update = False
            raise subprocess.CalledProcessError(1, args)
        return subprocess.CompletedProcess(args, 0, stdout=output)

    def perform(self):
        with patch.object(deployment, 'run', side_effect=self.docker):
            deployment.deploy(self.request)

    def test_frontend_only_keeps_database_and_backend(self):
        self.perform()
        up = next(c for c in self.calls if 'up' in c)
        self.assertEqual(up[-1], 'frontend')
        self.assertIn('--no-deps', up)
        self.assertNotIn('backend', up)
        self.assertNotIn('postgres', up)
        result = json.loads((self.directory / '.cicd/images.json').read_text())
        self.assertEqual(result['services']['frontend']['volumes'][0]['source'], str(self.directory / 'nginx/default.conf'))

    def test_backend_preserves_settings_and_reloads_nginx(self):
        self.request['images'] = {'backend': 'ghcr.io/company/project/shore-backend:' + 'a' * 40}
        self.perform()
        result = json.loads((self.directory / '.cicd/images.json').read_text())
        self.assertEqual(result['services']['backend']['volumes'][0]['target'], '/app/appsettings.json')
        self.assertTrue(any(c[-3:] == ['nginx', '-s', 'reload'] for c in self.calls))

    def test_pull_failure_does_not_replace_container(self):
        self.fail_pull = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.perform()
        self.assertFalse(any('up' in c for c in self.calls))

    def test_partial_update_failure_restores_previous_image(self):
        self.fail_update = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.perform()
        self.assertTrue(any('rollback.json' in ' '.join(c) and 'up' in c for c in self.calls))
        self.assertFalse((self.directory / '.cicd/release.json').exists())

    def test_newer_release_is_not_overwritten(self):
        state = self.directory / '.cicd'
        state.mkdir()
        (state / 'release.json').write_text(json.dumps({'sequence': 13}))
        self.perform()
        self.assertEqual(self.calls, [])

    def test_existing_edge_ssl_mount_is_preserved(self):
        self.config['services']['frontend']['volumes'] = [{'type': 'bind', 'source': str(self.directory / 'nginx/default.conf'), 'target': '/etc/nginx/templates/default.conf.template'}]
        self.perform()
        result = json.loads((self.directory / '.cicd/images.json').read_text())
        self.assertEqual(result['services']['frontend']['volumes'][0]['source'], self.config['services']['frontend']['volumes'][0]['source'])

    def test_missing_server_settings_stops_before_pull(self):
        self.request['images'] = {'backend': 'ghcr.io/company/project/shore-backend:' + 'a' * 40}
        (self.directory / 'backend/appsettings.json').unlink()
        with self.assertRaises(ValueError):
            self.perform()
        self.assertFalse(any('pull' in c for c in self.calls))

    def test_readiness_failure_restores_previous_images(self):
        self.health_failures = 60
        with patch.object(deployment.time, 'sleep'), self.assertRaises(RuntimeError):
            self.perform()
        self.assertTrue(any('rollback.json' in ' '.join(c) and 'up' in c for c in self.calls))
        self.assertFalse((self.directory / '.cicd/images.json').exists())

    def test_later_backend_release_keeps_frontend_image(self):
        self.perform()
        self.request['images'] = {'backend': 'ghcr.io/company/project/shore-backend:' + 'b' * 40}
        self.request['sequence'] = 13
        self.perform()
        services = json.loads((self.directory / '.cicd/images.json').read_text())['services']
        self.assertTrue(services['frontend']['image'].endswith('a' * 40))
        self.assertTrue(services['backend']['image'].endswith('b' * 40))

    def test_registry_login_uses_stdin_and_ephemeral_config(self):
        self.perform()
        login = next(c for c in self.calls if 'login' in c)
        self.assertIn('--password-stdin', login)
        self.assertNotIn('temporary-token', login)
        self.assertFalse(Path(login[2]).exists())

    def test_health_probe_reads_internal_key_from_frontend(self):
        self.perform()
        probe = next(c[-1] for c in self.calls if any('exec wget ' in arg for arg in c))
        self.assertIn('$INTERNAL_API_KEY', probe)
        self.assertIn('X-Forwarded-Proto: https', probe)

    def test_edge_readiness_uses_internal_api_endpoint(self):
        self.request['app'] = 'edge'
        self.request['images'] = {'frontend': 'ghcr.io/company/project/edge-frontend:' + 'a' * 40}
        self.perform()
        probe = next(c[-1] for c in self.calls if any('exec wget ' in arg for arg in c))
        self.assertIn('http://backend:5001/api/health/ready', probe)


if __name__ == '__main__':
    unittest.main()
