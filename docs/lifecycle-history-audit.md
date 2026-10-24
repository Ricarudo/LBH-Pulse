# Lifecycle status and history audit

Audit date: 2026-10-24. Scope: the current working tree, including existing uncommitted changes. This is a source-code audit, not an audit of deployed database contents. Application behavior has not been changed.

## Conclusion

History persistence is partially centralized; event policy is not. `recordLifecycleStatusEvent()` is an entity-agnostic status-event writer, but business services individually decide when to call it, supply event names and snapshots, and separately create visible timeline entries and activity logs. There is no single typed action registry that says which actions must appear in which history.

The normal direction is **action → business rule → state mutation + history writes**. History does not generally drive status. One explicit exception is Undo Sent, which reads the previous sent event to choose the restored quote status. Request readiness is derived from checklist and relationship data, not from the timeline.

A shared recording service with a typed event policy is appropriate. Keep status-transition rules in domain policies, and make the recorder responsible for consistent, transactional evidence. Adding a class alone will not fix omissions if callers can still independently choose or bypass its outputs.

## Existing mechanisms

| Mechanism | Responsibility | Current limitation |
| --- | --- | --- |
| `lifecycleEventService.ts:22`, `recordLifecycleStatusEvent(db, input)` | Writes `LifecycleStatusEvent`: entity, old/new status, actor, time, value and metadata | Does not mutate or validate status, compute differences, emit timeline/activity records, or enforce idempotency. Skips unchanged status unless `recordWhenUnchanged` is true. |
| `requestService.ts:198`, `deriveIntakeStatus()` | Computes request readiness status | Private, hardcoded precedence inside the request service. Checklist definitions provide some configurable inputs. |
| `workService.ts:1990`, `:2174`, `:2456`, `:2759` | Quote transition guards, sending, revisions and acceptance/handoff | Business rules and recording decisions are distributed across action functions. `quoteLifecyclePolicy.ts` primarily handles commercial-edit locking, not a complete transition policy. |
| `requestService.ts:616`, `quoteUpdateService.ts:191`, `workUpdateService.ts:302` | Write visible system entries into `RequestUpdate` | Three wrappers with different signatures/metadata capabilities. No automatic link to status events. |
| `activityService.ts:17`, `recordActivity()` | General operational/security activity | Uses the global Prisma client, so callers cannot include it in their existing transaction. Many actions log after committing. |
| `clientService.ts:686`, `listClientHistory()` | Client profile history | Reads another table, `ClientActivity`; this is separate from work-record lifecycle history. |
| `lifecycleLedger.ts`, `resolveLifecycleLedger()` | Validates history for analytics: duplicates, broken chains, ambiguous ordering and current-state disagreement | Detects bad/missing evidence after writing; does not ensure all actions record it. |

The Updates UI reads `RequestUpdate`, not `LifecycleStatusEvent`. Quote Updates include upstream request entries; project/invoice Updates gather their upstream records through relationships (`quoteUpdateService.ts:236`, `workUpdateService.ts:381`). A status-ledger entry alone will therefore not appear in that timeline.

The schema stores old/new status as strings and event types in optional JSON metadata (`schema.prisma:491`). The shared writer stamps APPLICATION/EXACT and supplies a system actor fallback. There is no automatic status-history trigger in the checked-in Prisma migrations. Imports/backfills also have explicit writers, with their own provenance requirements.

## Actions and effects

“Timeline” below means the work record's Updates timeline, not the general activity feed or client profile History.

