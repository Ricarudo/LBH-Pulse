# Pulse Quote Builder implementation plan and working-state contract

Implementation checkpoint 2026-11-11. This contract retains the approved calculation order and regression fixtures. Configuration canonicalization, explicit recovery/rounding results, strict persistence isolation, copied Item facts and the compact PULSE BOM interface are implemented. Verification and remaining release/visual limitations are recorded below.

This module constructs and calculates editable estimates inside the existing Quote Workspace. `QuoteBuilderWorkspace` is **non-authoritative working data**, not historical Quote financial truth. Saving it writes only its JSON document and optimistic concurrency token. It does not update Quote totals, QuoteItems, Item price history, Files, Updates, transitions, or any lifecycle records. The host's existing edit policy is checked by the service; the calculator does not receive lifecycle information.

Builder **is the PULSE BOM** for new estimates. The only calculation modes remain `LEGACY | PULSE`. The existing Legacy editor remains available; the previous QuoteItem editor is a compatibility path for already-populated PULSE quotes, not an equal future estimating implementation. New, empty PULSE workspaces use Builder. There is no automatic BOM/Legacy conversion. Existing mode switching retains its existing behavior, and does not delete Builder working data. Connecting calculated values to downstream lifecycle operations is a separate architectural dependency; this implementation does not define that connection.

## Boundaries

- `@pulse/contracts/quote-builder`: decimal-string inputs, nullable configuration, working document validation, explicit result and diagnostic contracts.
- `@pulse/quote-calculator`: pure deterministic arithmetic and isolated tax policy; no React, database, clock, Item lookup, or lifecycle dependency. All monetary calculations use an isolated decimal context. Input objects remain unchanged. Lines and indirect roles are evaluated in stable identifier order.
- API `modules/quote-builder`: current company configuration, labor classes, read/load, isolated saves, and optional server calculation verification.
- Web `modules/quotes/builder`: editing session, compact grouped rows, progressive disclosure, explicit bulk overwrites, financial summary, and Analysis. `builderPresentation` joins descriptions, quantities, Item/image references, group organization and calculated prices for future proposal consumption. Group aggregates never feed back into pricing.

All rates are fractions (`0.115` = 11.5%); quantities support three decimal places. Blank/null is distinct from explicit zero. Negative and incomplete estimating inputs can be saved, with calculator diagnostics distinguishing `invalid` and `incomplete`. Structurally malformed documents are rejected. Zero-quantity lines have no financial contribution and do not require labor inputs.

## Configuration and Item defaults

The existing WorkspaceSettings singleton holds the current calculation settings; labor classes are separately editable and may be disabled. Rates and costs without established defaults remain null. An explicit empty indirect-role list means no roles apply. No test-only vehicle, rent, insurance, labor-class or supervision rates are seeded into production.

The Builder loads configuration once per mounted editing session. The response includes a content-derived `configurationId`. Autosaves return only working inputs and a write token; tab changes, parent updates and focus do not refresh rates. Explicit workspace/page reload obtains current configuration. Existing line overrides and copied defaults remain line values; users may explicitly reapply loaded material defaults. Server calculation verification rejects an outdated configuration identifier instead of silently substituting rates.

### Complete, canonical configuration identity

`configurationId` identifies the complete calculation environment supplied to the calculator, not just the WorkspaceSettings row or its modification time. Include all fields of the validated calculation configuration: Quote calculation settings, labor classes and rates, class identifiers and enabled state, indirect roles and identifiers, weekly costs, allocation fractions, enabled state, and every other supplied value that can change calculator output. Retain configuration labels already carried by the contract, including role names returned in analysis. Unrelated WorkspaceSettings fields and database bookkeeping metadata are outside this calculation configuration.

Canonicalize before hashing:

