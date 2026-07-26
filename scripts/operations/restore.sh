#!/bin/sh
set -eu

env_file=""
backup_file=""
restore_project="pulse-restore-validation"
apply=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file) env_file=${2:-}; shift 2 ;;
    --backup-file) backup_file=${2:-}; shift 2 ;;
    --project) restore_project=${2:-}; shift 2 ;;
    --apply) apply=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$env_file" ] || [ ! -f "$backup_file" ]; then
  echo "Both --env-file and --backup-file are required." >&2
  exit 2
fi
: "${PULSE_RESTORE_POSTGRES_VOLUME:?Export a new restore-only PostgreSQL volume name.}"
: "${PULSE_RESTORE_MINIO_VOLUME:?Export a new restore-only MinIO volume name.}"
case "$PULSE_RESTORE_POSTGRES_VOLUME:$PULSE_RESTORE_MINIO_VOLUME" in
  *restore*:*restore*) ;;
  *) echo "Restore volume names must contain 'restore'." >&2; exit 2 ;;
esac
if docker volume inspect "$PULSE_RESTORE_POSTGRES_VOLUME" >/dev/null 2>&1 || \
   docker volume inspect "$PULSE_RESTORE_MINIO_VOLUME" >/dev/null 2>&1; then
  echo "Restore refused: one or both target volumes already exist." >&2
  exit 2
fi

restore_mode=preview
if [ "$apply" = "1" ]; then restore_mode=execution; fi
echo "Restore $restore_mode plan: encrypted archive -> isolated project $restore_project using new restore-only volumes."
echo "No existing Pulse volume or database will be selected for overwrite."
if [ "$apply" != "1" ]; then
  echo "Preview only; add --apply after reviewing the target project and volume names."
  exit 0
fi
: "${PULSE_BACKUP_AGE_IDENTITY_FILE:?Export the age identity file path.}"
if [ ! -f "$PULSE_BACKUP_AGE_IDENTITY_FILE" ]; then
  echo "The age identity file does not exist." >&2
  exit 2
fi
identity_dir=$(cd "$(dirname "$PULSE_BACKUP_AGE_IDENTITY_FILE")" && pwd -P)
identity_name=$(basename "$PULSE_BACKUP_AGE_IDENTITY_FILE")
PULSE_BACKUP_AGE_IDENTITY_FILE="$identity_dir/$identity_name"
export PULSE_BACKUP_AGE_IDENTITY_FILE

umask 077
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/pulse-restore.XXXXXX")
case "$work_dir" in
  "${TMPDIR:-/tmp}"/pulse-restore.*) ;;
  *) echo "Unexpected temporary restore path." >&2; exit 1 ;;
esac
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT HUP INT TERM

backup_archive_dir=$(cd "$(dirname "$backup_file")" && pwd -P)
backup_archive_name=$(basename "$backup_file")
PULSE_BACKUP_ARCHIVE_DIR=$backup_archive_dir
PULSE_RESTORE_WORK_DIR=$work_dir
export PULSE_BACKUP_ARCHIVE_DIR PULSE_RESTORE_WORK_DIR
docker compose -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile restore run --rm --no-deps -T backup-decrypt \
  --decrypt -i /run/secrets/age-identity -o /restore/backup.tar.gz "/archives/$backup_archive_name"
tar -xzf "$work_dir/backup.tar.gz" -C "$work_dir"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$work_dir" && sha256sum -c MANIFEST.sha256)
else
  (cd "$work_dir" && shasum -a 256 -c MANIFEST.sha256)
fi

PULSE_POSTGRES_VOLUME=$PULSE_RESTORE_POSTGRES_VOLUME
PULSE_MINIO_VOLUME=$PULSE_RESTORE_MINIO_VOLUME
export PULSE_POSTGRES_VOLUME PULSE_MINIO_VOLUME PULSE_RESTORE_WORK_DIR

docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" up -d --wait --wait-timeout 180 postgres minio
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" exec -T postgres sh -c \
  'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error' \
  < "$work_dir/postgres/pulse.dump"
docker compose -p "$restore_project" -f compose.production.yaml -f compose.maintenance.yaml \
  --env-file "$env_file" --profile restore run --rm minio-restore

echo "Restore completed into isolated project $restore_project."
echo "Do not cut over. Provision restricted roles, deploy migrations, run integrity checks, then perform operator acceptance."
echo "For follow-up commands, explicitly select PULSE_POSTGRES_VOLUME=$PULSE_RESTORE_POSTGRES_VOLUME and PULSE_MINIO_VOLUME=$PULSE_RESTORE_MINIO_VOLUME."
