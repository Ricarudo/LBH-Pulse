# Pulse 0.2 Independent Improvements Batch 01

## 1. Execution summary

- Date and repository: 2026-11-17, `/Users/ricky/Downloads/R2-KuoteSuite-CRM`.
- Starting branch and commit: `portfolio-database-preparation` at `9e0e4a2c80e7b42ba218831c03def8ad9c20a51b`.
- Initial working tree: no tracked changes. Thirteen untracked audit documents under `docs/architecture/current-state-audit/` predate this batch.
- Ending branch and commit: `portfolio-database-preparation` at `9e0e4a2c80e7b42ba218831c03def8ad9c20a51b`.
- Scope completed: commercial handoff authorization, Builder regression coverage, and Analytics source availability.
- Overall result: all three implementation tasks completed. Focused and disposable-database checks passed. The repository-wide suite still reports one release manifest failure, reproduced at the starting commit.

## 2. Task status matrix

| Task | Audit risks | Status |
| --- | --- | --- |
| Quote-to-Project authorization | R4 | COMPLETED |
| Quote Builder reliability | R1, R2, R8 | COMPLETED |
| Analytics availability | R22 | COMPLETED |

## 3. Detailed changes

### Task 1 — Quote-to-Project authorization (R4)

- Verified that `POST /api/projects` required only `projects:write` and delegated to the same conversion transaction as `POST /api/quotes/:id/approve` and `POST /api/quotes/:id/convert`. Conversion can approve a Sent Quote and persist a Project and financial snapshots. Quote create and PATCH reject direct approval. The staged Quote Family acceptance function already checks both permissions and has no registered route.
- `apps/api/src/controllers/projects.controller.ts` now uses the same `allOf` check as the two Quote routes. A user missing either permission receives 403 before the conversion transaction begins. Authorized requests retain the existing service behavior and response.
- `apps/api/src/modules/quotes/quote-handoff-authorization.spec.ts` exercises all three handlers with the real permission check and a fake database. It verifies no mutation transaction starts after denial, successful Project creation and Quote conversion responses against a mocked transaction result, and equivalent authorization at the explicit approval boundary.
- Extended the existing LEGACY fixture in `apps/api/src/modules/quotes/quote-modes.integration.spec.ts` to drive Project creation and explicit Quote approval through their controllers. For either missing permission it verifies 403, identical Sent Quote and lifecycle rows, and absence of both Project and ProjectQuote rows. With both permissions, Project creation approves the Quote and preserves the pre-tax budget and tax snapshot, and repeating approval returns the same Project without a duplicate link.
- Focused API test run from `apps/api`: `node --import tsx --test src/modules/quotes/quote-handoff-authorization.spec.ts src/modules/quotes/quote-modes.integration.spec.ts`. 9 passed, 0 failed, 7 skipped. The first harness attempt failed to intercept the Prisma proxy, then passed once the test injected a fake client. Database-backed Quote tests were disabled. The initial isolated handler run used a fake transaction. The later PostgreSQL verification is recorded below.

### Task 2 — Quote Builder reliability (R1, R2, R8)

- Existing tests covered configuration canonicalization, BOM and host edit restrictions, browser calculation presentation, Decimal rounding, labor allocation, practical crew duration, and opt-in database concurrency and financial isolation. The component's failed-save handler retains local state and requires explicit confirmation before discarding dirty inputs on reload.
- Added three service regressions in `apps/api/src/modules/quote-builder/quote-builder.spec.ts`. They cover two distinct editors using the same token, an accepted update incrementing the token, a rejected stale update preserving both the stored winner and the other caller's draft, stale and incorrect configuration IDs, saved inputs surviving disabled and removed labor classes, active catalog changes without repricing, Decimal cent rounding, and explicit zero versus missing material cost.
- Focused runs used `node --import tsx --test src/modules/quote-builder/*.spec.ts` from `apps/api` (12 passed, 3 database tests skipped), `node --import tsx --test src/lib/quoteBuilder*.spec.ts` from `apps/web` (11 passed), and `node --import tsx --test packages/{contracts/src/quote-builder,quote-calculator/src/calculator}.spec.ts` from the root (24 passed). No failures. The conflict test verifies the input and response contract at the service boundary. A mounted browser conflict interaction was not exercised. Actual concurrent row locking was verified in the later PostgreSQL run.
- Builder code, formulas, financial authority, revision persistence and BOM compatibility retain their existing behavior. Publication remains a separate architecture decision.