1. Assemble one consistent read of current calculation settings and labor classes. Apply the existing schema's normalization and preserve every required field. Missing configuration remains explicit `null`; it must not become zero.
2. Normalize numeric decimal strings without binary floating-point conversion. Equivalent values such as `1`, `1.0`, and `01.000` share one canonical decimal representation; normalize signed zero to zero. Preserve `null` versus `0`, and an unconfigured indirect-role list (`null`) versus an explicitly empty list (`[]`). Do not coalesce distinct enabled/disabled states.
3. Sort labor classes, indirect roles and any future order-independent collections by stable identifier with a locale-independent comparator. Canonicalize nested objects and serialize object keys in a fixed order so property insertion order cannot affect identity. Reject duplicate identifiers through the configuration schema rather than selecting an arbitrary duplicate.
4. Hash the canonical serialization using the existing content-derived identifier mechanism. Do not include retrieval order, timestamps, random values or session state. Canonicalization must not mutate the supplied configuration. New calculation configuration fields must enter both canonicalization and mutation-coverage tests.

Semantically identical validated calculation environments must produce the same identifier. Calculation-relevant changes must change it, including values on disabled roles/classes that would be used when re-enabled. Server verification compares the supplied identifier to the identifier for the same consistent configuration read it will use to calculate. A mismatch returns the existing stale-configuration conflict and no substituted calculation. The open client session retains its loaded environment until explicit reload. No configuration history or lifecycle storage is introduced.

New Item fields are `defaultProductionRate`, `defaultCrewSize`, and `defaultLaborClassId`. Production rate means quantity units completed by the configured crew per ideal working hour. It is never derived from legacy labor-hours fields. Item selections copy defaults into the line, and editing a line description or rate does not edit the Item. Custom Lines have an immediately visible mode. Existing inactive Item references retain their copied inputs and receive a load warning; newly added inactive references are rejected.

## Explicit calculator status and diagnostics

The result contract exposes `status: "complete" | "incomplete" | "invalid"` independently of Quote lifecycle status.

| Status | Meaning | Representative cases |
| --- | --- | --- |
| `complete` | Every required input for the applicable calculation paths is present and valid. | Valid mixed, material-only, labor-only, empty and zero-value calculations; unused labor configuration does not block material-only work. |
| `incomplete` | The working document is structurally valid and saveable, but required estimating inputs are missing or unresolved. | Missing production rate, labor class or rate; disabled/unavailable labor class; lodging rate without usable duration; project costs with no recovery allocation base. |
| `invalid` | Supplied estimating values violate calculator rules or make a required mathematical operation invalid. | Prohibited negative values; nonpositive production rate or crew size for a positive-quantity labor line; margin at least `1`; out-of-range bounded fractions; mathematically undefined operations caused by invalid supplied values. |

Invalid diagnostics take precedence over incomplete diagnostics when both exist; preserve both sets of reasons. A deliberately unavailable allocation factor is `N/A`, not automatically an invalid division: a material-only quote with no labor-dependent cost can be complete. Missing divisors remain incomplete; prohibited supplied zero divisors are invalid where the calculation requires a positive value. Validate bounded fractions against their own domains (including tax rates and role allocations), without imposing fraction bounds on valid multipliers or changing approved cost-rate rules.

Diagnostics carry a stable code, category, field path, human-readable reason, and the relevant `lineId` for line-specific issues. Shared configuration issues identify the configuration field and affected line where applicable. Calculate without mutating the input, clearing values, or substituting defaults. Keep independent valid material results available when labor is incomplete or invalid.

Builder persistence accepts both incomplete and estimating-invalid documents if their structure is valid; it must not require `status === "complete"`. Existing authorization and concurrency checks remain. Structural problems such as malformed decimal serialization, duplicate identifiers, unknown fields, or invalid group references remain API validation errors. They do not become calculator diagnostics. Company settings validation remains its existing separate boundary.

## Calculation order

