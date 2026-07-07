#!/bin/sh
set -eu

cd /workspace/apps/api
npm run db:initialize
npm test
npm run build

cd /workspace/apps/web
npm run typecheck
npm test
npm run build
