#!/bin/sh
set -eu

cd /workspace

npm run build -w @pulse/contracts
node docker/ci/smoke.mjs
npm run typecheck
npm test
npm run build
