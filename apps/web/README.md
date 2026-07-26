# Pulse Web

`@pulse/web` is the Next.js presentation layer for Pulse. It owns pages,
components, frontend state, browser API clients, form behavior, loading/error
states, and responsive presentation. NestJS owns authentication decisions,
validation at the trust boundary, business logic, persistence, and external
storage integrations.

The web application must not connect to PostgreSQL, install or generate Prisma,
or import backend services. Browser requests use the same-origin `/api/...`
surface, which Next.js proxies to NestJS. A Next.js route handler is appropriate
only for a genuine frontend-platform concern, not as an alternative backend.

## UI structure

- `src/app` contains App Router pages, layouts, and route-level loading UI.
- `src/modules` contains feature workspaces and their presentation behavior.
- `src/components` contains reusable UI components.
- `src/lib/api` contains the shared browser client and domain API clients.
- `@pulse/contracts` supplies request/response types, constants, and validation
  schemas shared with NestJS.

Keep server-owned rules out of components. Forms may validate early for user
feedback, but the API remains authoritative. Preserve accessible labels,
keyboard behavior, visible loading and error states, and mutation refresh
behavior when changing a feature.

## Local development

Use Node.js 24 or newer. From the repository root:

```bash
npm ci
npm run dev:web
```

The browser client expects NestJS at the configured `PULSE_API_URL`; run the API
or the full Compose stack when exercising data-backed features. The web process
does not need `DATABASE_URL`.

The complete supported stack starts with:

```bash
./scripts/development/create-env.sh
docker compose --env-file .env.development up -d --build
docker compose --env-file .env.development logs -f web gateway
```

Use the configured development hostname through Caddy. `http://localhost:4300`
is a host-only diagnostic endpoint. Production uses
`compose.production.yaml` and the root production runbook; it never runs
`next dev` or uses source bind mounts.

## API client conventions

- Use the shared client in `src/lib/api` rather than component-local fetch
  wrappers.
- Send authenticated same-origin requests with credentials and parse the common
  API error shape consistently.
- Type payloads and responses with `@pulse/contracts`; do not duplicate backend
  DTOs in the web package.
- Support JSON and `FormData` without manually setting an invalid multipart
  content type.
- Surface validation and request errors to the UI, handle cancellation where
  appropriate, and refresh affected state after successful mutations.

## Testing and responsive checks

Run web checks from the repository root:

```bash
npm run typecheck --workspace @pulse/web
npm test --workspace @pulse/web
npm run build --workspace @pulse/web
npm run responsive:check
```

Add focused tests for API-client success and error parsing, form validation,
loading/error states, and state refresh after mutations. Manually check relevant
features at mobile, tablet, desktop, and wide layouts. Follow the
[responsive design standard](../../docs/RESPONSIVE_DESIGN.md) for canonical
breakpoints and interaction sizing.
