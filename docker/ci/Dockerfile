FROM node:24-alpine

WORKDIR /workspace

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN cd apps/api && npm ci

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN cd apps/web && npm ci

COPY apps ./apps
COPY docker/ci/run.sh /usr/local/bin/pulse-ci
RUN chmod +x /usr/local/bin/pulse-ci

CMD ["pulse-ci"]
