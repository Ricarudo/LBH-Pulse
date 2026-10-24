# Dashboard list standard

Dashboard controls live in `apps/web/src/components/lists/ListControls.tsx` and its CSS module. `useDashboardList` owns browser-local view/sort preferences and temporary URL search/filter state. Screen definitions supply their own fields, access-scoped options, value readers, and business views. Lifecycle definitions are shared by Requests, Quotes, Projects, Billing, and client work.

## Compact sorting

The closed sort control is **88 × 44 px**, alongside the **44 × 44 px** filter icon. Both triggers open the shared native modal dialog shell: anchored at 360 px (Sort) or 480 px (Filter) on desktop, and a bottom sheet below 768 px. Sort lists each field once as a native radio. Direction radios and the draft summary stay above the fixed Cancel/Apply footer. Changing a field selects its default direction. Apply commits `sort` and `dir` once; Cancel, Escape, outside dismissal, and the close button discard drafts. Reset sorting changes only the draft sort. The selected full description is available on hover and when reopened.

Use meaningful direction labels: Updated → most/least recently updated; dates → earliest/latest first; priority → urgent first/low to urgent; money → highest/lowest first; names → A–Z/Z–A. Workflow status sorts use the module's defined status order, not alphabetic status labels.

Operational options include next-action targets for Requests/Quotes, received/sent dates, project start, invoice issued date, created date, client, owner, record number, and monetary value where supported. Directories expose supported name/client/site/location/owner/value choices. Items keeps server-side name, updated-date, and sell-price sorting. Home retains contextual priority; Analytics sorts server-side before pagination.

Missing values remain last in both directions. Record IDs break ties deterministically. Quote numbers are independent of the originating request number.

## Performance

Reuse `Intl.Collator` and timezone date formatters; constructing them for every comparison or row is expensive. Memoize screen definitions against their actual data dependencies, and memoize applied rows against definition/data/state/user/timezone changes. URL synchronization must not replace equal state and cause a second full list pass. Relative date ranges refresh across workspace-local midnight.

A local synthetic 5,000-row benchmark averaged roughly 155 ms for a sort and 306 ms with a date filter before formatter reuse, versus 34–35 ms afterward (five passes). This measures list computation, not end-to-end app latency. The running Docker web service uses `next dev`; cold compilation and hot reload can add latency independently of list processing.

## Filtering and persistence

Filter sections are accordions, with one expanded at a time and selection summaries on their headers. Status opens initially where available; other lists open their first field. Search is shown only for fields with more than eight options. Multi-select fields use checkboxes; single-select fields use radios including Any. The native modal makes background content inert. Filter focuses its title, Sort focuses its selected field, Tab wraps inside the popup, and dismissal returns focus to the invoking trigger. Only one shared list popup may be active.

Filter changes are draft-only until Apply. Cancel, outside click, and Escape discard them. Reset restores list defaults and clears temporary search/filter state when applied. Selecting statuses outside the active status view widens to All with an explanation before Apply. OR applies within a field; AND applies across fields. Date ranges use workspace-local inclusive calendar days.

Save only view/sort/direction under a user-and-list storage key. Explicit URL values take precedence. Preserve unrelated route parameters and client/report context. Repeated query keys represent multiple selections; single-value legacy links still work. Storage failure must not disable the list.

Items filters and ordering run before its 200-result cap. Home work filters run before its 50-item display cap. Analytics preserves reporting context, server filtering, and 25-record drilldown pages. Do not add client-side filtering to a partial server page and describe it as a complete search.

## Verification

`listState.spec.ts` covers combinations, timezone boundaries, scope widening, URL precedence, missing dates, stable ordering, and combined sort labels. `scripts/list-tests/browser.cjs` runs fixture-only headless browser checks against the Docker-served app. `scripts/list-tests/popups.cjs` runs the focused Sort/Filter checks at 390, 768, and 1440 px, including draft behavior, atomic URL updates, refresh, keyboard navigation, accordion search, date validation, and 200% zoom. It saves paired screenshots under `/tmp/pulse-popup-screens` in the test container. It never submits real account credentials or changes application records.

## Accessibility references

The shared shell follows [WAI modal dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and [radio-group guidance](https://www.w3.org/WAI/ARIA/apg/patterns/radio/). Interactive rows retain 44 px targets, above the [WCAG 2.2 AA target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). These are implementation targets, not a claim of complete WCAG conformance.
