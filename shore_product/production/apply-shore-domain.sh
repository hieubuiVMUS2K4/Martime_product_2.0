#!/bin/sh
# For the Desktop production-shore package with SSL in docker-compose.yml.
set -eu
cd "$(dirname "$0")"

test -s certs/origin.pem
test -s certs/origin-key.pem
openssl x509 -in certs/origin.pem -noout -checkhost shore.vesselmaritimevmu.site | grep -F 'does match certificate'
openssl x509 -in certs/origin.pem -noout -checkend 0
chmod 700 certs
chmod 600 certs/origin-key.pem
chmod 644 certs/origin.pem
test -f .env
cp -p .env ".env.before-shore-domain-$(date +%Y%m%d-%H%M%S)"
sed -i '/^SHORE_PUBLIC_BASE_URL=/d' .env
printf '\nSHORE_PUBLIC_BASE_URL=https://shore.vesselmaritimevmu.site\n' >> .env
docker compose config --quiet
if ! docker compose config | grep -Fq 'Shore__PublicBaseUrl: https://shore.vesselmaritimevmu.site'; then
    echo 'Set SHORE_PUBLIC_BASE_URL=https://shore.vesselmaritimevmu.site in the server .env before deploying.' >&2
    exit 1
fi
docker compose up -d --build backend frontend
docker compose exec -T frontend nginx -t
docker compose ps
