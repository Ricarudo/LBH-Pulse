ARG NODE_BASE_IMAGE=node:24-alpine
FROM ${NODE_BASE_IMAGE} AS workspace-deps

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci -w @pulse/contracts -w @pulse/web

FROM workspace-deps AS dev

ENV NODE_ENV=development

COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN npm run build -w @pulse/contracts

EXPOSE 4300
CMD ["npm", "run", "dev:web"]

FROM workspace-deps AS build

ARG PULSE_API_URL=http://api:3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PULSE_API_URL=${PULSE_API_URL}

COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN npm run build -w @pulse/contracts \
  && npm run build -w @pulse/web

FROM ${NODE_BASE_IMAGE} AS production-deps

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --omit=dev -w @pulse/contracts -w @pulse/web

FROM ${NODE_BASE_IMAGE} AS production

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PULSE_API_URL=http://api:3000

COPY --chown=node:node --from=production-deps /workspace/package.json ./package.json
COPY --chown=node:node --from=production-deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=production-deps /workspace/apps ./apps
COPY --chown=node:node --from=production-deps /workspace/packages ./packages
COPY --chown=node:node --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --chown=node:node --from=build /workspace/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --chown=node:node --from=build /workspace/apps/web/public ./apps/web/public
COPY --chown=node:node --from=build /workspace/packages/contracts/dist ./packages/contracts/dist

EXPOSE 4300
USER node
CMD ["npm", "run", "start", "-w", "@pulse/web"]
