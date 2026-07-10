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

ARG DATABASE_URL=postgresql://pulse:pulse@postgres:5432/pulse?schema=pulse
ENV DATABASE_URL=${DATABASE_URL}

COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
RUN npm run build -w @pulse/contracts \
  && npm run build -w @pulse/api

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

COPY --from=production-deps /workspace/package.json ./package.json
COPY --from=production-deps /workspace/node_modules ./node_modules
COPY --from=production-deps /workspace/apps ./apps
COPY --from=production-deps /workspace/packages ./packages
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/packages/contracts/dist ./packages/contracts/dist

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@pulse/api"]
