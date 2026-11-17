# Pulse 0.2 Independent Improvements Batch 02

## 1. Execution summary

- Date and repository: 2026-11-17, `/Users/ricky/Downloads/R2-KuoteSuite-CRM`.
- Branch: `portfolio-database-preparation`.
- Continuation starting HEAD: `9e0e4a2c80e7b42ba218831c03def8ad9c20a51b`.
- Phase 2 started from the Batch 01 commit recorded below. The working tree then contained only the thirteen pre-existing untracked architecture audit documents.
- Batch 02 starting and ending HEAD: `5787b502c633e5f3b95dfd17c026216583d2ab13`. No Batch 02 changes were committed.
- Final working tree: seven modified tracked files, two new Batch 02 files, and thirteen pre-existing untracked audit documents. The staged set is empty.
- Overall Batch 02 result: all three tasks implemented. Final suite and build results appear below.

## 2. Batch 01 commit confirmation
- Commit: `5787b502c633e5f3b95dfd17c026216583d2ab13`.
- Message: `fix(pulse): batch-01 authorization, builder tests, analytics availability`.

Committed file inventory

```text
apps/api/src/controllers/projects.controller.ts
apps/api/src/lib/services/analyticsAvailability.spec.ts
apps/api/src/lib/services/analyticsService.ts
apps/api/src/modules/quote-builder/quote-builder.spec.ts
apps/api/src/modules/quotes/quote-handoff-authorization.spec.ts
apps/api/src/modules/quotes/quote-modes.integration.spec.ts
apps/web/src/components/AnalyticsWorkspace.tsx
docs/implementation-reports/2026-11-17_permissions-builder-analytics.md
packages/contracts/src/analytics.ts
```

Verified that the unstaged working tree and staged diff matched the Batch 01 report. The nine explicit paths were the entire commit, and the thirteen audit documents were excluded. The recorded release failure is present in the starting revision. No branch switch, push, tag, merge, or deployment occurred.

## 3. Batch 02 task status

| Task | Reference | Status |
| --- | --- | --- |
| Release manifest mismatch | Batch 01 baseline | COMPLETED |
| Analytics drilldown KPI identification | R22 | COMPLETED |
| Document inheritance and access tests | R9 | COMPLETED |

## 4. Detailed findings and implementation

### Task 1 — Release manifest mismatch

- **Classification A and C.** The historical 0.1.2 metadata is correct for tag `v0.1.2` at `cb8c92d1f19b90548b80bd9144cf9800a0ee6f73`. The release smoke test combined it with the development checkout's migration inventory. The tag has the six source migrations and one change-order target migration declared in `docs/releases/0.1.2.json`. The branch adds the Builder workspace, Standard labor class, and client preferences migrations, and still reports workspace version 0.1.2.
- Inspected `scripts/release/create-release-manifest{,.spec}.mjs`, `create-deployment-bundle.mjs`, `apps/api/scripts/database/verify-release-upgrade-ci.ts`, release notes and JSON, active Prisma migration directories, `.github/workflows/release.yml`, and the production and audit documentation. The tag workflow verifies the checked-out SHA, uses its release metadata and files, and packages digest-pinned images. The managed bundle also consumes historical 0.1.2 metadata for compatibility. Any real release built with mismatched migration metadata should still fail closed.
- Modified only `scripts/release/create-release-manifest.spec.mjs`. The historical test now runs the actual generator against the current copy of the historical metadata with an explicit directory inventory from its tag. Two additional cases prove the same generator rejects a missing declared migration or an undeclared newer one. The production check, historical metadata, migration SQL and signed artifacts are unchanged.
- `npm run test:release` passed 5/5. The same command in a clean local `git archive v0.1.2` passed 3/3 with the original tagged test and actual tagged migration directories. No deployment, artifact signing, or database operation occurred.

### Task 2 — Analytics drilldown KPI identification (R22)

