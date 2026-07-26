FROM node:24-alpine AS workspace-deps

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci -w @pulse/contracts -w @pulse/api

FROM workspace-deps AS dev

ENV NODE_ENV=development

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
RUN npm run build -w @pulse/contracts

EXPOSE 3000
CMD ["npm", "run", "dev:api"]

FROM workspace-deps AS build

# Prisma generate validates URL syntax but does not connect during the build.
# This passwordless, unroutable URL is build metadata, never a runtime fallback.
ENV DATABASE_URL=postgresql://prisma-build@127.0.0.1:1/pulse?schema=pulse

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
RUN npm run build -w @pulse/contracts \
  && npm run build -w @pulse/api \
  && test -f /workspace/apps/api/dist/main.js

FROM workspace-deps AS maintenance

ENV NODE_ENV=production
ENV npm_config_update_notifier=false
ENV DATABASE_URL=postgresql://prisma-build@127.0.0.1:1/pulse?schema=pulse

COPY --chown=node:node packages/contracts ./packages/contracts
COPY --chown=node:node apps/api ./apps/api
RUN npm run build -w @pulse/contracts \
  && npm run prisma:generate -w @pulse/api

USER node
CMD ["npm", "run", "db:baseline:preview", "-w", "@pulse/api"]

FROM node:24-alpine AS production-deps

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --omit=dev -w @pulse/contracts -w @pulse/api

FROM node:24-alpine AS production

WORKDIR /workspace
ENV NODE_ENV=production

COPY --chown=node:node --from=production-deps /workspace/package.json ./package.json
COPY --chown=node:node --from=production-deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=production-deps /workspace/apps ./apps
COPY --chown=node:node --from=production-deps /workspace/packages ./packages
COPY --chown=node:node --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=build /workspace/packages/contracts/dist ./packages/contracts/dist

EXPOSE 3000
USER node
CMD ["npm", "run", "start", "-w", "@pulse/api"]
