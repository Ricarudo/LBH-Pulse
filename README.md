# Pulse

Pulse is LBH's internal operations platform for the workflow:

```text
Request → Quote Workspace → Proposal → Project
```

The active application consists of:

- `apps/web`: Next.js web application
- `apps/api`: NestJS API
- PostgreSQL: application database
- MinIO: document storage
- ClamAV: upload inspection
- Caddy: private HTTPS gateway

Docker Compose is the only supported runtime interface. The commands below work
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

## HTTPS setup

Pulse is available at:

```text
https://pulse.lbh.app
https://192.168.1.253
```

Caddy terminates HTTPS on port 443. Do not append `:4300` for remote access;
that port is reserved for local diagnostics on the Pulse host.

Caddy issues certificates from a private Pulse certificate authority. Export
the public root certificate after the gateway has started:

```bash
docker compose cp gateway:/data/caddy/pki/authorities/local/root.crt ./pulse-local-ca.crt
```

Install that certificate once on every client that will access Pulse.

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

The root CA private key remains in the Docker volume. Do not copy or distribute
anything from that volume except `root.crt`.

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

## CI

CI runs in the isolated `lbh-pulse-ci` Compose project and cannot replace the
running Pulse services.

Run the same check used by GitHub Actions:

```bash
docker compose -f compose.ci.yaml up \
  --build --abort-on-container-exit --exit-code-from checks
docker compose -f compose.ci.yaml down -v --remove-orphans
```

The check uses an ephemeral database and runs API initialization, tests,
type-checking and builds, followed by the web tests, type-checking and build.

## Database operations

Schema setup does not run during normal startup.

```bash
docker compose exec api npm run db:setup
```

The demo reset deletes data and must be requested explicitly:

```bash
docker compose exec api npm run db:reset-demo
```

Never run the reset against data that must be retained.

## Configuration

The checked-in defaults serve `pulse.lbh.app` and `192.168.1.253`. To change
them, copy `.env.example` to `.env` and update:

```text
PULSE_HOSTNAME
PULSE_LAN_IP
```

Restart with the normal reconciliation command after changing either value.

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

Use `docker compose up -d --build --remove-orphans` to reconcile the stack.
A plain `docker compose restart` does not rebuild images or correct changed
service definitions.