1. For each positive-quantity labor line: installation hours = quantity / production rate; direct labor hours = installation hours × crew size; direct cost = direct hours × labor-class hourly rate × overtime multiplier.
2. Effective crew = arithmetic mean of contributing line crew sizes. Ideal hours = sum of direct hours / effective crew. Practical hours = ideal hours × practical timeline factor; practical days = hours / 8; practical weeks = hours / 40. This preserves parallel-work intent.
3. Indirect labor = sum of practical weeks × enabled role weekly cost × allocation fraction. Add it to direct labor before payroll burden. Add burden before labor contingency.
4. Add practical-duration vehicle cost and total equipment rental to obtain pre-margin labor cost. Apply target margin by dividing by `1 - laborMargin`.
5. Add annual rent / 52 × practical weeks, annual bond/insurance / 52 × practical weeks, lodging, total travel, and Fondo (post-margin labor amount × Fondo rate).
6. Loaded labor / direct labor cost is the allocation multiplier, displayed as e.g. `6.0173×`. Allocate selling value proportionally to line direct costs; divide by quantity, round unit price upward to a cent, then extend by quantity.
7. Material unit value = base + base × contingency + base × freight + applicable base × Material IVU + material profit. Material profit = base / (1 - margin) - base; freight and IVU do not receive margin. Round the resulting unit price upward, then extend by quantity.
8. Material IVU (normally 11.5%) is already embedded. B2B / Service Tax (normally 4%) is applied separately to rounded customer labor value plus raw material profit and contingency. Do not add embedded IVU again.
9. Preserve precise fractional extensions and tax; round the final payable amount to two places. Analysis exposes raw unit values, upward-rounded customer units, extensions, and the final payable rounding adjustment.

Lodging headcount defaults to ceiling(effective crew); nights default to ceiling(practical days). Headcount may be explicitly overridden. With no direct labor allocation base, entered project costs remain visible and allocated/recovered costs are separately reported. A positive lodging rate without usable duration remains unresolved, rather than becoming zero. A material-only calculation can be independently complete while the overall quote remains incomplete because costs cannot be recovered.

### Incurred, recovered and unrecovered project costs

The calculator, rather than frontend arithmetic or inference from customer totals, owns and returns these explicit cost-basis amounts:

| Planned result field in `projectCosts` | Meaning |
| --- | --- |
| `incurredProjectCosts` | Raw project-cost amount represented by the current inputs and resolved cost calculations, before labor margin and customer unit rounding. |
| `recoveredProjectCosts` | That raw cost amount incorporated into customer pricing through a usable labor allocation. This is allocation within the estimate, not a payment or bookkeeping assertion. |
| `unrecoveredProjectCosts` | Incurred raw cost amount not incorporated into customer pricing. |

For resolved amounts, `unrecoveredProjectCosts = incurredProjectCosts - recoveredProjectCosts`. With entered travel of `120`, equipment rental of `100`, no lodging cost and no direct labor allocation base, the results are incurred `220`, recovered `0`, unrecovered `220`, factor `N/A`, and overall status `incomplete`. The entered inputs stay intact. Material calculations may remain independently complete.

Keep the raw entered inputs and known partial cost subtotal in the result. If lodging or another cost is unresolved, its value and any dependent total remain `null` with diagnostics; a known subtotal must not masquerade as a complete incurred total. Zero recovery may be reported when absence of an allocation base proves no recovery occurred; it does not imply the unresolved incurred amount is zero. When recovery itself cannot be determined, return `null`, not an assumed zero.

Retain the existing `enteredCostTotal`, `allocatedCostTotal`, `unallocatedCostTotal`, `knownEnteredCostTotal` and entered inputs for compatibility. Explicitly define the first three as matching the incurred/recovered/unrecovered cost-basis values; produce all aliases in the engine so they cannot drift. Keep unallocated loaded selling value separate from raw costs. Analysis presents entered inputs, incurred costs, recovered costs and unrecovered costs with distinct labels and clear unresolved states. No frontend subtraction or inference is needed.

### Labor allocation and upward-rounding reconciliation

Determine the precise labor selling target from the approved loaded-labor pipeline before allocation. For each eligible positive-quantity labor line, use the full-precision direct-cost proportion to derive its raw allocated selling total and raw unit value. The formatted allocation multiplier is display-only and must never be fed back into arithmetic.

```text
preciseLaborSellingTarget = Total Loaded Labor
rawAllocatedLineValue = preciseLaborSellingTarget × lineDirectCost / totalDirectCost
rawLaborUnit = rawAllocatedLineValue / lineQuantity
roundedLaborUnit = ceiling(rawLaborUnit × 100) / 100
roundedLaborExtension = roundedLaborUnit × lineQuantity
roundedCustomerLaborValue = sum(roundedLaborExtension)
laborAllocationRoundingDelta = roundedCustomerLaborValue - preciseLaborSellingTarget
```

