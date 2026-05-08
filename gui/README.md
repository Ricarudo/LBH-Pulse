# KuoteSuite Frontend

This is the Angular 12 frontend for KuoteSuite.

## Development

```bash
npm ci
npm start
```

Default URL:

```text
http://localhost:4200
```

## Build

```bash
npm run build
```

## Local Login

The frontend now uses a simple local development login through `src/app/_services/auth.service.ts`.

Built-in users:

- Admin
- Sales
- Project Manager
- Technician

This is only for local development. It is not production authentication.

## API Endpoint

The frontend API base URL is configured in:

```text
src/environments/environment.ts
src/environments/environment.prod.ts
```

Default:

```text
http://localhost:3000
```

## Future Azure/Entra Login

Azure/Entra login should be reintroduced through the local `AuthService` abstraction instead of importing provider SDKs directly into route components. Backend JWT validation must be added before using this app on a company network.
