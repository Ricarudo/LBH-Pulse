# Auth Refactor Report

## Current State

Pulse no longer depends on active Microsoft MSAL, Azure, or Entra configuration for local development. The active Pulse web app uses a local development login with seeded users, and backend startup does not require cloud identity secrets.

## Frontend Behavior

The active Pulse web app uses its local development auth/session flow for workstation testing.

The frontend still treats user identity as a development convenience only. It is not production authentication.

## Backend Behavior

Backend API routes are currently open. A future production-ready path should add server-side token validation and role checks before deployment on a company network.

## Database Notes

Application data is served through Prisma and PostgreSQL. Active Pulse local users are seeded through `apps/web/prisma/seed.js`.

## Follow-Up

1. Add backend JWT validation middleware.
2. Add route-level authorization by role.
3. Replace frontend-only local login with a server-validated session for production.
