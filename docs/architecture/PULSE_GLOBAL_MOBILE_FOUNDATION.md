# Pulse Global Mobile Foundation

Date: 2026-05-12

## Purpose

Pulse now has a shared mobile UI foundation in the active Next.js app. The goal is to keep mobile navigation, spacing, cards, badges, progress, and action patterns consistent across modules while letting each business object keep its own workflow.

Requests is the first proof point because it is the earliest real operational workflow: short-lived intake, missing information, assignment, checklist progress, and quote handoff.

## Active Implementation

- Shared primitives live in `apps/web/src/components/mobile/MobilePrimitives.tsx`.
- Global mobile navigation is rendered by `PulseShell` as a fixed bottom nav below the mobile breakpoint.
- Requests uses `apps/web/src/modules/requests/RequestsMobileView.tsx` for its mobile queue and selected-record workflow.
- Mobile styling currently lives in `apps/web/src/app/globals.css` with scoped `.mobile-*` and `.requests-mobile-*` selectors.

## Design Rules

- Keep mobile primitives generic. They should not know about Requests, CRM, auth permissions, Prisma, or API routes.
- Pass module permissions as capability booleans, such as `canCreate`, `canUpdateStatus`, `canUpdateChecklist`, or `canConvert`.
- Preserve desktop layouts while mobile views mature.
- Use the same data and handlers for desktop and mobile whenever possible.
- Avoid expanding Quotes or Projects workflow during the Requests mobile pass; those modules still use starter data and will get their own pass later.

## Current Limitations

- Hub has mobile-specific CSS to prevent desktop dashboard ratios from forcing mobile overflow.
- Requests is the only module with a polished mobile record workflow.
- Clients, Quotes, Projects, and other modules inherit the global shell/nav first and will need module-specific mobile content later.
- The mobile CSS should eventually be split into clearer files or CSS modules once the foundation stabilizes.

## Recommended Next Module

After Requests is stable on real phones, bring Clients/Directory into the same mobile card/detail pattern. It already has database-backed records and similar list/detail behavior, so it is the best next proof point before revisiting Quotes.
