ARG ALPINE_BASE_IMAGE=alpine:3.22.1
FROM ${ALPINE_BASE_IMAGE}

RUN apk add --no-cache age

WORKDIR /work
ENTRYPOINT ["age"]