- Reviewed `analyticsService.ts`, `analytics.controller.ts`, `AnalyticsWorkspace.tsx`, shared Analytics contracts and fixtures, and audit R22. Multiple Billing and Sales cards share a detail record selector. Previously the server took the first KPI with that metric, and the client highlighted every matching card. The detail panel also did not render the server's calculation.
- The client now sends the stable optional `kpiId` for KPI cards and retains it when sorting and paging. The server validates the KPI against the requested view and metric. A mismatched combination returns HTTP 400. Chart segments and buckets remain metric-scoped. The selected card supplies the drilldown title, formula, components, formatted aggregate unit, and quality. The detail table preserves record values, labels, filters, and ordering.
- Legacy metric-only requests keep their rows and generic title. The server includes the prior calculation when exactly one KPI matches and omits calculations when several match. Restricted drilldowns still return zero rows without a breakdown. An explicit restricted KPI includes only the same permission-safe quality and null aggregate already visible on the summary.
- Additional coverage compares the paid-value and elapsed-time cards when they share exact paid events but those events do not capture the issue date required for elapsed time.
- Modified `apps/api/src/lib/services/analyticsService.ts`, `analyticsAvailability.spec.ts`, `apps/web/src/components/AnalyticsWorkspace.tsx`, `apps/web/src/app/globals.css`, and `packages/contracts/src/analytics{,.spec}.ts`. Existing financial formulas and attribution were preserved.
- After `npm run build:shared`, the focused contract tests passed 6/6 and the initial API Analytics tests passed 17/17 via `node --import tsx --test` on `packages/contracts/src/analytics.spec.ts` and, from `apps/api`, `src/lib/services/analytics*.spec.ts`.

### Task 3 — Document inheritance and access tests (R9)

- Reviewed `documentService.ts`, the Projects, Quotes, and Documents controllers, Project work-service mapping, the existing document and access-control fixtures, and audit R9 and the document handoff. Project listing is guarded by `projects:read` and includes files associated through every ProjectQuote link without an approval predicate. The listing exposes document metadata and links when a clean object is present. Direct file access separately resolves downstream rights through the older direct original Quote relationship, including for Request-origin files.
- Added `apps/api/src/lib/services/documentInheritance.spec.ts` using the real Project controller and document listing, preview metadata, preview, and download services with isolated Prisma and object-store fixtures. The tests cover both roles together and an unrelated permission in addition to the Project-only and Quote-only cases. A permitted metadata request never opens storage. Denied preview and download requests also never open storage.
- Quote listings contain their own files and applicable Request documents, including the saved snapshot Request ID. They do not include the Project's own file or files from sibling Quotes.
- Verified distinction for clean documents:

| Origin | Included in Project list for Project reader | Direct HEAD metadata, preview, download for Project-only reader | Direct HEAD metadata, preview, download for Quote-only reader |
| --- | --- | --- | --- |
| Project | Yes | Allow | Deny |
| Direct original Quote | Yes | Allow | Allow |
| Request linked to direct original Quote | Yes | Allow | Allow |
| Approved change order with ProjectQuote link | Yes | Deny | Allow |
| Pending change order with ProjectQuote link | Yes | Deny | Allow |
| Snapshot Request linked only through change-order Quote | Yes | Deny | Allow |

- Quote-only and unrelated readers cannot open the Project list. Unrelated read permission grants none of the direct file operations in the table. Both Project and Quote read permissions together grant all six in this fixture. Listed status and URLs represent object availability, independent of permission for direct content access.
- The discrepancy is intentionally characterized in tests. Production policy, ownership, storage, and schema were left unchanged. Future authorization must decide whether pending and accepted links or cross-customer associations may expose inherited files, and whether the list should avoid exposing metadata for files the caller cannot open.
- From `apps/api`, `node --import tsx --test src/lib/services/document*.spec.ts` passed 16/16 with no skipped tests. The fixtures intercepted all storage calls and used no database connection.

## 5. Tests and verification

Focused results and commands appear in each task section. The final additional targeted run from `apps/api` used `node --import tsx --test src/lib/services/{analyticsAvailability,documentInheritance}.spec.ts` and passed 13/13. The first repository-wide attempts caught two fixture-only TypeScript narrowing errors with Prisma's generated list filter types. The fixture now narrows list operands to arrays and non-null IDs. Final verification is recorded below.