Expose `preciseLaborSellingTarget`, `rawAllocatedLaborValue`, `roundedCustomerLaborValue`, and `laborAllocationRoundingDelta` explicitly within the labor result. Preserve existing `loadedTotal`, `rawSellingTotal`, `customerTotal`, per-line raw/rounded values and `roundingDifference`. Document `roundingDifference` as the sum of per-line rounding differences; the explicit target-based delta reconciles the rounded customer value to the precise target. Any finite-precision difference in the raw allocation sum stays visible in the supplied values; it must not be hidden by changing a line or rounding intermediate values to cents.

For a complete allocation, the target-based delta is nonnegative and may exceed one cent. Never redistribute pennies, designate a balancing line, force totals to equality, or use a rounded/display allocation factor. If required target/allocation amounts are unresolved or no allocation can recover positive costs, the corresponding reconciliation values remain unavailable rather than presenting a fabricated delta. Preserve valid all-zero results.

Analysis must show the precise target, raw allocation sum, raw allocated value and pre-round unit per line, upward-rounded units, customer extensions, their sum and the explicit delta. The delta is already part of rounded customer labor value; do not add it to the final total a second time. Continue the approved final-payable sequence and rounding.

### Exact B2B / Service Tax base

Make these operands explicit in the tax contract, with decimal-string values obtained from the engine:

```text
serviceTaxBase = roundedCustomerLaborValue + rawMaterialContingency + rawMaterialProfit
serviceTax = serviceTaxBase × serviceTaxRate
```

`roundedCustomerLaborValue` means the sum after per-line upward unit-price rounding and quantity extension. `rawMaterialContingency` and `rawMaterialProfit` are the material amounts before customer unit-price rounding. Material base cost, freight, embedded Material IVU and material unit-rounding uplift are not additional operands of this base. Material IVU is never taxed again as part of Service Tax.

Retain existing API fields `b2bTaxableBase`, `b2bServiceTaxRate`, and `b2bServiceTaxAmount` as the corresponding base, rate and tax. Add explicit raw contingency, raw profit and rounded labor operands to the tax result for reconciliation; `serviceTaxBase` and `serviceTax` above describe the existing B2B result semantics, not a second tax. Keep `materialIvuAmount` separate. Preserve the calculator's full decimal precision through the tax calculation without intermediate currency rounding; only the approved final-payable rounding applies. Neither the Builder UI nor a future Proposal view duplicates tax formulas.

## Persistence and API

`GET /api/quotes/:id/builder` is read-only and returns state, write token, loaded configuration/identifier, calculation and unavailable Item identifiers. `PUT` accepts `{state, expectedWriteToken}`. Concurrent saves serialize on the parent row lock, then reject stale tokens. It does not create parent mutations. Incomplete calculations are saveable. The frontend retains edits on failures/conflicts and offers explicit reload choices. Group disclosure and row selection stay in component state. Builder endpoints allow documents up to 8 MB; other endpoint body limits remain unchanged.

`POST /api/quotes/:id/builder/calculate` receives `{state, configurationId}`. Configuration lives behind `/api/settings/quote-calculation` and `/api/settings/labor-classes`, using existing settings permissions. Settings writes reject stale configuration identifiers. The additive `202610290001_quote_builder_workspace` migration must be deployed through the normal migration process before running the new API.

### Strict save isolation

A Builder `PUT` may read the parent Quote and acquire the existing `SELECT ... FOR UPDATE` parent row lock to serialize writes. A row lock is not a parent update. Perform writes directly through `QuoteBuilderWorkspace`, never via `quote.update`, a nested parent write, an empty parent update used as a lock, or ordinary Quote mutation services. Only the Builder document, its write token and its own persistence metadata may change.

Saving must leave all of the following unchanged: parent financial fields and totals; QuoteItems; revision records, revision data and counters; status and mode; lifecycle state, transition records and timestamps; `Quote.updatedAt`; Item records and price history; Files; Updates; and ordinary Quote audit/activity records. Check ORM hooks, extensions and database behavior as well as service code. If related writes would touch the parent timestamp or emit an ordinary Quote event, avoid that write path rather than restoring the timestamp after the fact. Stale-write rejection must leave both the Builder and all surrounding records unchanged.

No implicit synchronization from Builder results to authoritative Quote financial data is permitted. A possible future operation such as **Apply Builder to Quote Revision** is explicitly outside this plan. That future work would own decisions about authoritative record ownership, Quote Revision creation/update, Item history effects, lifecycle permissions, audit records and historical immutability. Do not add placeholder synchronization, callbacks, lifecycle handlers or persistence fields that pre-empt those decisions.

