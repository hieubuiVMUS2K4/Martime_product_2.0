#!/usr/bin/env bash
set -euo pipefail

: "${SSH_HOST:?Set SSH_HOST in the GitHub environment}"
: "${SSH_USER:?Set SSH_USER in the GitHub environment}"
: "${SSH_PRIVATE_KEY:?Set SSH_PRIVATE_KEY in the GitHub environment}"
: "${SSH_KNOWN_HOSTS:?Set SSH_KNOWN_HOSTS in the GitHub environment}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH in the GitHub environment}"
SSH_PORT=${SSH_PORT:-22}
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$SSH_USER" =~ ^[a-zA-Z0-9_-]+$ && "$SSH_PORT" =~ ^[0-9]+$ ]]
ssh_dir=$(mktemp -d)
trap 'rm -rf "$ssh_dir"' EXIT
printf '%s\n' "$SSH_PRIVATE_KEY" | tr -d '\r' > "$ssh_dir/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" | tr -d '\r' > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
python3 - <<'PY' > "$ssh_dir/request.json"
import json, os
print(json.dumps({
    'app': os.environ['APP'], 'directory': os.environ['DEPLOY_PATH'],
    'compose_files': os.environ.get('DEPLOY_COMPOSE_FILES') or 'docker-compose.yml',
    'project': os.environ.get('DEPLOY_PROJECT_NAME', ''),
    'images': {service: os.environ['IMAGE_PREFIX'] + '-' + service + ':' + os.environ['GITHUB_SHA']
               for service in ('backend', 'frontend') if os.environ['UPDATE_' + service.upper()] == 'true'},
    'commit': os.environ['GITHUB_SHA'], 'sequence': int(os.environ['GITHUB_RUN_NUMBER']),
    'registry_user': os.environ['GITHUB_ACTOR'], 'registry_token': os.environ['REGISTRY_TOKEN'],
}))
PY
# Transfer the request as data. Server paths are not interpolated into shell commands.
payload=$(python3 - "$ssh_dir/request.json" <<'PY'
import base64, pathlib, sys
print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())
PY
)
{
  printf 'REQUEST_B64 = "%s"\n' "$payload"
  cat scripts/cicd/deploy.py
} | ssh -i "$ssh_dir/key" -p "$SSH_PORT" \
  -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$ssh_dir/known_hosts" \
  "$SSH_USER@$SSH_HOST" python3 -
