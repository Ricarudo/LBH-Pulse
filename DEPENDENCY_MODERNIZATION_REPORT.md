# Dependency Modernization Report

Date: 2026-05-08

## 1. Executive Summary

This phase modernized KuoteSuite conservatively while preserving the existing Angular frontend, Express backend, and MySQL database architecture.

Modernized:

- Backend dependencies were updated within mostly non-breaking CommonJS/Express 4-compatible major versions.
- Frontend Angular packages were stabilized on the latest Angular 12.2 patch line.
- Angular Material/CDK were made compatible with Angular 12 by aligning both to 12.2.13.
- MSAL browser/angular packages were updated within the Angular 12-compatible MSAL v2 line.
- Missing frontend PDF dependencies used by existing code were added.
- Unused direct dependencies were removed where usage checks were clear.
- npm lockfiles were regenerated to lockfile version 3.
- Docker Node base images were moved from Node 14 Alpine to Node 18 Alpine and switched to `npm ci`.
- The backend now reads database settings from environment variables.
- The backend no longer crashes when MSAL secrets are missing; auth endpoints return a 503 until configured.
- Frontend builds were made compatible with modern Node/OpenSSL via `cross-env NODE_OPTIONS=--openssl-legacy-provider`.

Left unchanged intentionally:

- Angular was not upgraded beyond v12 because a multi-major Angular migration would be high-risk and should be handled incrementally.
- Express was not upgraded to v5 because existing route/error behavior should be audited first.
- The database engine remains MySQL.
- The backend remains CommonJS.
- Deprecated `jade`, old `faker`, and legacy chart/PDF packages remain until a focused cleanup phase.

Current verification result:

- Backend install: passes.
- Backend start: starts and stays running, but logs database connection errors if MySQL is not running.
- Backend tests: pass when the Docker MySQL service is running.
- Frontend install: passes.
- Frontend build: passes with CommonJS optimization warnings.
- Frontend start: compiles and serves on `http://localhost:4200`.
- Docker Compose dev build: passes.

## 2. Backend Dependency Changes

| Package | Previous | New | Reason | Breaking-change notes |
|---|---:|---:|---|---|
| `@azure/msal-node` | `^1.3.2` | `^1.18.4` | Latest MSAL Node v1 line from existing architecture. | Did not move to v5 because that is a multi-major auth migration. Local Node 24 shows an engine warning; Node 18 avoids it. |
| `cookie-parser` | `~1.4.4` | `^1.4.7` | Patch/security maintenance. | No route changes required. |
| `cors` | `^2.8.5` | `^2.8.6` | Patch maintenance. | No route changes required. |
| `debug` | `~2.6.9` | `^4.4.3` | Current debug major used broadly by Express tooling. | No code changes required. |
| `dotenv` | `^10.0.0` | `^17.4.2` | Modern env loading and maintenance. | Logs changed slightly; app behavior preserved. |
| `express` | `~4.16.1` | `^4.22.1` | Latest Express 4 line without taking Express 5 breaking changes. | Express 5 deferred. |
| `express-validator` | `^6.13.0` | `^6.15.0` | Latest v6 line to avoid v7 migration risk. | v7 deferred. |
| `http-errors` | `~1.6.3` | `^2.0.1` | Modern error helper line compatible with Express 4 usage. | No code changes required. |
| `morgan` | `~1.9.1` | `^1.10.1` | Patch/minor maintenance. | No code changes required. |
| `mysql` | `^2.16.0` | `^2.18.1` | Latest existing `mysql` package line. | Did not migrate to `mysql2` in this phase. |
| `chai` | `^4.3.4` | `^4.5.0` | Latest Chai v4 for CommonJS tests. | Chai v5/v6 deferred because of breaking/ESM risk. Moved to `devDependencies`. |
| `chai-http` | `^4.3.0` | `^4.4.0` | Latest v4 for existing CommonJS tests. | v5 deferred. Moved to `devDependencies`. |
| `mocha` | `^9.1.3` | `^10.8.2` | Safer modern test runner without jumping to latest major. | v11 deferred. Moved to `devDependencies`. |
| `sinon` | `^11.1.2` | `^15.2.0` | Moderate test dependency modernization. | Newer majors deferred. Moved to `devDependencies`. |
| `nodemon` | not listed | `^3.1.11` | `npm run debug` used `nodemon` but it was missing. | Debug script now runs `nodemon ./bin/www`. |
| `faker` | `^5.5.3` | `^5.5.3` | Kept for existing test mocks. | Still deprecated; migration to `@faker-js/faker` deferred. Moved to `devDependencies`. |
| `jade` | `^0.31.2` | `^0.31.2` | Kept to avoid view engine/file migration. | Deprecated; migrate to `pug` or remove server views later. |

