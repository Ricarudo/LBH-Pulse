ARG CADDY_BASE_IMAGE=caddy:2.11.4-alpine
FROM ${CADDY_BASE_IMAGE} AS internal
COPY docker/caddy/Caddyfile.internal /etc/caddy/Caddyfile

FROM ${CADDY_BASE_IMAGE} AS public
COPY docker/caddy/Caddyfile.public /etc/caddy/Caddyfile