## Verification

Build contracts and calculator before app tests (`npm run typecheck` performs that sequence). `npm test` includes independent calculator tests, contracts, API and web tests. The calculator fixtures assert intermediate stages, parallel duration, allocation, tax bases, zero/missing/invalid inputs, fractional quantities and upward-rounding accumulation. Presentation reordering/group changes are regression-tested for identical financial output.

The test-only practical-duration aggregate fixture reproduces loaded labor `23495.329007125973` and allocation factor `6.017256389443409`; another aggregate check reconciles rounded customer totals. Individual supervision role allocations are explicitly synthetic and reproduce the reference combined allocation. These fixtures are not a claim of full row-by-row workbook parity; the original workbook and original individual role breakdown are not bundled here.

Run isolated PostgreSQL migration, persistence and Legacy regression checks without touching the running workspace database:

```sh
docker compose -f docker/ci/quote-builder.compose.yaml up --build --abort-on-container-exit --exit-code-from checks
docker compose -f docker/ci/quote-builder.compose.yaml down
```

This test stack has no published ports or persistent database volume. It verifies working-state round trips, concurrent save rejection, inactive Item retention, no parent-total or Item-history mutation, and existing Quote mode behavior.

### Required verification additions

Extend the existing suites; retain every approved test and reference fixture. These acceptance criteria are covered by the calculator, contract, adapter and database suites; interactive visual verification remains subject to the limitation below.

| Area / existing suite | Required additional assertions |
| --- | --- |
| Configuration identity — API config/service tests | Randomize database retrieval order for both labor classes and roles; reorder nested object keys; vary equivalent decimal spelling. All produce the same ID. The input configuration remains unchanged. |
| Configuration identity — mutation coverage | Mutate each calculation setting independently and each class/role's ID, rate/cost, allocation and enabled state, including disabled entries. Verify changed IDs, additions/removals, `null` versus explicit zero, and `null` role list versus `[]`. Include any returned-label/configuration field covered by the canonical contract. |
| Server verification | An old ID receives the stale-configuration conflict after a settings, class or role change. No calculation using a substituted environment is returned. Reordered/equivalently serialized configuration is accepted with the same ID. Autosave still returns no refreshed configuration. |
| Status and diagnostics — calculator/contracts | Table-driven complete/incomplete/invalid cases, including missing production/class/rate, unavailable class, unusable lodging duration, no cost-recovery base, negative values, zero/nonpositive production or crew, margin at least `1`, invalid bounded fractions and undefined required operations. Assert category, reason, field path and line identity, mixed-diagnostic precedence, independent material output and input immutability. |
| Saveable working data — contracts/API | Save and reload structurally valid incomplete and estimating-invalid documents without changing their values. Reject structural violations as API validation errors. Keep host permissions and concurrency checks intact. |
| Project costs — calculator/Analysis | Reconcile incurred, recovered and unrecovered costs with a usable allocation base and without one. Assert the `220 / 0 / 220` zero-labor example, saved entered inputs, partial known costs, and null unresolved totals. Verify compatibility aliases match and Analysis consumes returned values rather than inferring recovery. |
| Labor allocation — calculator/Analysis | Use multiple lines, unequal direct costs, fractional quantities, exact-cent units and non-cent units. Assert precise target, raw allocation proportions, each upward-rounded unit, extensions, summed customer labor and target-based delta. Reordering/group moves leave all quote-wide values unchanged. No balancing line or penny redistribution. |
| Exact Service Tax — tax/calculator | Assert each operand, full-precision base and multiplication. Use rounded customer labor rather than raw loaded labor, and raw contingency/profit rather than rounded material selling value. Assert no premature tax rounding. |
| Service Tax exclusions — focused paired fixtures | Change only freight, then only the Material IVU rate/applicability, keeping labor, raw material contingency and raw profit fixed. Material results change while Service Tax base and tax remain identical. This proves freight and embedded IVU are excluded, including cases where material unit rounding changes. |
| Persistence isolation — PostgreSQL integration | Before and after initial save and subsequent update, compare the complete parent row and explicitly assert unchanged `updatedAt`, all financial fields, revision counters/data, status, mode and lifecycle timestamps. Use a parent with nontrivial existing values to prevent vacuous checks. |
| Persistence side effects — PostgreSQL integration | Capture existing related revision, lifecycle/transition, audit/activity, Update, File, Item and Item-history rows, then compare contents and counts after saves. Assert no added or modified records. Account for fixture setup separately; Item deactivation used by another test must not be attributed to Builder save. |
| Concurrency and failed saves — PostgreSQL integration | Keep the successful concurrent-write/stale-token tests. Only one save succeeds; only the Builder token/document advances. Rejected saves and retries do not touch parent timestamps or create surrounding events/history. |

