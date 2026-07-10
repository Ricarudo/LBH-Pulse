# Pulse

Pulse is LBH's internal operations platform for the workflow:

```text
Request → Quote Workspace → Proposal → Project
```

The application boundary is:

```text
Browser → Next.js → NestJS API → PostgreSQL / MinIO / ClamAV
```

Caddy provides the private HTTPS gateway in front of Next.js. NestJS is the
only database and backend owner; Next.js owns the browser experience and calls
the API. See [the architecture overview](docs/architecture/overview.md) for the
repository boundaries.

The active repository consists of:

- `apps/web`: Next.js UI and browser API clients
- `apps/api`: NestJS API, Prisma, migrations, seed data, and storage integrations
- `packages/contracts`: framework-independent API contracts and validation
- PostgreSQL: application data
- MinIO: document objects
- ClamAV: upload inspection
- Caddy: private HTTPS termination

Docker Compose is the supported runtime interface. The commands below work
with Docker Desktop on macOS and Windows and with Docker Engine plus Compose on
Linux.

## Network prerequisites

Configure the Pulse host in UniFi before distributing the URL:

1. Reserve `192.168.1.253` for the Pulse host.
2. Add a local DNS record mapping `pulse.lbh.app` to `192.168.1.253`.
3. Confirm Teleport clients receive the UniFi DNS server and can resolve that
   record.

DNS maps the hostname to the host. Caddy listens on standard ports 80 and 443,
so users do not enter port 4300.

## First installation

Only use the initialization command for a new, empty Pulse database:

```bash
docker compose --profile setup run --rm initialize
docker compose up -d --build --remove-orphans
```

Initialization is guarded. It refuses to seed a database that already contains
Pulse tables.

## Normal startup and recovery

Use the same reconciliation command after a reboot, source update, or container
failure:

```bash
docker compose up -d --build --remove-orphans
```

Useful operations:

```bash
docker compose ps
docker compose logs -f
docker compose logs -f web api gateway
docker compose down
```

Do not run `docker compose down -v` against Pulse. The `-v` option deletes
database, document, and certificate volumes.

The application services use `restart: unless-stopped`, so Docker restores them
after Docker Desktop or the host restarts.

## HTTPS and client certificate setup

Pulse is available at:

```text
https://pulse.lbh.app
https://192.168.1.253
```

Caddy terminates HTTPS on port 443. Do not append `:4300` for remote access;
that port is reserved for local diagnostics on the Pulse host.

Caddy issues certificates from a private Pulse certificate authority. Export
the current public root certificate after the gateway has started:

```bash
docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt ./pulse-local-ca.crt
```

The exported file is local-only and ignored by Git. Install it once on every
client that will access Pulse.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ./pulse-local-ca.crt
```

### Windows PowerShell as Administrator

```powershell
Import-Certificate `
  -FilePath .\pulse-local-ca.crt `
  -CertStoreLocation Cert:\LocalMachine\Root
```

### Debian or Ubuntu Linux

```bash
sudo cp ./pulse-local-ca.crt /usr/local/share/ca-certificates/pulse-local-ca.crt
sudo update-ca-certificates
```

Some browsers maintain a separate certificate store. Import
`pulse-local-ca.crt` into the browser's Authorities store if it still reports an
untrusted issuer.

The root CA private key remains in Caddy's Docker volume. Never copy, commit, or
distribute private key material. Only the public `root.crt` may be exported.

## Local diagnostic endpoints

The application and infrastructure ports are bound to localhost and are not
directly exposed to the LAN:

```text
Web:           http://localhost:4300
API health:    http://localhost:3000/api/health
PostgreSQL:    localhost:5432
MinIO API:     http://localhost:9000
MinIO console: http://localhost:9001
```

Remote users should always use the HTTPS hostname.

## Repository development

Use Node.js 24 or newer. Install the npm workspace once from the repository
root; do not install dependencies separately in each application:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Application-specific development and conventions are documented in the
[API README](apps/api/README.md) and [web README](apps/web/README.md).

## CI

CI runs in the isolated `lbh-pulse-ci` Compose project and cannot replace the
running Pulse services.

Run the same check used by GitHub Actions:

```bash
docker compose -f compose.ci.yaml up \
  --build --abort-on-container-exit --exit-code-from checks
docker compose -f compose.ci.yaml down -v --remove-orphans
```

The CI project uses ephemeral PostgreSQL storage, initializes the API schema,
runs workspace tests, type-checking, and builds, and verifies the production
images. Its `down -v` command is safe only because this is the isolated CI
Compose project.

## Database operations

Schema setup does not run during normal startup. NestJS is the only Prisma and
database owner:

```bash
docker compose exec api npm run db:setup
```

The demo reset deletes data and must be requested explicitly:

```bash
docker compose exec api npm run db:reset-demo
```

Never run the reset against data that must be retained. Database schema, seed,
and migration development conventions are documented in the API README.

## Configuration

The checked-in defaults serve `pulse.lbh.app` and `192.168.1.253`. Copy
`.env.example` to `.env` and update the documented values when the host,
credentials, or deployment secrets differ:

```bash
cp .env.example .env
```

Restart with the normal reconciliation command after changing configuration.
Do not commit `.env`.

## Production safety

- Replace development database, MinIO, and session credentials before using a
  deployment outside the trusted local environment.
- Keep PostgreSQL, MinIO, ClamAV, and diagnostic application ports bound to the
  host only; expose Pulse through Caddy.
- Back up PostgreSQL and MinIO volumes before schema or host maintenance.
- Never delete persistent volumes during ordinary recovery.
- Never distribute Caddy private keys or commit an exported local CA file.

## Troubleshooting

If the host responds to ping but Pulse does not open:

```bash
docker compose ps
docker compose logs --tail=100 gateway web api
curl -I http://localhost:4300
```

Expected state:

- `postgres`, `minio`, `clamav`, `api`, `web`, and `gateway` are healthy.
- Port 80 redirects to HTTPS.
- Port 443 serves a certificate for `pulse.lbh.app` and `192.168.1.253`.
- Port 4300 is reachable only from the Pulse host.

Use `docker compose up -d --build --remove-orphans` to reconcile the stack. A
plain `docker compose restart` does not rebuild images or correct changed
service definitions.
