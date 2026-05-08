# Set-Up
---
> define a .env file in the backend root directory
---

## Required Env. Variables
---
- `PORT`
- `FRONTEND`
- `MYSQL_HOST`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_PORT`
- `DATABASE_URL` for Prisma/PostgreSQL migration work

Local development login is currently handled by the Angular frontend. Azure/Entra settings are no longer required for backend startup.
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
-- Data Repositories that are the buckets where all the data from the SQL databases resides, is accessed and modified from.
