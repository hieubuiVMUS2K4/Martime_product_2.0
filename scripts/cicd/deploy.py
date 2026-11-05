"""Run on the application server using its existing Compose package and secrets."""
import base64
import copy
import fcntl
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time


def run(args, capture=False, stdin=None):
    return subprocess.run(args, check=True, text=True, input=stdin, stdout=subprocess.PIPE if capture else None)


def deploy(request):
    app = request['app']
    if app not in ('shore', 'edge'):
        raise ValueError('Unknown application')
    directory = Path(request['directory']).resolve(strict=True)
    files = [directory / name.strip() for name in request['compose_files'].split(',') if name.strip()]
    if not files or any(not file.is_file() for file in files):
        raise ValueError('Check DEPLOY_COMPOSE_FILES and DEPLOY_PATH')
    images = request['images']
    if not images or set(images) - {'backend', 'frontend'}:
        raise ValueError('Invalid service selection')
    for service, image in images.items():
        if not re.fullmatch(r'ghcr\.io/[a-z0-9._/-]+/' + app + '-' + service + r':[0-9a-f]{40}', image):
            raise ValueError('Invalid release image')
    state = directory / '.cicd'
    state.mkdir(mode=0o700, exist_ok=True)
    with (state / 'deploy.lock').open('w') as lock, tempfile.TemporaryDirectory(prefix='ghcr-', dir=state) as registry_directory:
        fcntl.flock(lock, fcntl.LOCK_EX)
        release_file = state / 'release.json'
        previous_release = json.loads(release_file.read_text()) if release_file.exists() else {}
        if previous_release.get('sequence', -1) > request['sequence']:
            print('Skipping an older workflow run because a newer release is already deployed.')
            return
        docker = ['docker', '--config', registry_directory]
        command = docker + ['compose', '--project-directory', str(directory)]
        if request.get('project'):
            command += ['-p', request['project']]
        for file in files:
            command += ['-f', str(file)]
        current = state / 'images.json'
        previous = json.loads(current.read_text()) if current.exists() else {'services': {}}
        base = command + (['-f', str(current)] if current.exists() else [])
        config = json.loads(run(base + ['config', '--format', 'json'], capture=True).stdout)
        # Reuse the project name to avoid creating a separate database/volume namespace.
        command += ['-p', config['name']]
        old_images = {}
        for service in ('backend', 'frontend'):
            container = run(base + ['ps', '-q', service], capture=True).stdout.strip()
            if not container or '\n' in container:
                raise ValueError('Expected one running ' + service + ' container in the existing project')
            old_images[service] = run(['docker', 'inspect', '--format', '{{.Image}}', container], capture=True).stdout.strip()
        candidate = copy.deepcopy(previous)
        for service, image in images.items():
            candidate['services'].setdefault(service, {})['image'] = image
        if 'backend' in images:
            settings = directory / 'backend' / 'appsettings.json'
            if not settings.is_file():
                raise ValueError('The server package must contain backend/appsettings.json')
            backend = candidate['services']['backend']
            backend['volumes'] = [{'type': 'bind', 'source': str(settings), 'target': '/app/appsettings.json', 'read_only': True}]
            production_settings = settings.with_name('appsettings.Production.json')
            if production_settings.is_file():
                backend['volumes'].append({'type': 'bind', 'source': str(production_settings), 'target': '/app/appsettings.Production.json', 'read_only': True})
        if 'frontend' in images:
            mounts = config['services']['frontend'].get('volumes', [])
            template = next((m['source'] for m in mounts if m.get('target') == '/etc/nginx/templates/default.conf.template' and m.get('type') == 'bind'), None)
            if not template:
                default = directory / 'nginx' / 'default.conf'
                template = default if default.is_file() and re.search(r'listen\s+443', default.read_text()) else directory / 'nginx' / 'default.conf.template'
            template = Path(template)
            if not template.is_file():
                raise ValueError('Nginx template is missing from the existing server package')
            candidate['services']['frontend']['volumes'] = [{'type': 'bind', 'source': str(template), 'target': '/etc/nginx/templates/default.conf.template', 'read_only': True}]
        selected = list(images)
        pending = state / 'pending.json'
        pending.write_text(json.dumps(candidate, indent=2))
        update = command + ['-f', str(pending)]
        run(update + ['config', '--quiet'])
        run(docker + ['login', 'ghcr.io', '-u', request['registry_user'], '--password-stdin'],
            capture=True, stdin=request['registry_token'])
        # Pull every selected image before replacing any running container.
        run(update + ['pull', *selected])
        rollback = copy.deepcopy(previous)
        for service in selected:
            rollback['services'].setdefault(service, {})['image'] = old_images[service]
        rollback_file = state / 'rollback.json'
        rollback_file.write_text(json.dumps(rollback, indent=2))
        (state / 'previous-images.json').write_text(json.dumps(previous, indent=2))

        def healthy(compose):
            port = '5000' if app == 'shore' else '5001'
            endpoint = '/health/ready' if app == 'shore' else '/api/health/ready'
            for _ in range(60):
                try:
                    # The internal endpoint checks readiness including the database.
                    probe = ('exec wget -q -O /dev/null --timeout=5 '
                             '--header="X-Forwarded-Proto: https" '
                             '--header="X-Internal-Api-Key: $INTERNAL_API_KEY" '
                             f'http://backend:{port}{endpoint}')
                    run(compose + ['exec', '-T', 'frontend', 'sh', '-c', probe], capture=True)
                    run(compose + ['exec', '-T', 'frontend', 'nginx', '-t'], capture=True)
                    run(compose + ['exec', '-T', 'frontend', 'test', '-s', '/usr/share/nginx/html/index.html'], capture=True)
                    return True
                except subprocess.CalledProcessError:
                    time.sleep(3)
            return False

        try:
            run(update + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', *selected])
            if not healthy(update):
                raise RuntimeError('Application readiness check failed')
            # Nginx resolves backend addresses again when its configuration is reloaded.
            if 'backend' in images and 'frontend' not in images:
                run(update + ['exec', '-T', 'frontend', 'nginx', '-s', 'reload'])
        except Exception:
            print('Deployment failed. Restoring previous application images.', flush=True)
            restore = command + ['-f', str(rollback_file)]
            run(restore + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', *selected])
            if 'backend' in images and 'frontend' not in images:
                run(restore + ['exec', '-T', 'frontend', 'nginx', '-s', 'reload'])
            if not healthy(restore):
                print('Restored images did not become ready. Check application/database compatibility.', flush=True)
            raise
        pending.replace(current)
        release_file.write_text(json.dumps({'commit': request['commit'], 'sequence': request['sequence'], 'images': images}, indent=2))
        print('Deployed ' + app + ' ' + request['commit'] + ' services ' + ', '.join(selected))


if __name__ == '__main__':
    deploy(json.loads(base64.b64decode(REQUEST_B64)))
