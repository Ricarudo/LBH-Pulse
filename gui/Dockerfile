FROM node:18-alpine AS base

WORKDIR /gui
COPY ["package.json","package-lock.json" ,"npm-shrinkwrap.json*","./"]
EXPOSE 4200

FROM base AS production
ENV NODE_ENV=production
RUN npm ci
COPY . /gui
RUN npm run build


FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
COPY . /gui
CMD ["npm", "start"]
