#!/bin/sh
set -eu

output=${1:-.env.ci}
case "$output" in
  .env.ci|*/.env.ci) ;;
  *) echo "CI environment output must be named .env.ci." >&2; exit 2 ;;
esac

umask 077
admin_password=$(openssl rand -hex 24)
migration_password=$(openssl rand -hex 24)
app_password=$(openssl rand -hex 24)
minio_root_password=$(openssl rand -hex 24)
minio_app_password=$(openssl rand -hex 24)
session_secret=$(openssl rand -hex 48)
security_pepper=$(openssl rand -hex 48)
setup_token=$(openssl rand -hex 48)
demo_admin_password=$(openssl rand -hex 20)
demo_sales_password=$(openssl rand -hex 20)
demo_pm_password=$(openssl rand -hex 20)
demo_technician_password=$(openssl rand -hex 20)
release_tag=${GITHUB_SHA:-local}

{
  printf '%s\n' "NODE_ENV=production"
  printf '%s\n' "PULSE_RELEASE_TAG=ci-$release_tag"
  printf '%s\n' "PULSE_PUBLIC_URL=https://pulse.example.invalid"
  printf '%s\n' "PULSE_HOSTNAME=pulse.example.invalid"
  printf '%s\n' "PULSE_CADDY_TARGET=internal"
  printf '%s\n' "PULSE_CADDY_EMAIL=operator@example.invalid"
  printf '%s\n' "PULSE_HTTP_PORT=8080"
  printf '%s\n' "PULSE_HTTPS_PORT=8443"
  printf '%s\n' "POSTGRES_IMAGE=postgres:16.14-alpine"
  printf '%s\n' "POSTGRES_DB=pulse"
  printf '%s\n' "POSTGRES_ADMIN_USER=pulse_ci_admin"
  printf '%s\n' "POSTGRES_ADMIN_PASSWORD=$admin_password"
  printf '%s\n' "PULSE_DB_MIGRATION_USER=pulse_ci_migrator"
  printf '%s\n' "PULSE_DB_MIGRATION_PASSWORD=$migration_password"
  printf '%s\n' "PULSE_DB_APP_USER=pulse_ci_app"
  printf '%s\n' "PULSE_DB_APP_PASSWORD=$app_password"
  printf '%s\n' "PULSE_DATABASE_ADMIN_URL=postgresql://pulse_ci_admin:$admin_password@postgres:5432/pulse?schema=pulse"
  printf '%s\n' "PULSE_DATABASE_MIGRATION_URL=postgresql://pulse_ci_migrator:$migration_password@postgres:5432/pulse?schema=pulse"
  printf '%s\n' "DATABASE_URL=postgresql://pulse_ci_app:$app_password@postgres:5432/pulse?schema=pulse"
  printf '%s\n' "PULSE_LEGACY_DATABASE_ROLE="
  printf '%s\n' "PULSE_POSTGRES_VOLUME=pulse-ci-production-gate-postgres"
  printf '%s\n' "MINIO_ROOT_USER=pulse-ci-root"
  printf '%s\n' "MINIO_ROOT_PASSWORD=$minio_root_password"
  printf '%s\n' "S3_ENDPOINT=http://minio:9000"
  printf '%s\n' "S3_REGION=us-east-1"
  printf '%s\n' "S3_BUCKET=pulse-ci-documents"
  printf '%s\n' "S3_ACCESS_KEY=pulse-ci-app"
  printf '%s\n' "S3_SECRET_KEY=$minio_app_password"
  printf '%s\n' "S3_FORCE_PATH_STYLE=true"
  printf '%s\n' "PULSE_MINIO_VOLUME=pulse-ci-production-gate-minio"
  printf '%s\n' "PULSE_SESSION_SECRET=$session_secret"
  printf '%s\n' "PULSE_SECURITY_PEPPER=$security_pepper"
  printf '%s\n' "PULSE_SETUP_TOKEN=$setup_token"
  printf '%s\n' "PULSE_COOKIE_SECURE=true"
  printf '%s\n' "PULSE_COOKIE_SAME_SITE=strict"
  printf '%s\n' "PULSE_TRUST_PROXY_HOPS=2"
  printf '%s\n' "PULSE_ALLOWED_ORIGINS=https://pulse.example.invalid"
  printf '%s\n' "PULSE_AUTH_RATE_LIMIT_ENABLED=true"
  printf '%s\n' "PULSE_LOGIN_WINDOW_SECONDS=900"
  printf '%s\n' "PULSE_LOGIN_ACCOUNT_MAX_ATTEMPTS=5"
  printf '%s\n' "PULSE_LOGIN_IP_MAX_ATTEMPTS=25"
  printf '%s\n' "PULSE_LOGIN_LOCKOUT_SECONDS=900"
  printf '%s\n' "PULSE_REQUIRE_CREDENTIAL_CONTAINMENT=true"
  printf '%s\n' "PULSE_MAINTENANCE_ACTOR_EMAIL=ci-operator@example.invalid"
  printf '%s\n' "PULSE_BOOTSTRAP_ADMIN_NAME=CI Administrator"
  printf '%s\n' "PULSE_BOOTSTRAP_ADMIN_EMAIL=ci-admin@example.invalid"
  printf '%s\n' "PULSE_BOOTSTRAP_ADMIN_PASSWORD_FILE=/tmp/pulse-ci-bootstrap-password"
  printf '%s\n' "PULSE_ADMIN_ROTATION_ID=ci-rotation-not-executed"
  printf '%s\n' "PULSE_CREDENTIAL_CONTAINMENT_FILE=/tmp/pulse-ci-containment.json"
  printf '%s\n' "PULSE_BACKUP_WORK_DIR=/tmp/pulse-ci-backup-work"
  printf '%s\n' "PULSE_RESTORE_WORK_DIR=/tmp/pulse-ci-restore-work"
  printf '%s\n' "PULSE_DEMO_ADMIN_PASSWORD=$demo_admin_password"
  printf '%s\n' "PULSE_DEMO_SALES_PASSWORD=$demo_sales_password"
  printf '%s\n' "PULSE_DEMO_PROJECT_MANAGER_PASSWORD=$demo_pm_password"
  printf '%s\n' "PULSE_DEMO_TECHNICIAN_PASSWORD=$demo_technician_password"
  printf '%s\n' "CLAMAV_HOST=clamav"
  printf '%s\n' "CLAMAV_PORT=3310"
  printf '%s\n' "CLAMAV_TIMEOUT_MS=180000"
  printf '%s\n' "DOCUMENT_TEMP_DIR=/tmp/pulse-uploads"
  printf '%s\n' "PULSE_AUDIT_RETENTION_DAYS=365"
  printf '%s\n' "PULSE_OPERATIONAL_RETENTION_DAYS=730"
} > "$output"

echo "Generated an ignored CI environment file with ephemeral secrets."
