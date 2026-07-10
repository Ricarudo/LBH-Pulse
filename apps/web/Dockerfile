FROM node:24-alpine AS workspace-deps

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

FROM node:24-alpine AS production-deps

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --omit=dev -w @pulse/contracts -w @pulse/web

FROM node:24-alpine AS production

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PULSE_API_URL=http://api:3000

COPY --from=production-deps /workspace/package.json ./package.json
COPY --from=production-deps /workspace/node_modules ./node_modules
COPY --from=production-deps /workspace/apps ./apps
COPY --from=production-deps /workspace/packages ./packages
COPY --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --from=build /workspace/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=build /workspace/apps/web/public ./apps/web/public
COPY --from=build /workspace/packages/contracts/dist ./packages/contracts/dist

EXPOSE 4300
CMD ["npm", "run", "start", "-w", "@pulse/web"]
