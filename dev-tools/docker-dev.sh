#! /bin/bash
CONTAINER = 3000
HOST = 3000

MYSQL_ROOT_PASSWORD="Blah"
export $MYSQL_ROOT_PASSWORD

# docker run -dp HOST:CONTAINER \
#      -w /app -v "$(pwd):/app" \
#      node:12-alpine \
#      sh -c "yarn install && yarn run dev" || echo "Error running Docker Container!"
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
docker-compose up -d

docker-compose -f docker-compose.dev.yml up #para correr los containers

#run data base backup
# docker-compose -f docker-compose.yml -f docker-compose.admin.yml \ run dbadmin db-backup