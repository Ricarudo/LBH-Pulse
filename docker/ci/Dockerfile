FROM node:24-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci

COPY packages ./packages
COPY apps ./apps
COPY docker/ci/smoke.mjs ./docker/ci/smoke.mjs
COPY docker/ci/run.sh /usr/local/bin/pulse-ci
RUN chmod +x /usr/local/bin/pulse-ci

CMD ["pulse-ci"]