| Action | Status effect | Status ledger | Timeline |
| --- | --- | --- | --- |
| Create request | Initial input status is passed through readiness derivation | Initial resulting status | Request-created entry |
| Edit request fields | Recomputes readiness | Writes when final status differs | Generic update, assignment, details or step entry; not necessarily a specific status entry |
| Complete/reopen checklist item | Recomputes readiness; can promote/demote request | **Missing transition write** | Checklist entry |
| Explicit request status/close/reopen | Requested status, subject to guards; reopening derives readiness | Transition | Status/reopen entry |
| Convert request to quote | Request → Converted to Quote; new quote → Draft when created | Request transition + initial quote event | Request conversion entry inherited by quote |
| Create standalone quote | Initial permitted input status; default Draft | Initial quote event | No quote-created system entry in this path; separate Activity exists |
| Edit quote status | Permitted transition, including Review, On Hold, Rejected, Expired or Cancelled as applicable | Transition | Status entry; On Hold requires reason |
| Mark quote sent | Draft/Review/On Hold → Sent | Transition with financial and version evidence | Sent entry |
| Administrator Undo Sent | Sent → prior eligible status from sent event, otherwise Draft | Reversal with reason and original event reference | Undo entry |
| Open quote revision | Prior eligible status → Revision Requested → Draft | Two events; prior outcome metadata may be annotated | Revision-request entry |
| Accept/convert quote | Sent → Approved; new project → Ready, or approved change order attaches to existing project | Quote transition if needed; initial project event for new project | Approval and project/handoff/change-order entries |
| Add/change/remove quote lines or kit; edit legacy financials; change calculation mode | No status change | Same-status value snapshot, explicitly forced | Financial/mode entry |
| Reorder quote lines; edit proposal notes | No status change | None | No system entry in these paths; separate Activity exists |
| Change quote assignee/collaborators through ordinary PATCH | No status change | None | No dedicated assignment/collaborator system entry in this path; generic Activity exists |
| Edit project status | Explicit input status | Transition | Status entry |
| Edit project budget/start/due date | No status change | Same-status snapshot when changed | No dedicated budget/date entry in this path |
| Approve/attach change order | Project status stays the same; project budget recalculates | **No corresponding project value snapshot in these branches** | Change-order entry |
| Create invoice directly | Input status, default Draft | Initial invoice event | Invoice-created entry |
| Create invoice from project | New invoice → Draft; project status stays the same | Initial invoice event | Invoice entry and project-side creation entry |
| Edit invoice status | Explicit input status | Transition | Status entry |
| Edit invoice amount/issued/due date | No status change | Same-status snapshot when changed | No dedicated amount/date entry in this path |
| Edit project/invoice assignee or lifecycle details | No status change | None | Dedicated system entries; details key presence is sufficient even if text is unchanged |
| Add/complete/undo current steps; post comments | Changes step state/current-step pointer, not parent business status | No parent status event | Step/comment/system records |
| Project task/expense operations | Changes task/expense state, not project status | No parent status event | Explicit task/expense system entries |
| Archive request/quote/project/invoice | Sets archivedAt, not status | None | No lifecycle system entry in these paths; separate Activity exists |
| Document upload/download and document management | No parent status change | None | Document service records Activity separately, not lifecycle system updates |

Relevant implementations: `requestService.ts:1320–2220`; `workService.ts:1376–1406`, `:1595–1879`, `:1917–2635`, `:2759–3149`, `:3292–3798`; `projectTaskService.ts`; `documentService.ts`.

Request readiness precedence is hardcoded: preserve Converted/No Bid/Cancelled/Duplicate; otherwise all readiness requirements satisfied → Ready for Quote; otherwise incomplete required site visit → Site Visit Required; otherwise missing requirements or missingInfo → Missing Info; otherwise retain Received or use Reviewing. Checklist completion, required items, owner, category, client and valid contact feed the readiness calculation. The Ready check precedes the missingInfo string check.

Project and invoice status updates accept their contract enum values; their update functions do not contain a full transition graph. In the inspected runtime code, invoice Overdue and quote Expired can be explicitly selected; dashboard overdue indicators can also be computed from dates without writing a new business status or history event. Completing tasks or creating an invoice does not automatically complete the project.

## Findings

### 1. High: checklist-derived status changes bypass the status ledger

`requestService.ts:1909–2010` updates the checklist, updates request flags, derives readiness, and writes a different request status at `:1971`. It never calls `recordLifecycleStatusEvent()`.

Example: the last missing checklist item completes, moving Missing Info → Ready for Quote. The visible timeline records the checklist completion, but the ledger still ends at Missing Info. A later conversion records Ready for Quote → Converted to Quote, leaving a broken chain. Analytics explicitly checks this chain (`analyticsService.ts:430–454`) and may mark the history unreliable or stop using later events.

The checklist writes are also separate global-client operations rather than one transaction, so a failure can leave partial changes.

### 2. High: concurrent updates can record an incorrect predecessor

Request status changes, project updates and invoice updates read the existing record before their mutation transaction and reuse that status as `fromStatus` (`requestService.ts:1761`, `workService.ts:3293`, `:3665`). They do not reread under a row lock or use an expected-version condition in those paths.

Two simultaneous commands can both record A → B and A → C, although the actual serialized mutations were A → B → C. The generic recorder accepts both. Quote PATCH has an explicit locked-state comparison, illustrating the stronger pattern already used elsewhere. This is a source-level concurrency risk; no live race test was run.

### 3. Medium: change-order budget changes omit project value evidence

Approving an existing change order and attaching an imported one both recalculate `Project.budget` (`workService.ts:2824`, `:2910`) and emit timeline entries, but return without recording a PROJECT value snapshot. Ordinary project budget edits explicitly record such snapshots (`:3362`). Historical project-value calculations can therefore lack the change-order amount until another event captures it.

