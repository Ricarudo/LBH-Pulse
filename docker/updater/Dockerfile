ARG NODE_BASE_IMAGE=node:24-alpine
ARG DOCKER_CLI_IMAGE=docker:29.3.0-cli
FROM ${NODE_BASE_IMAGE} AS node
FROM ${DOCKER_CLI_IMAGE}
RUN apk add --no-cache age flock libstdc++
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /opt/pulse
COPY services/updater/src ./src
COPY services/updater/trusted-keys.json ./trusted-keys.json
COPY docker/updater/entrypoint.sh /usr/local/bin/pulse
RUN chmod 755 /usr/local/bin/pulse
ENTRYPOINT ["/usr/local/bin/pulse"]
CMD ["serve"]
