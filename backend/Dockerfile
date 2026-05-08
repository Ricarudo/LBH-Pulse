FROM node:18-alpine AS base

WORKDIR /backend
COPY ["package.json","package-lock.json" ,"npm-shrinkwrap.json*","./"]
EXPOSE 3000

FROM base AS production
ENV HOST="localhost"
ENV NODE_ENV=production
ENV PORT=3000
RUN npm ci --omit=dev
COPY . /backend
CMD ["npm", "start"]


FROM base AS dev
ENV NODE_ENV=development
ENV HOST="localhost"
ENV PORT=3000
RUN npm ci
COPY . /backend
CMD ["npm", "start"]
