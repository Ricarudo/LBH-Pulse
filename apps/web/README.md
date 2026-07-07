# Pulse Web

The Pulse web application uses Next.js and is served through the repository's
Caddy HTTPS gateway.

Start the complete stack from the repository root:

```bash
docker compose up -d --build --remove-orphans
docker compose logs -f web gateway
```

Primary URL:

```text
https://pulse.lbh.app
```

Direct host-only diagnostic URL:

```text
http://localhost:4300
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