| Final verification | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `npm test` — contracts | 50 | 0 | 0 |
| `npm test` — calculator | 21 | 0 | 0 |
| `npm test` — API | 198 | 0 | 23 |
| `npm test` — web | 57 | 0 | 0 |
| `npm test` — release | 5 | 0 | 0 |
| **Total** | **331** | **0** | **23** |

- Both `npm run typecheck` and `npm run build` passed. The 23 skipped tests were opt-in PostgreSQL integration cases. The release failure recorded in Batch 01 is resolved by the verified fixture correction.
- Browser interaction, live storage, deployment jobs, and database integration were outside the verification performed for Batch 02. No production database or object store was contacted. The document tests exercise real list and direct-access services with mocked delegates and S3 calls. Batch 01's documented disposable PostgreSQL results were carried forward as prior evidence only.
- `git diff --check` passed. Release metadata and migration provenance were additionally checked against the local immutable 0.1.2 tag. The historical test run used synthetic image digests and performed no signing or deployment.

## 6. Database and security impact

| Area | Batch 02 effect |
| --- | --- |
| Schema and migrations | No changes. No database migrations ran. |
| Operational data | No access or changes. |
| API contracts | Analytics detail requests accept optional `kpiId`, validated with the view and metric. Explicit drilldowns can include a new optional `kpi` result with aggregate format, value, and quality. Legacy ambiguous detail requests retain the existing evidence rows without a guessed formula. |
| Permissions | No grants or permission expansion. Analytics drilldowns retain source-domain enforcement. |
| Document visibility | No production changes to lists, metadata, authorization, ownership, or storage. |
| Financial calculations | No changes to calculations, filtering semantics, historical reconstruction, or attribution. |
| Release infrastructure | Historical release regression fixture only. Generator, signing, CI configuration, metadata, image references and artifacts are unchanged. |
| External integrations | No changes. |

## 7. Remaining issues and recommendations

- R9 remains a policy decision. The Project list exposes file metadata based on lineage while the file endpoints reject some of those records for a Project-only reader. Decide how approved versus pending change orders, saved upstream Requests, and cross-customer relationships affect list metadata and content access before changing either rule.
- Future release packaging must supply new version metadata that exactly matches the migration chain at the approved new source tag. The test repair preserves that check and does not declare this development branch ready for release.
- Metric-only Analytics callers that require a KPI-specific calculation should send `kpiId` alongside view and metric. Chart requests continue to use metric and optional segment or bucket selectors.
- Suggested next batch after policy review is to align the document listing and file authorization rules with the chosen scope and add integration evidence for those rules.

## 8. Final file inventory

`git status --short --untracked-files=all`

```text
 M apps/api/src/lib/services/analyticsAvailability.spec.ts
 M apps/api/src/lib/services/analyticsService.ts
 M apps/web/src/app/globals.css
 M apps/web/src/components/AnalyticsWorkspace.tsx
 M packages/contracts/src/analytics.spec.ts
 M packages/contracts/src/analytics.ts
 M scripts/release/create-release-manifest.spec.mjs
?? apps/api/src/lib/services/documentInheritance.spec.ts
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
?? docs/implementation-reports/2026-11-17_release-analytics-documents.md
```

The thirteen architecture audit documents shown above predate the batch. Its new files are the document regression test and this report. No files are staged.

`git diff --stat`

```text
 .../src/lib/services/analyticsAvailability.spec.ts | 100 +++++++++++++++++++++
 apps/api/src/lib/services/analyticsService.ts      |  29 ++++--
 apps/web/src/app/globals.css                       |   7 ++
 apps/web/src/components/AnalyticsWorkspace.tsx     |  41 ++++++---
 packages/contracts/src/analytics.spec.ts           |   9 ++
 packages/contracts/src/analytics.ts                |   6 ++
 scripts/release/create-release-manifest.spec.mjs   |  62 +++++++++----
 7 files changed, 222 insertions(+), 32 deletions(-)
```

## 9. Next-session handoff

Batch 01 is committed at `5787b502c633e5f3b95dfd17c026216583d2ab13`. Batch 02 remains in the working tree for review. The release mismatch was isolated to the historical test fixture. Analytics drilldowns use stable KPI identity. Document tests preserve evidence of R9 while the access policy decision remains open. No push, tag, deployment, or operational database activity occurred.
