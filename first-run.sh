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

echo "Starting first-run infrastructure..."
compose up -d postgres minio minio-init clamav

INITIALIZED=$(compose exec -T postgres psql -U kuotesuite -d kuotesuite -Atqc \
  "SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'pulse'
      AND table_type = 'BASE TABLE'
  );")

if [ "$INITIALIZED" = "t" ]; then
  cat >&2 <<'EOF'

Pulse is already initialized. First-run stopped without changing the database
or stored documents.

Start the existing environment with:
  docker compose up -d --build

The destructive demo reset is intentionally separate and must be requested
explicitly:
  docker compose exec -T api npm run db:reset-demo

EOF
  exit 2
fi

echo "Building the API initialization image..."
compose build api

echo "Creating the initial schema and demo data..."
compose run --rm -T api npm run db:initialize

echo "Starting the full Pulse stack..."
compose up -d --build

cat <<'EOF'

Pulse is ready for local development.

Web:               http://localhost:4300
API health:        http://localhost:4300/api/health
Direct API health: http://localhost:3000/api/health
MinIO console:     http://localhost:9001

Seeded local accounts:
Admin:            admin@r2.local / PulseAdmin123!
Sales:            sales@r2.local / PulseSales123!
Project Manager:  project.manager@r2.local / PulsePm123!
Technician:       technician@r2.local / PulseTech123!

EOF
