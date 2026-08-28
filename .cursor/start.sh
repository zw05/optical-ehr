#!/usr/bin/env bash
# Per-boot startup: ensure the local PostgreSQL cluster is running before the
# API and web dev terminals launch. Dependency install and seeding live in install.sh.
set -euo pipefail

PG_VERSION=16

sudo pg_ctlcluster "$PG_VERSION" main start || true
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL did not become ready in time" >&2
exit 1
