# Pulse 0.1 data quality and repair policy

No production data repair is part of schema migration or application startup. Every maintenance command below is read-only by default, emits entity identifiers/current state/proposal/reason/confidence/review requirements, and requires an explicit apply command for writes. Apply commands record a report digest and maintenance provenance and are designed to be idempotent.

## Completeness policy

For newly created interactive records:

- A client must include at least one real site.
- A request and quote must reference a client, contact, site, and assignee.
- Existing imported or migrated records may remain incomplete and are visibly reported as legacy exceptions.
- Updates cannot clear complete relationships or create a new incomplete state.

This is enforced in application contracts and services for 0.1. Immediate destructive database `NOT NULL` constraints are unsafe while legacy exceptions remain. Placeholder sites are not a migration dependency and are never implicit.

Run the complete read-only report:

```sh
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.maintenance.yaml \
  --profile maintenance run --rm data-integrity \
  npm run data:audit -w @pulse/api
```

The supplied production findings remain review inputs: 205 of 216 clients without a site, 316 of 321 quotes without a site, 310 quotes without an assignee, one unresolved quote contact, request `RQ-2026-1001`, and quotes `QM260054`/`QM260055`. Do not invent historical sites, contacts, or assignees.

The read-only 2026-07-22 production preview reconfirmed each of those counts. The targeted anomaly preview found no provable successor/current-step or sent-date correction, so no anomaly write was proposed or performed.

## Optional placeholder sites

Lifecycle-context backfill is a preview by default. It will create placeholder sites only with both write mode and the dedicated opt-in:

```sh
npm run db:lifecycle-contexts:preview -w @pulse/api
npm run db:lifecycle-contexts:placeholder-sites -w @pulse/api
```

The second command must not be run for the 0.1 release without a separately approved stewardship decision. Created records are explicitly marked `isPlaceholder`; existing client/quote relationships are not silently rewritten during schema setup.

## Known anomalies

Preview targeted repairs and retain the JSON report:

```sh
npm run data:known-anomalies:preview -w @pulse/api
```

The tool proposes a write only when the canonical step or timestamp correction is provable from relational/revision evidence. Ambiguous targets remain `humanReviewRequired` and cannot be guessed. After backup, restored-copy validation, review, and change approval, use:

```sh
PULSE_REPAIR_REPORT_DIGEST=<reviewed-digest> \
  npm run data:known-anomalies:apply -w @pulse/api
```

Re-run preview and all financial/revision/document reconciliation checks after an approved apply.

## Lifecycle ledger

`LifecycleStatusEvent` is preserved. Exact payload-equivalent duplicates can be marked superseded; ambiguous transitions are never deleted or fabricated. Preview:

```sh
npm run lifecycle:audit -w @pulse/api
```

The report includes ordered events, breaks, duplicates, timestamp anomalies, current status, canonical sequence, deterministic status, and an unreliable-history boundary. A reviewed exact-duplicate disposition may be applied with:

```sh
PULSE_REPAIR_REPORT_DIGEST=<reviewed-digest> \
  npm run lifecycle:duplicates:apply -w @pulse/api
```

Historical analytics accepts only validated canonical events. At or after the first unreliable boundary it reports the interval/entity as unreliable instead of silently trusting event timestamp/ID order; for current and future state it safely falls back to the entity’s current status.

Pulse 0.1 limitation: an ambiguous historical chain cannot be reconstructed without evidence. Reports expose the affected entity/period and may omit a historical status rather than present a false value.

The read-only 2026-07-22 production preview reviewed 494 events and reported 48 affected entities, 75 raw chain breaks, 73 legacy quote-chain breaks, and six latest-event/current-status disagreements. Two event pairs collide on transition identity, but their value/provenance payloads differ; they are not exact duplicates. The report found zero payload-identical duplicates and zero deterministic repairs. No lifecycle disposition was written.

## Legacy checklists

`RequestUpdate` and checklist instances are canonical. The legacy 90-item population is retained until preview and operator review:

```sh
npm run compatibility:checklists:preview -w @pulse/api
PULSE_REPAIR_REPORT_DIGEST=<reviewed-digest> \
  npm run compatibility:checklists:apply -w @pulse/api
```

The 2026-07-22 production preview reviewed exactly 90 rows whose `checklistInstanceId` is null:

- 61 rows on five legacy-only requests can be re-parented to one canonical instance per request without recreating or deleting an item.
- 29 rows on `RQ-2026-1003` and `RQ-2026-1005` coexist with canonical items. Sixteen are payload-equivalent duplicates; 13 contain different completion provenance/state. All 29 require human review and are excluded from automatic apply.

The deterministic adapter therefore applies only the reviewed 61-row plan, records provenance, and leaves the other 29 untouched. Repeated execution is a no-op. Do not retire legacy tables until compatibility telemetry proves there are no consumers.