## 3. Frontend Dependency Changes

| Package | Previous | New | Reason | Breaking-change notes |
|---|---:|---:|---|---|
| `@angular/animations` | `~12.2.0` | `~12.2.17` | Latest Angular 12 patch. | Angular major upgrade deferred. |
| `@angular/common` | `^12.2.6` | `~12.2.17` | Latest Angular 12 patch and tighter range. | Angular major upgrade deferred. |
| `@angular/compiler` | `~12.2.0` | `~12.2.17` | Latest Angular 12 patch. | Angular major upgrade deferred. |
| `@angular/core` | `^12.2.6` | `~12.2.17` | Latest Angular 12 patch and tighter range. | Angular major upgrade deferred. |
| `@angular/forms` | `^12.2.6` | `~12.2.17` | Latest Angular 12 patch and tighter range. | Angular major upgrade deferred. |
| `@angular/platform-browser` | `~12.2.0` | `~12.2.17` | Latest Angular 12 patch. | Angular major upgrade deferred. |
| `@angular/platform-browser-dynamic` | `~12.2.0` | `~12.2.17` | Latest Angular 12 patch. | Angular major upgrade deferred. |
| `@angular/router` | `~12.2.0` | `~12.2.17` | Latest Angular 12 patch. | Angular major upgrade deferred. |
| `@angular/cdk` | `^12.2.12` | `12.2.13` | Match Angular Material 12 peer requirements. | Pinned to avoid accidental Angular 13+ mismatch. |
| `@angular/material` | `^13.0.0` | `12.2.13` | Fix Angular 12/Material 13 incompatibility. | This is a compatibility downgrade from the previous package range. |
| `@angular/cli` | `^12.2.6` | `~12.2.18` | Latest Angular CLI 12 patch. | Moved to `devDependencies`. |
| `@angular-devkit/build-angular` | `~12.2.2` | `~12.2.18` | Latest Angular build tooling for v12. | Angular build system major upgrade deferred. |
| `@angular/compiler-cli` | `~12.2.0` | `~12.2.17` | Align with Angular compiler/core version. | TypeScript stays at 4.3.5. |
| `@azure/msal-angular` | `^2.0.5` | `^2.5.13` | Latest MSAL Angular v2 line compatible with Angular 12. | MSAL v5 deferred. |
| `@azure/msal-browser` | `^2.19.0` | `^2.39.0` | Required by latest MSAL Angular v2 peer dependency. | MSAL v5 deferred. |
| `rxjs` | `~6.6.0` | `~6.6.7` | Latest RxJS 6 patch. | RxJS 7 deferred for Angular migration. |
| `zone.js` | `~0.11.4` | `~0.11.8` | Latest compatible 0.11 patch. | Latest Zone requires newer Angular. |
| `tslib` | `^2.3.0` | `^2.8.1` | Safe runtime helper update. | No code changes required. |
| `typescript` | `~4.3.5` | `~4.3.5` | Kept at Angular 12-compatible version. | Newer TypeScript versions are not compatible with Angular 12. |
| `@types/node` | `^12.20.37` | `^14.18.63` | Better Node type baseline for modernized scripts/tooling. | Did not jump to latest Node types. |
| `@types/jasmine` | `~3.8.0` | `~3.10.3` | Test type patch/minor update. | Latest Jasmine types deferred. |
| `jasmine-core` | `~3.8.0` | `~3.10.1` | Test tooling patch/minor update. | Latest Jasmine deferred. |
| `karma` | `~6.3.0` | `~6.4.4` | Latest Karma 6 line. | Major alternatives deferred. |
| `karma-chrome-launcher` | `~3.1.0` | `~3.2.0` | Patch/minor test tooling update. | No code changes required. |
| `karma-coverage` | `~2.0.3` | `~2.2.1` | Patch/minor test tooling update. | No code changes required. |
| `karma-jasmine` | `~4.0.0` | `~4.0.2` | Patch update. | v5 deferred. |
| `@types/file-saver` | `^2.0.4` | `^2.0.7` | Type patch update. | Moved to `devDependencies`. |
| `cross-env` | not listed | `^7.0.3` | Cross-platform `NODE_OPTIONS` support for Angular 12/Webpack on modern Node. | v10 deferred to avoid Node compatibility churn. |
| `jspdf` | missing from `gui/package.json` | `^2.5.2` | Existing lead/quote pages import it. | Latest v4 deferred. |
| `html2canvas` | missing from `gui/package.json` | `^1.4.1` | Existing lead/quote pages import it. | No code changes required. |

