# Pulse overview

Pulse is LBH's internal Request-to-Project operations platform.

## Runtime

```text
Caddy HTTPS gateway
        ↓
Next.js web application
        ↓
NestJS API
        ↓
PostgreSQL + MinIO + ClamAV
```

The default development runtime is defined by `compose.yaml`. Automated checks
use the independently named `compose.ci.yaml` project.

## Start

```bash
docker compose up -d --build --remove-orphans
```

Open `https://pulse.lbh.app`. See the root README for UniFi DNS and private CA
trust configuration.

## Application flow

```text
Request → Quote Workspace → Proposal → Project
```

The NestJS API owns the active service layer. Browser `/api/...` calls are
proxied by the web application to the API container.

Database initialization, schema changes, and demo resets are explicit
operations and never run as part of ordinary startup.
