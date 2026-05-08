CONTAINER = 3000
HOST = 3000

docker run -dp $(HOST):$(CONTAINER) `
     -w /app -v "$(pwd):/app" `
     node:12-alpine `
     sh -c "yarn install && yarn run dev"

docker-compose -f docker-compose.dev.yml up --build