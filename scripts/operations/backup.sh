#!/bin/sh
set -eu

environment=""
env_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) environment=${2:-}; shift 2 ;;
    --env-file) env_file=${2:-}; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$environment" != "production" ] && [ "$environment" != "development" ] && [ "$environment" != "ci" ]; then
  echo "Use --environment production, development, or ci." >&2
  exit 2
fi
if [ ! -f "$env_file" ]; then
  echo "A readable --env-file is required." >&2
  exit 2
fi
: "${PULSE_BACKUP_DIR:?Export PULSE_BACKUP_DIR outside the repository.}"
: "${PULSE_BACKUP_AGE_RECIPIENT:?Export the age public recipient.}"

umask 077
mkdir -p "$PULSE_BACKUP_DIR"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/pulse-backup.XXXXXX")
case "$work_dir" in
  "${TMPDIR:-/tmp}"/pulse-backup.*) ;;
  *) echo "Unexpected temporary backup path." >&2; exit 1 ;;
esac
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT HUP INT TERM
mkdir -p "$work_dir/postgres" "$work_dir/config"

case "$environment" in
  production) compose_files="-f compose.production.yaml -f compose.maintenance.yaml" ;;
  development) compose_files="-f compose.yaml -f compose.maintenance.yaml" ;;
  ci) compose_files="-f compose.ci.yaml -f compose.maintenance.yaml" ;;
esac

# shellcheck disable=SC2086
docker compose $compose_files --env-file "$env_file" exec -T postgres sh -c \
  'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$work_dir/postgres/pulse.dump"

PULSE_BACKUP_WORK_DIR=$work_dir
export PULSE_BACKUP_WORK_DIR
# shellcheck disable=SC2086
docker compose $compose_files --env-file "$env_file" --profile backup run --rm minio-backup

tar -czf "$work_dir/config/deployment-config.tar.gz" \
  compose.production.yaml compose.maintenance.yaml .env.example docker scripts/operations docs 2>/dev/null || \
  tar -czf "$work_dir/config/deployment-config.tar.gz" \
    compose.production.yaml compose.maintenance.yaml .env.example docker scripts/operations

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$work_dir" && find postgres minio config -type f -print | sort | xargs sha256sum) > "$work_dir/MANIFEST.sha256"
else
  (cd "$work_dir" && find postgres minio config -type f -print | sort | xargs shasum -a 256) > "$work_dir/MANIFEST.sha256"
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="pulse-$environment-$timestamp.tar.gz.age"
archive="$PULSE_BACKUP_DIR/$archive_name"
PULSE_BACKUP_ARCHIVE_DIR=$PULSE_BACKUP_DIR
export PULSE_BACKUP_ARCHIVE_DIR
# Encryption runs in a release-tagged, network-isolated image so the host does
# not need age installed and plaintext never enters the archive directory.
# shellcheck disable=SC2086
tar -czf - -C "$work_dir" . | docker compose $compose_files --env-file "$env_file" \
  --profile backup run --rm --no-deps -T backup-encrypt \
  -r "$PULSE_BACKUP_AGE_RECIPIENT" -o "/archives/$archive_name"
test -s "$archive"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$archive" > "$archive.sha256"
else
  shasum -a 256 "$archive" > "$archive.sha256"
fi

if [ "${PULSE_BACKUP_PRUNE:-0}" = "1" ]; then
  retention=${PULSE_BACKUP_RETENTION_DAYS:-30}
  find "$PULSE_BACKUP_DIR" -maxdepth 1 -type f \( -name 'pulse-*.tar.gz.age' -o -name 'pulse-*.tar.gz.age.sha256' \) -mtime "+$retention" -delete
fi

echo "Encrypted Pulse backup created: $archive"
echo "No environment file or plaintext credential was archived."
