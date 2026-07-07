# Pulse API

The Pulse API is a NestJS service backed by PostgreSQL and Prisma.

The supported runtime is the repository-level Docker Compose stack:

```bash
docker compose up -d --build --remove-orphans
docker compose logs -f api
```

Direct local health endpoint:

```text
http://localhost:3000/api/health
```

Development outside Docker requires Node.js 24 and:

```bash
npm ci
DATABASE_URL="postgresql://pulse:pulse_dev_password@localhost:5432/pulse?schema=pulse" npm run dev
```

Checks:

```bash
npm run typecheck
npm test
npm run build
```

Database initialization and destructive demo reset are intentionally separate
from normal startup. See the root README before running either operation.
