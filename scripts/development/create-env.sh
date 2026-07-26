#!/bin/sh
set -eu

target=${1:-.env.development}
if [ -e "$target" ]; then
  echo "Refusing to overwrite $target" >&2
  exit 1
fi

umask 077
db_password=$(openssl rand -hex 24)
minio_root_password=$(openssl rand -hex 24)
minio_app_password=$(openssl rand -hex 24)
session_secret=$(openssl rand -base64 48 | tr -d '\n')
security_pepper=$(openssl rand -base64 48 | tr -d '\n')
demo_admin_password=$(openssl rand -base64 24 | tr -d '\n')
demo_sales_password=$(openssl rand -base64 24 | tr -d '\n')
demo_project_manager_password=$(openssl rand -base64 24 | tr -d '\n')
demo_technician_password=$(openssl rand -base64 24 | tr -d '\n')

{
  echo "PULSE_DEV_DB_USER=pulse_dev"
  echo "PULSE_DEV_DB_PASSWORD=$db_password"
  echo "PULSE_SESSION_SECRET=$session_secret"
  echo "PULSE_SECURITY_PEPPER=$security_pepper"
  echo "PULSE_ENABLE_DEMO_SEED=1"
  echo "PULSE_ALLOW_DESTRUCTIVE_SEED=1"
  echo "PULSE_DEMO_ADMIN_PASSWORD=$demo_admin_password"
  echo "PULSE_DEMO_SALES_PASSWORD=$demo_sales_password"
  echo "PULSE_DEMO_PROJECT_MANAGER_PASSWORD=$demo_project_manager_password"
  echo "PULSE_DEMO_TECHNICIAN_PASSWORD=$demo_technician_password"
  echo "MINIO_ROOT_USER=pulse_dev_root"
  echo "MINIO_ROOT_PASSWORD=$minio_root_password"
  echo "S3_ACCESS_KEY=pulse_dev_app"
  echo "S3_SECRET_KEY=$minio_app_password"
  echo "PULSE_HOSTNAME=pulse.localhost"
  echo "PULSE_LAN_IP=127.0.0.1"
} > "$target"

chmod 600 "$target"
echo "Created $target with mode 600. Values were not printed."
echo "The generated demo accounts are non-production and their passwords remain only in that ignored file."
