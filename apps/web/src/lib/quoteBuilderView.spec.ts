import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { builderCalculationInput, emptyBuilderWorkspace } from "@pulse/contracts/quote-builder";
import { calculateQuote } from "@pulse/quote-calculator";
import { fixtureConfiguration } from "../../../../packages/quote-calculator/src/fixtures";
import { BuilderRow } from "../modules/quotes/builder/BuilderRow";
import { BuilderConfigurationNotice } from "../modules/quotes/builder/BuilderConfigurationNotice";
import { QuoteAnalysis } from "../modules/quotes/builder/QuoteAnalysis";
import { createBuilderLine } from "./quoteBuilder";

const noop = () => {};
test("Custom material-only line shows its mode, unit selling value and editable details without requiring labor", () => {
  const configuration = fixtureConfiguration(); const state = emptyBuilderWorkspace();
  const line = createBuilderLine("custom", configuration, 0); line.mode = "MATERIAL_ONLY"; line.quantity = "0.125"; line.material.baseUnitCost = "1"; state.lines = [line];
  const result = calculateQuote(builderCalculationInput(state, configuration));
  const html = renderToStaticMarkup(createElement(BuilderRow, { line, result: result.lines[0], configuration, groups: [], canEdit: true, unavailable: false, diagnostics: result.diagnostics, selected: false, onSelect: noop, expanded: true, onExpand: noop, patch: noop, onMove: noop, onRemove: noop }));
  assert.match(html, /Custom/); assert.match(html, /selected="">Material Only/);
  assert.match(html, /\$1\.62/); assert.match(html, /\$0\.2025/);
  assert.match(html, /Proposal description/); assert.match(html, /Base unit cost/);
  assert.doesNotMatch(html, /Choose an active class/);
  assert.equal(result.status, "complete");
});

test("Analysis presents recovery and exact reconciliation directly from the engine", () => {
  const configuration = fixtureConfiguration(); const state = emptyBuilderWorkspace(); state.projectCosts.travelTotal = "120";
  const result = calculateQuote(builderCalculationInput(state, configuration));
  const html = renderToStaticMarkup(createElement(QuoteAnalysis, { state, result }));
  for (const label of ["Precise labor selling target", "Raw allocated line value", "Labor allocation / rounding delta", "Unrecovered project costs", "Raw material contingency operand", "Raw material profit operand", "B2B / Service Tax base", "Payable rounding adjustment"]) assert.ok(html.includes(label), label);
  assert.match(html, /N\/A/); assert.match(html, /\$120/);
  assert.equal(result.status, "incomplete"); assert.equal(result.totals.finalPayableTotal, null);
});

test("valid line inputs explain shared settings that block labor pricing without hiding calculated material and direct labor", () => {
  const configuration = fixtureConfiguration();
  Object.assign(configuration, { indirectRoles: null, vehicleWeeklyCost: null, annualRent: null, annualBondInsurance: null });
  const state = emptyBuilderWorkspace();
  const line = createBuilderLine("camera", configuration, 0);
  line.name = "AI LPR"; line.quantity = "1"; line.material.baseUnitCost = "499";
  Object.assign(line.labor, { laborClassId: "technician", productionRate: "2", crewSize: "2" });
  state.lines = [line];
  const result = calculateQuote(builderCalculationInput(state, configuration));
  const lineIssues = result.diagnostics.filter(issue => issue.lineId === line.id);
  assert.deepEqual(lineIssues, []);
  const props = { line, result: result.lines[0], configuration, groups: [], canEdit: true, unavailable: false, diagnostics: lineIssues, quoteDiagnostics: result.diagnostics, selected: false, onSelect: noop, expanded: true, onExpand: noop, patch: noop, onMove: noop, onRemove: noop };
  const html = renderToStaticMarkup(createElement(BuilderRow, props));
  for (const text of ["Labor pricing pending", "Vehicle weekly cost", "Annual rent", "Annual bond / insurance", "Indirect labor / supervision roles", "Reload workspace", "$807.67", "$25.00"]) assert.ok(html.includes(text), text);
  assert.match(html, /href="\/settings\/quote-calculation" target="_blank"/);
  assert.doesNotMatch(html, /configuration\.annualRent|\$0\.00/);
  assert.equal(result.totals.finalPayableTotal, null);

  const collapsed = renderToStaticMarkup(createElement(BuilderRow, { ...props, expanded: false }));
  assert.match(collapsed, /Labor pending/);
  assert.match(collapsed, /Material \$807\.67/);

  line.mode = "MATERIAL_ONLY";
  const materialOnly = calculateQuote(builderCalculationInput(state, configuration));
  const materialHtml = renderToStaticMarkup(createElement(BuilderRow, { ...props, result: materialOnly.lines[0], quoteDiagnostics: materialOnly.diagnostics }));
  assert.equal(materialOnly.status, "complete");
  assert.doesNotMatch(materialHtml, /Labor pending|Labor pricing pending|Open calculation settings/);
});

test("settings notice names roles and classes, deduplicates shared rate issues, and preserves invalid severity", () => {
  const configuration = fixtureConfiguration();
  const rate = { code: "INPUT_REQUIRED", category: "incomplete" as const, path: "configuration.laborClasses.technician.hourlyRate", message: "Not configured." };
  const html = renderToStaticMarkup(createElement(BuilderConfigurationNotice, { configuration, diagnostics: [
    { ...rate, lineId: "a" }, { ...rate, lineId: "b" },
    { code: "INVALID_VALUE", category: "invalid", path: "configuration.indirectRoles.manager.allocationPercent", message: "Fraction must be between zero and one." }
  ] }));
  assert.equal(html.match(/Technician · hourly rate/g)?.length, 1);
  assert.match(html, /Fixture management · allocation/);
  assert.match(html, /qb-configuration-notice invalid/);
  assert.match(html, /Fraction must be between zero and one/);
  assert.doesNotMatch(html, /configuration\./);
});

test("an unresolved Service Tax rate does not imply unresolved line labor pricing", () => {
  const configuration = fixtureConfiguration(); configuration.b2bServiceTaxRate = null;
  const state = emptyBuilderWorkspace(); const line = createBuilderLine("labor", configuration, 0);
  line.mode = "LABOR_ONLY"; line.quantity = "1";
  Object.assign(line.labor, { laborClassId: "technician", productionRate: "2", crewSize: "2" }); state.lines = [line];
  const result = calculateQuote(builderCalculationInput(state, configuration));
  const html = renderToStaticMarkup(createElement(BuilderRow, { line, result: result.lines[0], configuration, groups: [], canEdit: true, unavailable: false, diagnostics: [], quoteDiagnostics: result.diagnostics, selected: false, onSelect: noop, expanded: true, onExpand: noop, patch: noop, onMove: noop, onRemove: noop }));
  assert.notEqual(result.lines[0].customerTotal, null);
  assert.equal(result.totals.finalPayableTotal, null);
  assert.doesNotMatch(html, /Labor pricing pending|Labor pending/);
  const notice = renderToStaticMarkup(createElement(BuilderConfigurationNotice, { configuration, diagnostics: result.diagnostics }));
  assert.match(notice, /B2B \/ Service Tax rate/);
});
