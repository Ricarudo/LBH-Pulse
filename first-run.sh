#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR"

compose() {
  if [ -n "${COMPOSE:-}" ]; then
    # shellcheck disable=SC2086
    $COMPOSE "$@"
    return
  fi

  docker compose "$@"
}

echo "Preparing Pulse first-run environment..."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the default Pulse stack." >&2
  exit 1
fi

echo "Starting PostgreSQL and API containers..."
compose up -d --build postgres api

echo "Applying Prisma schema and seeding the database..."
compose exec api npm run db:setup

echo "Starting the full Pulse stack..."
compose up -d --build

cat <<'EOF'

Pulse is ready for local development.

Web:               http://localhost:4300
API health:        http://localhost:4300/api/health
Direct API health: http://localhost:3000/api/health

Seeded local accounts:
Admin:            admin@r2.local / PulseAdmin123!
Sales:            sales@r2.local / PulseSales123!
Project Manager:  project.manager@r2.local / PulsePm123!
Technician:       technician@r2.local / PulseTech123!

EOF
