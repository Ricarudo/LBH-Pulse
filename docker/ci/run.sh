#!/bin/sh
set -eu

cd /workspace

npm run build -w @pulse/contracts
if NODE_ENV=production npx tsx apps/api/prisma/assert-demo-reset.ts >/dev/null 2>&1; then
  echo "Production demo-reset guard failed." >&2
  exit 1
fi
echo "Production demo-reset guard passed."
node docker/ci/smoke.mjs
npm run verify:data-integrity -w @pulse/api
npm run data:audit -w @pulse/api
npm run lifecycle:audit -w @pulse/api
npm run data:known-anomalies:preview -w @pulse/api
npm run compatibility:checklists:preview -w @pulse/api
npm run typecheck
npm test
npm run responsive:check
npm run build
