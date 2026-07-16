# Quote Builder v0.1

Pulse supports two calculation modes on the same Quote record.

- `LEGACY` stores material sale, material cost, labor sale, labor cost, tax, and an optional integer duration in business days. It never creates synthetic BOM lines.
- `PULSE` derives revenue, cost, and tax from QuoteItems. Legacy summary columns are ignored in this mode.

The API's quote financial normalizer is the authoritative calculation path for quote responses, lifecycle analytics snapshots, revision snapshots, and project conversion. `Quote.total` is a compatibility/display column containing the final customer total; clients cannot write it directly. Tax is excluded from revenue, gross profit, margin, markup, and the project operating budget.

Zero revenue produces no gross-margin percentage, and zero estimated cost produces no markup percentage. These values are returned as `null` and displayed as an em dash.

## Mode changes

A quote can change mode only while it is a Draft and has no project. Empty drafts switch directly. A nonempty quote requires `discardFinancialData: true`; this deletes QuoteItems or clears Legacy values. Pulse does not convert Legacy summaries into line items.

The UI and API keep manual Legacy creation as a discrete choice so a later workspace policy can hide that creation path without changing existing Legacy records or imported Legacy records.

## Existing-data backfill

The migration and idempotent backfill follow these rules:

1. Quotes with QuoteItems are `PULSE`, including historical synthetic lines that are already treated as normal development data.
2. Quotes with no items and a positive historical total are reported as Legacy candidates and map that total to material sale.
3. Empty, no-item quotes remain `PULSE` drafts.
4. Conflicting Legacy quotes with items are reported for review and are not silently reinterpreted by the script.

Preview before applying in an existing environment:

```sh
npm run db:quote-financials:preview -w @pulse/api
npm run db:quote-financials:apply -w @pulse/api
```

`db:push` applies the idempotent backfill after schema synchronization. The SQL migration contains the equivalent deployment-time classification.

## Project handoff

Project conversion accepts either mode and stores a source quote/revision/mode financial snapshot. The project budget is the pre-tax contract value. A due date is never inferred from estimated duration without an explicit start-date scheduling policy.