Focused labor fixture: use direct costs `1` and `2`, quantities `1` and `3`, zero configured overhead/margin/other costs, and travel `7`. The precise labor target is `10`; raw allocations are `10/3` and `20/3`; customer units are `3.34` and `2.23`; extensions are `3.34` and `6.69`; customer labor totals `10.03`; target-based delta is `0.03`. Compare repeating raw values at the calculator's declared decimal precision, without cent-rounding intermediates or using display formatting in assertions.

Focused tax fixture: rounded customer labor `100.01`, raw contingency `0.123456789`, raw profit `2.345678901`, and Service Tax rate `0.04` yield base `102.47913569` and tax `4.0991654276`. Add separate engine fixtures with nonzero freight and Material IVU to prove their exclusion. Keep the existing final-payable reference fixtures unchanged.

### Implementation and verification status

The calculator and contracts expose complete/incomplete/invalid status, precise labor target, raw allocated total, rounded labor total, target-based rounding delta and decimal precision residual. Tax returns the three Service Tax operands independently from embedded Material IVU. Project costs return explicit incurred/recovered/unrecovered values and unresolved cost names; compatibility fields remain available. The existing formula order and reference fixtures are unchanged.

Configuration identifiers validate and canonicalize the entire environment, normalize decimal spelling without binary arithmetic, sort keys and stable IDs, and preserve null/zero and enabled state. Tests mutate every setting and class/role field and verify stale IDs cannot be silently repriced.

Database tests compare the complete parent Quote, explicitly including `updatedAt`, with nonzero financial values and revision counters. Seeded revision, File, Update, activity, lifecycle and Item-history records remain identical through initial saves, updates and rejected conflicts. Item records remain unchanged by Builder saves; catalog edits are isolated fixture setup. Incomplete and estimating-invalid documents remain saveable. The isolated PostgreSQL stack passed all 25 checks before the additional class/role stale-ID unit case, which also passed separately.

Verification on 2026-10-30: 67 contract/calculator tests passed, 53 web tests passed, the full API suite passed (172 passed / 22 database-gated skips), API production compilation and API/web type checks passed, and both the Next production build and a clean web production Docker image build passed. The responsive breakpoint check passed. The subsequent class/role stale-ID case passed in the focused API suite. No existing fixture or compatibility test was removed.

The browser rendered the synthetic BOM fixture with copied identity, inactive-Item badge, quantity/mode controls, calculated unit/extension and financial summary. Screenshot capture and browser click automation timed out, so interactive visual verification is incomplete; rendering tests are not a substitute for that check.

The existing release-manifest suite has one failing release gate: the 0.1.2 release metadata lists seven migrations and this feature adds an eighth. Do not rewrite a historical release contract or weaken that guard to make a feature test green. Selecting the next release version and preparing its migration manifest remain release work.

## Versioned Item facts and the PULSE BOM surface

Working document v2 adds `schemaVersion: 2` and strict nullable `line.itemFacts`. The existing copied name, unit, proposal description and image reference remain line fields. `itemFacts` copies actual catalog fields: Item type, SKU, part number, manufacturer, brand, category/subcategory, product URL and datasheet URL. No catalog `model` property exists, so none is invented. Material/labor inputs and origins remain separate. Source catalog identity is `itemId`; current catalog lookups are never needed to reconstruct saved line presentation.

`readBuilderWorkspace` upgrades persisted v1 documents in memory without writing or fetching Items. Additional facts remain null rather than fabricated from the current catalog. The next normal save stores v2 and advances only the Builder write token/metadata. Unknown fields remain invalid in both versions. New API saves require the explicit v2 contract. The existing database version column is reused; no additional database migration is needed for this JSON upgrade.

