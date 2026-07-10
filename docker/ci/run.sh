#!/bin/sh
set -eu

cd /workspace

npm run build -w @pulse/contracts
npm run db:initialize -w @pulse/api
node docker/ci/smoke.mjs
npm run typecheck
npm test
npm run build
