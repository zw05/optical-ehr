#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Optical EHR monorepo.
# Installs a local PostgreSQL, project dependencies, and prepares the API schema + seed data.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION=16

echo "==> Ensuring PostgreSQL $PG_VERSION is installed"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    "postgresql-$PG_VERSION" postgresql-client
fi

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster "$PG_VERSION" main start || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Configuring postgres role and ehr database"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ehr'" | grep -q 1 \
  || sudo -u postgres createdb ehr

echo "==> Installing Node dependencies"
npm install

echo "==> Creating apps/api/.env if missing"
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env

echo "==> Generating Prisma client, applying migrations, seeding dev data"
cd apps/api
npx prisma generate
npx prisma migrate deploy
npm run seed

echo "==> Install complete"
