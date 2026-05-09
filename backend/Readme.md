# Set-Up
---
> define a .env file in the backend root directory
---

## Required Env. Variables
---
- `PORT`
- `FRONTEND`
- `DATABASE_URL`

Local development login is currently handled by the Angular frontend. Azure/Entra settings are no longer required for backend startup.
The backend uses Prisma with PostgreSQL for application data.
---

## Running Unit Test
---
### To Run Individually:
> working_dir: /backend#
run: ```node_modules/mocha/bin/mocha  test/unit/repositories/item.repo.spec.js```

### To Run all tests:
> working_dir: /backend#
run: ```npm test ```
---

## Architecture
---
- Controllers
-- REST Endpoints that receive all API calls from Frontend containers.
- Services
-- Intermediaries that relay, cleanse and validate received Requests from Controllers before sending them to Repositories.
- Repositories
-- Data Repositories that are the buckets where application data resides, is accessed and modified from.
