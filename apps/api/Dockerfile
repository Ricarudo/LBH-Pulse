FROM node:24-alpine AS base

WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
EXPOSE 3000

FROM base AS dev
ENV NODE_ENV=development
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS production
ENV NODE_ENV=production
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
RUN npm run build
CMD ["npm", "run", "start"]
