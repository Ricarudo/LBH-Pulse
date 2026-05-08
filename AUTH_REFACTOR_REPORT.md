# Authentication Refactor Report

Date: 2026-05-08

## Executive Summary

KuoteSuite no longer depends on active Microsoft MSAL / Azure / Entra authentication for local development. The Angular frontend now uses a simple local development login with four built-in users, and backend startup no longer requires Azure client secrets or MSAL packages.

This refactor intentionally does not make the app production-secure. It removes the broken setup blocker and leaves a clean path to add Azure/Entra authentication back later through a dedicated auth provider and backend JWT validation middleware.

## What Changed

- Removed active MSAL runtime imports from Angular.
- Removed MSAL module, guard, interceptor, redirect component, and broadcast handling from Angular app startup.
- Replaced MSAL route protection with `AuthService` plus `RoleGuardService`.
- Added local development users for Admin, Sales, Project Manager, and Technician.
- Removed backend MSAL startup/config code from `backend/app.js`.
- Replaced backend auth endpoints with local-development status/placeholder responses.
- Removed Azure secret requirements from backend `.env.example` and Docker Compose CI configuration.
- Removed MSAL npm packages from backend and frontend package manifests.
- Updated README documentation for local login.

## Local Users

| User | ID | Email | Role |
| --- | --- | --- | --- |
| Admin User | `local-admin` | `admin@r2.local` | `Admin` |
| Sales User | `local-sales` | `sales@r2.local` | `Sales` |
| Project Manager User | `local-project-manager` | `project.manager@r2.local` | `ProjectManager` |
| Technician User | `local-technician` | `technician@r2.local` | `Technician` |

## How Local Login Works

The local login lives in `gui/src/app/_services/auth.service.ts`.

`AuthService` provides:

- `login(userId)`
- `logout()`
- `isAuthenticated()`
- `getCurrentUser()`
- `hasRole(expectedRoles)`
- `getLocalUsers()`
- `getLocalApiUsers()`

The selected local user ID is stored in browser `localStorage` under `kuotesuite.localUserId`. This keeps the development session active across page refreshes.

`RoleGuardService` now checks `AuthService` instead of MSAL token claims. Protected Angular routes redirect to the home/login screen when no local user is selected.

## Frontend Auth Usage Changed

Removed active MSAL usage from:

- `gui/src/app/app.module.ts`
- `gui/src/app/app.routing.ts`
- `gui/src/app/app.component.ts`
- `gui/src/app/home/home.component.ts`
- `gui/src/app/_services/role-guard.ts`
- `gui/src/app/_components/qDashboard/qDashboard.ts`
- `gui/src/app/_components/quote-page/quote-page.ts`
- `gui/src/app/_services/costCalculator.service.ts`
- `gui/src/app/_services/httpRequest.service.ts`

Added/updated local auth support in:

- `gui/src/app/_services/auth.service.ts`
- `gui/src/app/auth-config.ts`
- `gui/src/environments/environment.ts`
- `gui/src/environments/environment.prod.ts`

`HttpRequestService.getUsers()` now merges the built-in local users with database users so assignment dropdowns remain usable during development even before local users are seeded into MySQL.

## Backend Auth Usage Changed

Removed backend MSAL dependency from `backend/app.js`.

The backend now exposes:

```text
GET /auth/status
```

This endpoint reports that local development login is handled by the Angular frontend. It does not authenticate users.

`backend/routes/login.js` is now a placeholder route for future auth work instead of incomplete MSAL code.

## Packages Removed

Backend:

- `@azure/msal-node`

Frontend:

- `@azure/msal-angular`
- `@azure/msal-browser`

No active source imports remained before these packages were removed.

## Build and Run Results

Frontend build:

- Command: `npm.cmd run build` from `gui/`
- Result: Passed
- Notes: Existing CommonJS optimization warnings remain from legacy PDF/chart dependencies.

Frontend start:

- Command: `npm.cmd start` from `gui/`
- Result: Passed startup and compiled successfully
- Notes: The command timed out because Angular dev server keeps running. It listened on `0.0.0.0:4200`.

Backend start without MySQL ready:

- Command: `npm.cmd start` from `backend/`
- Result: Started process, but route-level MySQL connections logged `ECONNREFUSED`.
- Notes: This is an existing database startup behavior, not caused by the auth refactor.

Backend start after Docker MySQL became ready:

- Command: `docker compose -f docker-compose.dev.yml up -d database`, then `npm.cmd start` from `backend/`
- Result: Backend started and route-level MySQL connections reported `Database connected`.
- Notes: The command timed out because the Express server keeps running.

## Security Warnings

- Local login is frontend-only and can be bypassed by direct API calls.
- Backend API routes are still not protected by authentication middleware.
- Roles are enforced only in Angular route guards.
- Local users have no passwords and should not be used as real production identities.
- Backend JWT validation is required before company-network hosting.
- SQL injection risks still exist in raw MySQL route queries.

## How Azure/Entra Should Be Reintroduced Later

Recommended path:

1. Keep `AuthService` as the frontend abstraction.
2. Add an `AuthProvider` interface behind `AuthService`.
3. Implement a local provider for development and an Azure/Entra provider for production.
4. Restore MSAL packages only inside the Azure provider implementation.
5. Add backend JWT validation middleware before the REST routes.
6. Validate issuer, audience, expiration, signature, and roles/scopes server-side.
7. Enforce role permissions in backend middleware, not only Angular guards.
8. Move API calls behind a single LAN/proxy origin to simplify token and CORS handling.

## Remaining Follow-Up Work

- Add backend auth middleware and route-level authorization.
- Replace raw SQL interpolation with Prisma or parameterized queries.
- Decide whether local users should be seeded into the database during development.
- Convert frontend API base URL to runtime config before Unraid/local-network deployment.