### Task 3 — Analytics availability (R22)

- Verified that Analytics feature access and source-domain read permissions were separate. Unreadable domains were already excluded from top-level record and event queries, but their empty arrays still produced Overview sums of zero, exact-coverage labels, and zero-valued calculation components. Direct drilldowns could resemble genuinely empty selections. Linked dates also supported cross-domain elapsed-time and conversion indicators without independent source permission checks.
- `apps/api/src/lib/services/analyticsService.ts` now carries the source authorization alongside loaded facts. Restricted KPIs return null current/comparison/delta values, an unavailable quality status, and no calculation components or precision counts. Direct restricted drilldowns return an explanatory summary without records or calculation metadata. Request-to-Quote and Request-to-completion elapsed time require Request read access, and Request source conversion requires Quote read access in addition to Request read access. Overview charts omit restricted stages and series, keeping permitted figures visible. Sales trade and source charts use the same guards for their shared source dependencies.
- `packages/contracts/src/analytics.ts` adds optional `quality.availabilityReason` values `restricted` and `no_records`. This additive field lets consumers distinguish source authorization from an accessible selection without qualifying records. Sums over an accessible empty selection retain zero and ratios without a denominator retain null. A true zero with eligible records retains its original quality.
- `apps/web/src/components/AnalyticsWorkspace.tsx` labels restricted and empty KPI states, disables the restricted card's drilldown control, and keeps its explanation available. Charts with no readable series present the server's permission explanation.
- `apps/api/src/lib/services/analyticsAvailability.spec.ts` exercises true zero, accessible empty results, billing-only restrictions, multiple missing permissions, source/event queries, charts, direct drilldowns, and preserved permitted values. The focused API run `node --import tsx --test src/lib/services/analytics*.spec.ts` from `apps/api` passed 14 tests with none skipped. The initial focused run exposed two test-fixture assumptions (synthetic snapshot row ID and mock ordering), both corrected.
- Existing related context on permitted records, including trade and client labels, retains its existing attribution and filtering behavior. Financial definitions, historical reconstruction, and the separate ambiguity when multiple KPIs share a drilldown metric remain unchanged.

## 4. Test results

The task sections list focused commands and fixtures. Node 24.18.0 was used. Standard runs supplied a non-operational database URL and disabled all opt-in database suites.

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `npm test` — shared contracts | 49 | 0 | 0 |
| `npm test` — Decimal calculator | 21 | 0 | 0 |
| `npm test` — API | 189 | 0 | 23 |
| `npm test` — web | 57 | 0 | 0 |
| `npm test` — release | 2 | 1 | 0 |
| `npm run test:release` — clean archive of starting HEAD | 2 | 1 | 0 |
| Disposable PostgreSQL — Quote modes and Builder | 10 | 0 | 0 |

- Database command, run from `apps/api`: `PULSE_RUN_DB_TESTS=1 node --import tsx --test src/modules/quotes/quote-modes.integration.spec.ts src/modules/quote-builder/quote-builder.integration.spec.ts`. A dedicated Docker Compose project used a tmpfs database and a separately assigned loopback port. Applied the 10 existing migrations with `npm run db:migrate:deploy` there. No seed, reset, or repair scripts ran. The container and its network were removed after verification. An initial sandboxed connection attempt could not reach the database. The first integration run then passed nine tests and failed on the new fixture's missing required role ID. The corrected run passed all ten.
- Of the 23 integration skips in `npm test`, ten were exercised by the dedicated run. The other 13 are the unrelated Quote Item, Quote Family, and lifecycle schema integration cases. Browser interaction tests were not run.
- The release generator compares the declared 0.1.2 migration list with the repository's migration directories. The starting commit already contains three later migration directories omitted from that manifest. The exact failure reproduced from a clean `git archive HEAD` using `npm run test:release`. Release metadata was outside this batch.
- `npm run typecheck` and `npm run build` both passed after the final code changes. The production Next.js build compiled and generated all 22 static pages.
- `git diff --check` passed. Regression risks concentrate on role combinations for cross-domain Analytics and existing consumers that inspect KPI quality. Tests verify permitted metrics retain their values and drilldown calculations and restricted metrics return no components or rows.

## 5. Architecture compatibility

