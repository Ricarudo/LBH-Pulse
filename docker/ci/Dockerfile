FROM node:24-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci

COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY docs/releases ./docs/releases
# Prisma validates URL syntax but does not connect while generating the checks image.
RUN DATABASE_URL=postgresql://prisma-build@127.0.0.1:1/pulse?schema=pulse npm run prisma:generate -w @pulse/api
COPY docker/ci/smoke.mjs ./docker/ci/smoke.mjs
COPY docker/ci/run.sh /usr/local/bin/pulse-ci
COPY docker/ci/initialize.sh /usr/local/bin/pulse-ci-initialize
RUN chmod +x /usr/local/bin/pulse-ci /usr/local/bin/pulse-ci-initialize

CMD ["pulse-ci"]
