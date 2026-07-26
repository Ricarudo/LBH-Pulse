ARG MINIO_MC_IMAGE=minio/mc:RELEASE.2025-04-16T18-13-26Z
FROM ${MINIO_MC_IMAGE}

ENV MC_CONFIG_DIR=/tmp/.mc

COPY docker/minio/pulse-app-policy.json /opt/pulse/pulse-app-policy.json
COPY docker/minio/provision.sh /usr/local/bin/pulse-minio-provision
ENTRYPOINT ["/usr/local/bin/pulse-minio-provision"]
