# Pulse architecture

## Runtime topology

The application boundary is:

```text
Browser → Next.js → NestJS API → PostgreSQL / MinIO / ClamAV
```

Caddy sits in front of Next.js as the private HTTPS gateway:

```text
Browser
   │ HTTPS
   ▼
Caddy
   ▼
Next.js web application
   │ /api requests
   ▼
NestJS API
   ├── PostgreSQL through Prisma
   ├── MinIO document storage
   └── ClamAV upload inspection
```

Docker Compose defines the supported runtime and the isolated CI topology. See
the root README for startup, DNS, certificate, recovery, and safety operations.

## Ownership boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| `apps/web` | Pages, components, frontend state, browser API clients, presentation logic | Prisma, PostgreSQL access, backend services, storage credentials, authoritative business rules |
| `apps/api` | NestJS controllers and services, authorization, validation, business rules, transactions, Prisma, PostgreSQL, MinIO, ClamAV | React components or browser-only state |
| `packages/contracts` | API payload types, constants, enums, and framework-independent Zod schemas | Prisma-generated types, React/NestJS code, storage clients, transactions |
| `apps/api/prisma` | The only Prisma schema, generated-client source, migration history, constraints, and seed implementation | Frontend code or a second application-owned schema |

Dependencies flow inward through contracts: the web and API may both import
`@pulse/contracts`, but contracts must not import either application. The web
must not import API implementation files, and the API must not import web files.

## Request and data flow

1. The browser renders the Next.js application and sends authenticated requests
   to the same-origin `/api/...` surface.
2. Next.js proxies API traffic to NestJS. It does not query PostgreSQL or
   implement a shadow backend.
3. NestJS authenticates and authorizes the caller, validates the payload, and
   applies business rules.
4. API services use Prisma transactions for related database changes and own
   calls to MinIO and ClamAV.
5. NestJS returns a shared, typed response shape for the web client to present.

Document uploads are inspected by ClamAV before accepted objects are stored in
MinIO. PostgreSQL stores application records and document metadata; MinIO stores
the document bytes.

## Boundary rules

- New database models, migrations, constraints, and seeds belong only in
  `apps/api/prisma`.
- New backend behavior starts with a NestJS endpoint and shared contract, then a
  browser client; it does not start with a Next.js database route.
- Controllers remain transport adapters. Services own calculations,
  authorization-sensitive orchestration, and transactions.
- External input is validated at the API boundary even when the web form also
  validates for immediate feedback.
- Public API shapes remain stable where possible. Breaking changes are explicit
  and coordinated across contracts, API, and web.
- Active behavior is removed only after its NestJS replacement has focused
  tests and the web consumer has migrated successfully.

## Security boundary

Caddy's certificate-authority private key stays in its persistent Docker volume.
Administrators may export only the current public `root.crt` as described in the
root README. Database credentials, session secrets, MinIO credentials, and
ClamAV connectivity remain server-side and are never exposed to browser code.
