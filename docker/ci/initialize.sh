#!/bin/sh
set -eu

cd /workspace

npm run build -w @pulse/contracts
npm run db:roles:apply -w @pulse/api

DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:migrate:deploy -w @pulse/api
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:migrate:status -w @pulse/api
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:reference-data:apply -w @pulse/api
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:seed:apply -w @pulse/api
DATABASE_URL=$PULSE_DATABASE_APP_URL npm run db:roles:verify -w @pulse/api
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run auth:first-run:verify-ci -w @pulse/api

# Exercise both supported migration paths in disposable CI databases: a clean
# migrate deploy above, and adoption of a representative pre-baseline schema.
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:baseline:verify-ci -w @pulse/api -- --apply

# Prove the exact released 0.1.0 migration ledger upgrades through every
# current migration while preserving the source records and collaborator data.
DATABASE_URL=$PULSE_DATABASE_MIGRATION_URL npm run db:release-upgrade:verify-ci -w @pulse/api

touch /tmp/pulse-initialized
tail -f /dev/null