| Area | Effect |
| --- | --- |
| Prisma schema | No changes. |
| Database migrations | No files added or changed. Existing migrations ran only inside the disposable test database. |
| Operational data | No access or changes. |
| API contracts | Analytics quality adds optional `availabilityReason`. Restricted KPIs reuse existing nullable values and unavailable status, and restricted details use the existing response shape and summary field. |
| Permission requirements | Project creation from a Quote now requires `quotes:write` and `projects:write`, matching Quote convert and approve. Analytics continues to require `analytics:read`, with applicable source reads checked for KPI and drilldown evidence. |
| Commercial financial calculations | No changes. |
| Legacy compatibility | Existing PULSE BOM restrictions and LEGACY commercial financial snapshots remain in place. |
| External integrations | No changes. |

No unexpected architecture impact surfaced. The batch introduces no Portfolio, identity, internal Quote approval, Builder publication, revision persistence, task, or milestone changes.

## 6. Remaining issues

- The pre-existing 0.1.2 release manifest mismatch needs separate release-owner review before relying on the release suite.
- Builder publication and historical inputs/configuration ownership remain separate architecture decisions. The mounted browser conflict interaction was verified by code inspection and service tests, with no browser automation.
- Analytics metrics that share a drilldown identifier can still resolve to the first matching KPI's formula. Unique selected-KPI context is a separate contract decision. Existing related-record context and historical attribution retain their previous behavior.

## 7. Final file inventory

`git status --short --untracked-files=all`

```text
 M apps/api/src/controllers/projects.controller.ts
 M apps/api/src/lib/services/analyticsService.ts
 M apps/api/src/modules/quote-builder/quote-builder.spec.ts
 M apps/api/src/modules/quotes/quote-modes.integration.spec.ts
 M apps/web/src/components/AnalyticsWorkspace.tsx
 M packages/contracts/src/analytics.ts
?? apps/api/src/lib/services/analyticsAvailability.spec.ts
?? apps/api/src/modules/quotes/quote-handoff-authorization.spec.ts
?? docs/architecture/current-state-audit/01_EXECUTIVE_SUMMARY.md
?? docs/architecture/current-state-audit/02_DATABASE_SCHEMA_CATALOG.md
?? docs/architecture/current-state-audit/03_ENTITY_RELATIONSHIP_MAP.md
?? docs/architecture/current-state-audit/04_BUSINESS_WORKFLOWS.md
?? docs/architecture/current-state-audit/05_BUSINESS_ENTITY_DEPENDENCIES.md
?? docs/architecture/current-state-audit/06_ITEM_AND_CALCULATOR_ARCHITECTURE.md
?? docs/architecture/current-state-audit/07_API_AND_MODULE_MAP.md
?? docs/architecture/current-state-audit/08_DOCUMENTS_STORAGE_AND_INTEGRATIONS.md
?? docs/architecture/current-state-audit/09_CONSOLIDATION_READINESS.md
?? docs/architecture/current-state-audit/10_OPEN_QUESTIONS_AND_RISKS.md
?? docs/architecture/current-state-audit/11_REPOSITORY_AND_RUNTIME_INVENTORY.md
?? docs/architecture/current-state-audit/AUDIT_PROGRESS.md
?? docs/architecture/current-state-audit/PULSE_ARCHITECTURE_HANDOFF.md
?? docs/implementation-reports/2026-11-17_permissions-builder-analytics.md
```

The thirteen audit files listed above are pre-existing and were left intact. All other listed files belong to this batch. The two new test files and this report are untracked and therefore absent from the tracked diff statistics.

`git diff --stat`

```text
 apps/api/src/controllers/projects.controller.ts    |   2 +-
 apps/api/src/lib/services/analyticsService.ts      | 160 +++++++++++++++++----
 .../modules/quote-builder/quote-builder.spec.ts    | 104 +++++++++++++-
 .../modules/quotes/quote-modes.integration.spec.ts |  63 +++++++-
 apps/web/src/components/AnalyticsWorkspace.tsx     |   7 +-
 packages/contracts/src/analytics.ts                |   2 +
 6 files changed, 299 insertions(+), 39 deletions(-)
```

## 8. Next-session handoff

The batch is implemented and remains in the working tree on `portfolio-database-preparation`. Review the authorization and optional Analytics metadata changes before incorporating them into the larger 0.2 work. If further release verification is needed, start with the manifest mismatch reproduced at the original HEAD. No temporary integration database remains.