## 4. Packages Intentionally Not Upgraded

| Package | Current | Latest/Target | Reason not upgraded |
|---|---:|---:|---|
| Angular framework packages | 12.2.x | 21.x | Multi-major migration would require Angular update steps, TypeScript/RxJS changes, template fixes, and likely UI/test refactors. |
| Angular Material/CDK | 12.2.13 | 21.x | Must stay aligned with Angular 12 until Angular itself is migrated. |
| `@azure/msal-angular` / `@azure/msal-browser` | 2.x | 5.x | Auth API/config changes should be handled during a security/auth phase, not mixed into dependency stabilization. |
| `@azure/msal-node` | 1.18.4 | 5.2.0 | Backend auth is incomplete; major upgrade should happen alongside real token validation middleware. |
| `express` | 4.22.1 | 5.2.1 | Express 5 changes routing/error behavior and should be tested route-by-route. |
| `express-validator` | 6.15.0 | 7.3.2 | v7 may require validation API cleanup; deferred until endpoint hardening. |
| `rxjs` | 6.6.7 | 7.8.2 | Angular 12 supports RxJS 6 well; move to RxJS 7 during Angular migration. |
| `typescript` | 4.3.5 | 6.0.3 | Angular 12 compiler requires the 4.2/4.3 era. |
| `zone.js` | 0.11.8 | 0.16.2 | Latest Zone targets newer Angular. |
| `chai` | 4.5.0 | 6.2.2 | Newer Chai majors risk ESM/CommonJS test breakage. |
| `chai-http` | 4.4.0 | 5.1.2 | Newer major deferred for test migration. |
| `mocha` | 10.8.2 | 11.7.5 | v10 is already a safe modernization; latest major can be a later test-only pass. |
| `sinon` | 15.2.0 | 22.0.0 | Higher majors deferred because tests are not the main application blocker. |
| `faker` | 5.5.3 | `@faker-js/faker` | Existing mocks use old CommonJS `faker`; migration requires test mock edits. |
| `jade` | 0.31.2 | `pug` | Requires view engine/file migration or removing server-rendered views. |
| `ngx-filesaver` | 12.0.0 | 21.0.0 | Major versions track newer Angular. |
| `angular2-chartjs` | 0.5.1 | 0.5.1 | No newer package line; should eventually be replaced. |

## 5. Removed Packages

| Package | Why removed | Confirmation |
|---|---|---|
| `body-parser` direct dependency | Express already provides `express.json()` and `express.urlencoded()`. The app did not import `body-parser` directly. | `rg body-parser backend -g '!node_modules'` found only package metadata. |
| `angular-file-saver` | Not imported by the Angular source. | `rg angular-file-saver gui -g '!node_modules'` found only package metadata. |
| `material-components-web` | Not imported by the Angular source; Angular Material package is used instead. | `rg material-components-web gui -g '!node_modules'` found only package metadata. |

## 6. Compatibility Notes