Item selection copies presentation, estimating defaults and company material defaults. Subsequent catalog changes cannot alter the line. An explicit review/overwrite action can refresh only Item estimating defaults (cost, IVU applicability, production, crew, class), preserving quantity, mode, customer wording and copied presentation. Loaded company material defaults have their own explicit overwrite control. Editing line values never calls an Item write endpoint. Existing inactive references remain usable, while selecting an inactive Item onto a new line is rejected even if another saved line already references it.

The existing kit planner combines required/kit/optional relations with legacy default-labor-hours expansion. That legacy labor expansion must not be reused for crew-production Builder lines. Kit integration remains a selection-adapter boundary until parent/child labor and quantity-refresh behavior is specified: catalog selection → explicit expansion adapter → ordinary Builder lines → calculator. This pass adds individual Items only, and does not query ItemRelation from the engine.

The primary surface uses shared CSS Grid columns for headers/rows, thumbnails with neutral placeholders, copied identity, quantity/unit, explicit mode, calculator-returned combined unit sell and extension. Expanded rows contain material/labor controls, field diagnostics, organization and explicit defaults actions. Collapse state is local. Bulk tools overwrite applicable selected/all inputs deliberately. Project costs and detailed Analysis expand in place; Work's Analysis navigation remains available. Financial summary is below the full-width editor, aligned right on desktop. Proposal remains minimal. No global shell or Files/Updates behavior changed.

## Future financial publication boundary — design only

Builder autosave and calculation verification do not publish financial content. A future server operation must load the saved Builder state, validate its write identity and configuration identity, obtain the exact effective configuration, and run the calculator server-side. Browser totals are never publication input.

That boundary must eventually bind saved Builder identity, configuration ID and effective configuration, engine/policy version, full result, normalized QuoteFinancialSummary, copied Item/presentation content, commercial content identity, actor and time. It must preserve exact image/file evidence as required by the eventual lifecycle policy; copying an image URL into working data is not immutable asset retention.

Builder-generated published PULSE content must feed a precision-preserving adapter into the same normalized financial reader used by details, lists, dashboards, analytics, proposals, send records and accepted project baselines. Do not coerce its precise results through the old two-decimal QuoteItem arithmetic. Existing populated QuoteItem quotes retain their compatibility reader. There must be one authoritative result per commercial content identity, with no new BUILDER mode or financial-source enum. No publication storage, synchronization, revision, send, audit or Item-history behavior is implemented here.

## Workspace package repair and local database setup

The module-resolution failure came from running development containers built before the calculator workspace existed: new web source was bind-mounted, but the container had neither the calculator directory/link nor updated root build scripts. Host resolution and the calculator export were already valid. Rebuilt both app images with `npm ci`, recreated only API/web with unchanged environment values, and verified the calculator resolves inside the web container. No data volumes were reset.

`@pulse/quote-calculator` now declares an explicit root types/runtime export. Direct web dev/build/typecheck/test scripts prepare contracts and calculator through root `build:shared`. Runtime utilities are ordinary browser/server-compatible decimal code; there are no Node-only dependencies in the calculator import path.

The additive `202610290001_quote_builder_workspace` migration passed isolated PostgreSQL verification and was applied to the local development database on 2026-10-30. It creates working-state/configuration infrastructure and nullable Item defaults; it does not publish totals, alter Quote lifecycle records, or seed regression rates. Future deployments must still build/install workspaces and apply their approved release migrations.


## Standard labor class

The user explicitly approved a default **Standard** class at **$25/hour** on 2026-10-30. Migration `202610300001_standard_labor_class` inserts its stable `standard` identity without overwriting existing configuration. The rate remains editable through Company labor classes and is supplied to the calculator through normal configuration; it is not hardcoded into arithmetic. This approved value is independent of the test-only fixture rates.

New Builder lines use enabled Standard only when there is no Item-specific labor class. Their class origin is marked Company default. Existing line selections and Item defaults remain untouched; disabled or unavailable explicit Item class references are retained for diagnostics. Disabling Standard stops it being selected for new lines. An open editing session receives the new class/rate only after an explicit reload, consistent with configuration identity and session pinning.