### 4. Medium: timeline/activity completeness depends on each caller

The action matrix shows concrete inconsistencies: standalone quote creation, quote reassignment, proposal edits and archives can have Activity records without corresponding Updates entries. Project/invoice value and date changes can have ledger events without corresponding Updates entries. Some differences may be intentional, but there is no central policy expressing or testing that intent.

`updateRequest()` writes its visible entry after the state/ledger transaction, and uses an `if / else if` chain (`requestService.ts:1662–1693`): changing both lead and lifecycle details records only the lead-specific entry. Failures after commit can leave a successful mutation without its timeline or Activity evidence and still return an error to the caller.

Activity is subject to retention (default 730 days for operational entries, 365 for security entries), while this retention service does not prune `RequestUpdate` or `LifecycleStatusEvent`. The separate stores should not be treated as interchangeable durable history.

### 5. Integration risk: the in-progress quote-family service has a separate event convention

The current untracked `quoteFamilyService.ts` writes `LifecycleStatusEvent` directly (`:124`, `:234`). Registration adds another null → Draft event to an already-created quote. Superseding an offer records Sent → Superseded without changing the legacy Quote.status. Discarding a draft changes Quote.status to Cancelled while recording Draft → Discarded (`:273–276`). Its create/revise/send paths also do not emit normal Updates entries.

These semantics can conflict with the existing per-quote ledger validator and timeline. No runtime controller/service consumer of the quote-family entry points was found outside their own module; tests exercise them. Treat this as a compatibility issue to resolve before integration, not a claim about the currently deployed UI.

## Recommended design

Introduce a typed `LifecycleHistoryService.record(tx, event)` and a central action policy. Domain functions validate the action and compute actual before/after state, then call the recorder inside the same transaction. Require a transaction client for successful business-mutation events; allow a separate entry point for standalone security/read-attempt events.

Example policy shape (proposal only):

```ts
const lifecycleEventPolicy = {
  "request.checklist.updated": {
    timeline: true,
    statusHistory: "whenChanged",
    valueHistory: false,
    activity: true,
  },
  "quote.sent": {
    timeline: true,
    statusHistory: "required",
    valueHistory: true,
    activity: true,
  },
  "project.changeOrder.accepted": {
    timeline: true,
    statusHistory: "whenChanged",
    valueHistory: true,
    activity: true,
  },
} satisfies Record<LifecycleAction, LifecycleEventPolicy>;
```

The event should carry a typed action and payload, entity references, actor, one timestamp, actual before/after values, reason, and operation/idempotency key. If one action affects several entities, record all effects with the same operation key. Domain-specific payload builders can supply financial/version snapshots; the persistence and routing layer can remain agnostic to the action.

Central policy selects timeline/activity/value outputs and suppresses no-op noise consistently. Every actual business-status transition must retain status evidence; do not expose a caller flag that can disable this obligation. General history actions should not require fake old/new status values. Family outcome, publication state and legacy Quote.status need explicit state dimensions rather than sharing an ambiguous string field.

Use the existing tables first, preserving current readers and import precision/source semantics. Make `recordActivity` transaction-aware. Route normal writes through the recorder; keep maintenance/import capabilities explicit. Add durable idempotency constraints and an operation/event association so retries and projections can be reconciled. Prefer correction events referencing earlier evidence over mutating original payloads where practical.

Recommended sequence:

1. Fix checklist transactions and missing status events; protect predecessor reads for request/project/invoice updates.
2. Add missing change-order project snapshots.
3. Introduce typed actions, central flags/policy and transaction-aware recording; migrate action call sites using the matrix above as the acceptance checklist.
4. Define consistent timeline coverage for creation, assignments, dates, documents and archives; reconcile quote-family semantics before connecting it to readers.
5. Add behavior tests for each action's required outputs, rollback on recording failure, concurrency, retry deduplication and timeline visibility. Add an architectural check preventing ordinary services from bypassing the central writer.

## Verification and limits

Ran existing focused tests using the bundled Node runtime from `apps/api`:

```text
node --test --import tsx \
  src/lib/services/lifecycleEventService.spec.ts \
  src/lib/services/lifecycleLedger.spec.ts \
  src/lib/services/quoteLifecyclePolicy.spec.ts
```

Result: 10 tests passed, 0 failed. These verify writer skip/force behavior, ledger resolution, and quote commercial locking; they do not prove action-to-history completeness. No production data, migrations, runtime state or application source was changed. The only audit deliverable added is this document.