- Angular compatibility: stabilized at Angular 12.2.17 with Angular CLI 12.2.18.
- Angular Material/CDK compatibility: both pinned to 12.2.13 to avoid the previous Angular 12 / Material 13 mismatch.
- TypeScript compatibility: kept at 4.3.5 because Angular 12 does not support modern TypeScript.
- RxJS compatibility: kept at 6.6.7 for Angular 12.
- MSAL compatibility: frontend updated to latest MSAL v2 packages; backend kept on MSAL Node v1.18.4. Major MSAL upgrades are deferred.
- Node.js compatibility: Docker now uses Node 18 Alpine. Local Node 24 can run/build with the OpenSSL compatibility flag, but `@azure/msal-node@1.18.4` warns that it supports Node 10/12/14/16/18.
- MySQL compatibility: database remains MySQL 8; backend still uses the `mysql` package at 2.18.1. A future move to `mysql2` should be paired with DB-layer cleanup.
- Lockfiles: `backend/package-lock.json` and `gui/package-lock.json` are now npm lockfile version 3.

## 7. Build and Test Results

| Check | Result | Notes |
|---|---|---|
| Backend install | Passed | `npm.cmd install`; 6 audit vulnerabilities remain. |
| Backend start | Starts, then waits | `npm.cmd start` stays running. Without MySQL, it logs `ECONNREFUSED` connection errors. |
| Backend test without DB | Failed | Expected after env-driven DB config; no local MySQL was running. |
| Backend test with Docker MySQL | Passed | Started `database` service with Docker Compose; `npm.cmd test` reported 23 passing. |
| Frontend install | Passed | Regenerated stale npm v1 lockfile as lockfile v3. 91 audit vulnerabilities remain. |
| Frontend build | Passed | `npm.cmd run build`; CommonJS optimization warnings remain. |
| Frontend start | Passed startup | `npm.cmd start` compiled and served on `0.0.0.0:4200`; command timed out only because dev server keeps running. |
| Docker build | Passed | `docker compose -f docker-compose.dev.yml build` built `gui`, `backend`, and `database`. |
| Docker runtime | Partially tested | MySQL service was started for backend tests, then stopped with `docker compose ... down`. Full app stack runtime was not validated in this phase. |

## 8. Remaining Risks

- Backend API routes still lack authentication and authorization middleware.
- Many SQL statements still interpolate route params/body values directly, creating SQL injection risk.
- Backend opens database connections at route-module import time, which makes startup/test behavior noisy and fragile.
- npm audit still reports vulnerabilities: backend 6, frontend 91 after modernization.
- Several vulnerabilities are tied to legacy Angular 12-era build tooling and cannot be fully resolved without an Angular migration.
- `jade` is deprecated.
- `faker` is deprecated and should become `@faker-js/faker`.
- `angular2-chartjs` is old/CommonJS and should eventually be replaced by a maintained chart package.
- PDF dependencies add CommonJS optimization warnings through `canvg`, `core-js`, and `raf`.
- Docker Compose still uses an obsolete `version` key and has development-oriented volume/command patterns.
- Production Docker architecture still needs a proper nginx/static frontend and API proxy plan.

## 9. Recommended Next Steps

Immediate fixes:

- Keep Docker MySQL available when running backend tests.
- Add `.env.example` with DB/MSAL variables.
- Replace route-level connection creation with a shared DB module or connection pool.
- Parameterize SQL queries before expanding CRM features.

Next safe dependency upgrade phase:

- Plan Angular 12 -> 13 -> 14+ migrations incrementally with `ng update`.
- Replace `angular2-chartjs`.
- Migrate `faker` to `@faker-js/faker`.
- Replace or remove `jade`.
- Evaluate Express 5 after route tests are stronger.

Docker modernization phase:

- Create a production Compose file.
- Serve Angular static build from nginx.
- Proxy `/api` to the backend.
- Add a persistent MySQL volume.
- Remove obsolete Compose `version`.
- Avoid exposing MySQL to the LAN unless required.

Security hardening phase:

- Add backend MSAL/JWT validation middleware.
- Enforce roles server-side.
- Lock CORS to the deployed origin.
- Remove hard-coded secrets/defaults for production.
- Add audit/activity logging.

CRM feature expansion phase:

- Add accounts/companies, contacts, opportunities, tasks/follow-ups, activity history, projects, and service tickets after setup/security are stable.