## Explaining unresolved labor selling prices

A valid line production rate, crew and hourly rate can produce direct labor while company overhead configuration remains incomplete. For the reported camera example (quantity 1, material cost 499, production 2, crew 2, rate 25), the engine returns material unit selling value 807.67, installation 0.5 hours and direct labor 1 hour / 25. Missing supervision, vehicle weekly cost, annual rent and annual bond/insurance correctly leave loaded labor and the final price unresolved.

The Builder now presents those engine diagnostics as a visible company-settings checklist with human-readable field/role/class names. Affected expanded rows explain why labor pricing is pending; collapsed rows retain known material unit values and label the pending extension. Settings open in another tab to retain the editing session. After saving settings, an explicit workspace reload is still required. No calculation formulas or configuration values are changed by the notice, and blanks remain distinct from explicitly configured zero/no roles. Regression tests cover the reported inputs, explicit zero-cost completion, material-only independence, and the distinction between unresolved service tax and unresolved labor pricing.

## Checkpoint for the next database branch — 2026-11-11

This checkpoint preserves the implementation developed in the Quote Builder conversation:

- `packages/contracts/src/quote-builder.ts`: strict versioned working documents, copied Item facts, calculation configuration and result contracts; read compatibility for v1 documents.
- `packages/quote-calculator`: React/database-independent decimal arithmetic, exact tax operands, parallel duration, project-cost recovery, upward unit rounding and intermediate regression fixtures.
- `apps/api/src/modules/quote-builder`: isolated working-state saves, write conflicts, read-only server calculation verification, canonical configuration identity, and current company settings/labor-class services.
- Builder migrations and Prisma relations: `QuoteBuilderWorkspace`, `QuoteLaborClass`, estimating defaults on Items, calculation settings on WorkspaceSettings, and explicitly approved Standard labor at 25/hour. Legacy Item labor-hour fields remain separate.
- `apps/web/src/modules/quotes/builder`, adapters, settings and CSS: grouped PULSE BOM editing, catalog copies, Custom Lines, explicit bulk/default overwrites, quiet autosave/conflicts, pinned configuration, financial summary, Analysis, and actionable missing-settings notices.
- Existing Quote Workspace integration: Builder is the new empty PULSE estimating path; populated QuoteItem BOMs retain their compatibility editor, Legacy remains available, and Proposal remains minimal.
- Workspace manifests, lockfile, Dockerfiles and Compose: the calculator package is built and available to both API and Next.js client/server imports; the isolated PostgreSQL stack verifies persistence and compatibility.

The API model/service comments and this document define the ownership boundary: saving Builder inputs does not publish Quote totals or mutate QuoteItems, Item history, revisions, lifecycle state, Files, Updates, activity records, or the parent Quote timestamp. The future authoritative financial publication operation remains design-only; [the database integration reference](releases/0.2-calculator-database-integration-reference.md) records the separate architectural decisions still required.

The client-preferences changes found in the same working tree are preserved in a separate checkpoint, with their own [migration and implementation notes](client-preferences-working-state.md). They are not part of the Builder calculation document or persistence path. No running application database migration is applied by this source-control checkpoint.

Fresh verification for the combined working tree on 2026-11-11:

| Check | Result |
| --- | --- |
| Contract and calculator unit tests | 70 passed |
| API unit/service tests | 173 passed; 23 database-gated tests skipped in the ordinary unit run |
| Web tests | 57 passed |
| Isolated PostgreSQL Builder/Item/quote-compatibility stack | 27 passed; all 10 migration directories applied to the disposable database |
| Shared packages, API type/script checks and production compilation | Passed |
| Next.js production build, including TypeScript | Passed |
| Responsive breakpoint and shipped-secret checks | Passed |
| Release-manifest suite | 2 passed, 1 failed: historical 0.1.2 metadata does not enumerate the new migrations |

The release-manifest failure is a remaining release-packaging task, not a successful release validation. Prepare the next release's version/upgrade manifest before deployment; keep the historical contract intact. Prior interactive visual verification limitations still apply. The company vehicle/rent/bond/supervision values remain unresolved until explicitly configured; this checkpoint does not silently assign zero. Kit expansion, full Proposal authoring and authoritative financial publication remain outside this completed working-state implementation.
