#!/bin/sh
set -eu
case "${1:-}" in
  serve) exec flock -n /state/server.lock node /opt/pulse/src/main.mts "$@" ;;
  worker) exec flock -w 600 /state/operation.lock node /opt/pulse/src/main.mts "$@" ;;
  status-server|ping|status-ping|doctor) exec node /opt/pulse/src/main.mts "$@" ;;
  *) exec flock -n /state/operation.lock node /opt/pulse/src/main.mts "$@" ;;
esac
