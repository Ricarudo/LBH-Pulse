#!/bin/sh
set -eu

env_file=${1:-.env.ci}
if [ ! -f "$env_file" ]; then
  echo "A generated .env.ci file is required." >&2
  exit 2
fi
umask 077
validation_dir=$(mktemp -d "${TMPDIR:-/tmp}/pulse-ci-backup-restore.XXXXXX")
case "$validation_dir" in
  "${TMPDIR:-/tmp}"/pulse-ci-backup-restore.*) ;;
  *) echo "Unexpected CI validation path." >&2; exit 1 ;;
esac
restore_suffix=${GITHUB_RUN_ID:-local}-$$
restore_project="pulse-restore-ci-$restore_suffix"
export PULSE_RESTORE_POSTGRES_VOLUME="pulse-restore-ci-postgres-$restore_suffix"
export PULSE_RESTORE_MINIO_VOLUME="pulse-restore-ci-minio-$restore_suffix"

cleanup() {
  docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
    --env-file "$env_file" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$validation_dir"
}
trap cleanup EXIT HUP INT TERM

export PULSE_BACKUP_ARCHIVE_DIR="$validation_dir"
docker compose -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile backup run --rm --no-deps -T \
  --entrypoint age-keygen backup-encrypt -o /archives/age-identity.txt >/dev/null 2>&1
export PULSE_BACKUP_AGE_RECIPIENT
PULSE_BACKUP_AGE_RECIPIENT=$(docker compose -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile backup run --rm --no-deps -T \
  --entrypoint age-keygen backup-encrypt -y /archives/age-identity.txt)
export PULSE_BACKUP_AGE_IDENTITY_FILE="$validation_dir/age-identity.txt"
export PULSE_BACKUP_DIR="$validation_dir/archives"
export PULSE_BACKUP_RETENTION_DAYS=1

source_fingerprint=$(docker compose -f compose.ci.yaml --env-file "$env_file" \
  run --rm --no-deps -T checks \
  npm run verify:data-fingerprint -w @pulse/api -- --digest-only | tail -n 1)
if ! printf '%s' "$source_fingerprint" | grep -Eq '^[a-f0-9]{64}$'; then
  echo "Source release-data fingerprint was not produced." >&2
  exit 1
fi

./scripts/operations/backup.sh --environment ci --env-file "$env_file"
backup_file=$(find "$PULSE_BACKUP_DIR" -maxdepth 1 -type f -name 'pulse-ci-*.tar.gz.age' -print | head -n 1)
if [ -z "$backup_file" ]; then
  echo "CI backup archive was not created." >&2
  exit 1
fi

./scripts/operations/restore.sh \
  --env-file "$env_file" \
  --backup-file "$backup_file" \
  --project "$restore_project" \
  --apply

# The restore script is a child process, so re-select its new volumes explicitly
# for every follow-up Compose command in this validation shell.
export PULSE_POSTGRES_VOLUME="$PULSE_RESTORE_POSTGRES_VOLUME"
export PULSE_MINIO_VOLUME="$PULSE_RESTORE_MINIO_VOLUME"

docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" run --rm minio-init
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile maintenance run --rm db-roles \
  npm run db:roles:apply -w @pulse/api
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile maintenance run --rm migrate
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile maintenance run --rm db-role-verify
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile maintenance run --rm data-integrity \
  npm run verify:data-integrity:deep -w @pulse/api -- --require-documents

restored_fingerprint=$(docker compose -p "$restore_project" \
  -f compose.production.yaml -f compose.maintenance.yaml --env-file "$env_file" \
  --profile maintenance run --rm --no-deps -T data-integrity \
  npm run verify:data-fingerprint -w @pulse/api -- --digest-only | tail -n 1)
if [ "$source_fingerprint" != "$restored_fingerprint" ]; then
  echo "Restored critical-data fingerprint differs from the backup source." >&2
  exit 1
fi

echo "Critical release-data fingerprint matched before backup and after restore."
echo "Encrypted PostgreSQL and MinIO backup/restore validation passed in an isolated project."
