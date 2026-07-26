#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MinIO root user is required}"
: "${MINIO_ROOT_PASSWORD:?MinIO root password is required}"
: "${S3_ACCESS_KEY:?MinIO application user is required}"
: "${S3_SECRET_KEY:?MinIO application secret is required}"
: "${S3_BUCKET:?MinIO bucket is required}"

if [ "$MINIO_ROOT_USER" = "$S3_ACCESS_KEY" ]; then
  echo "MinIO application identity must differ from the root identity." >&2
  exit 1
fi
case "$S3_BUCKET" in
  ""|*[!a-z0-9.-]*|.*|*.) echo "MinIO bucket name is invalid." >&2; exit 1 ;;
esac

mc alias set pulse http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "pulse/$S3_BUCKET"
mc anonymous set none "pulse/$S3_BUCKET"
{
  printf '%s\n' '{'
  printf '%s\n' '  "Version": "2012-10-17",'
  printf '%s\n' '  "Statement": ['
  printf '%s\n' '    {'
  printf '%s\n' '      "Effect": "Allow",'
  printf '%s\n' '      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],'
  printf '%s\n' "      \"Resource\": [\"arn:aws:s3:::$S3_BUCKET\"]"
  printf '%s\n' '    },'
  printf '%s\n' '    {'
  printf '%s\n' '      "Effect": "Allow",'
  printf '%s\n' '      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],'
  printf '%s\n' "      \"Resource\": [\"arn:aws:s3:::$S3_BUCKET/*\"]"
  printf '%s\n' '    }'
  printf '%s\n' '  ]'
  printf '%s\n' '}'
} > /tmp/pulse-app-policy.json
mc admin policy create pulse pulse-application /tmp/pulse-app-policy.json >/dev/null 2>&1 || \
  mc admin policy info pulse pulse-application >/dev/null
if ! mc admin user info pulse "$S3_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user add pulse "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
fi
mc admin user enable pulse "$S3_ACCESS_KEY" >/dev/null
mc admin policy attach pulse pulse-application --user "$S3_ACCESS_KEY" >/dev/null
echo "Pulse MinIO bucket and restricted application policy are ready."
