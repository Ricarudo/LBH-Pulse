import assert from "node:assert/strict";
import test from "node:test";
import type { ItemRecord } from "@pulse/contracts/items";
import { builderCalculationInput, emptyBuilderWorkspace } from "@pulse/contracts/quote-builder";
import { calculateQuote } from "@pulse/quote-calculator";
import { fixtureConfiguration } from "../../../../packages/quote-calculator/src/fixtures";
import { applyBuilderBulk, builderPresentation, createBuilderLine, fractionText, percentText } from "./quoteBuilder";

test("Item defaults are copied without deriving production from legacy hours", () => {
  const item = { id: "item", name: "Cable", itemType: "PRODUCT", cost: 1, defaultLaborHours: 200, unitOfMeasure: "ft", description: "Catalog description", quoteDescription: "Proposal description" } as ItemRecord;
  const line = createBuilderLine("line", fixtureConfiguration(), 0, item);
  assert.equal(line.quantity, "0"); assert.equal(line.labor.productionRate, null); assert.equal(line.labor.crewSize, null);
  assert.equal(line.proposalDescription, "Proposal description");
  line.proposalDescription = "Edited in quote"; assert.equal(item.quoteDescription, "Proposal description");
  item.defaultProductionRate = 1500; item.defaultCrewSize = 4; item.defaultLaborClassId = "technician";
  assert.equal(createBuilderLine("next", fixtureConfiguration(), 1, item).labor.productionRate, "1500");
  item.defaultProductionRate = 0.00000001;
  assert.equal(createBuilderLine("small", fixtureConfiguration(), 2, item).labor.productionRate, "0.00000001");
  item.cost = 0;
  assert.equal(createBuilderLine("zero", fixtureConfiguration(), 3, item).material.baseUnitCost, "0");
  const custom = createBuilderLine("custom", fixtureConfiguration(), 0);
  assert.equal(custom.itemId, null); assert.equal(custom.mode, "MATERIAL_AND_LABOR");
});

test("bulk overwrite applies to selected or all applicable rows, without hidden inheritance", () => {
  const configuration = fixtureConfiguration(); const state = emptyBuilderWorkspace();
  state.lines = ["both", "material", "labor"].map(id => createBuilderLine(id, configuration, 0));
  state.lines[1].mode = "MATERIAL_ONLY"; state.lines[2].mode = "LABOR_ONLY";
  const selected = applyBuilderBulk(state, new Set(["material", "labor"]), "labor.crewSize", "4");
  assert.equal(selected.affected, 1); assert.equal(selected.skipped, 1); assert.equal(selected.state.lines[0].labor.crewSize, null);
  const all = applyBuilderBulk(state, null, "material.margin", "0.2");
  assert.equal(all.affected, 2); assert.equal(all.skipped, 1); assert.equal(all.state.lines[0].origins["material.margin"], "bulk");
  assert.equal(state.lines[0].material.margin, "0.3");
});

test("proposal/group adapter consumes calculated values and supports inactive Item identity", () => {
  const configuration = fixtureConfiguration(); const state = emptyBuilderWorkspace();
  const line = createBuilderLine("custom", configuration, 0); line.itemId = "inactive-reference"; line.mode = "MATERIAL_ONLY";
  line.material.baseUnitCost = "1"; line.quantity = "2"; state.lines = [line];
  const result = calculateQuote(builderCalculationInput(state, configuration));
  const group = builderPresentation(state, result)[0];
  assert.equal(group.total, "3.24"); assert.equal(group.lines[0].itemId, "inactive-reference"); assert.equal(result.status, "complete");
});

test("percentage input conversion preserves decimal precision", () => {
  for (const [fraction, percent] of [["0.115", "11.5"], ["0.04", "4"], ["0.00001", "0.001"], ["1.25", "125"], ["-0.025", "-2.5"]]) {
    assert.equal(percentText(fraction), percent);
    assert.equal(Number(fractionText(percent)), Number(fraction));
  }
  assert.equal(fractionText(""), null); assert.equal(percentText(null), "");
});

test("catalog facts are copied, mode changes retain values, and only explicit refresh replaces defaults", async () => {
  const { reapplyItemEstimatingDefaults } = await import("./quoteBuilder");
  const item = { id: "item", name: "Cable", itemType: "PRODUCT", status: "ACTIVE", sku: "SKU", partNumber: "PART", manufacturer: "Maker", brand: "Brand", category: "Network", subcategory: "Cable", cost: 1, taxable: true, primaryImageUrl: "/original.png", unitOfMeasure: "ft", quoteDescription: "Original description", productUrl: "https://example.test/product", datasheetUrl: "https://example.test/data", defaultProductionRate: 1500, defaultCrewSize: 4, defaultLaborClassId: "technician" } as ItemRecord;
  const line = createBuilderLine("line", fixtureConfiguration(), 0, item);
  const before = structuredClone(line);
  Object.assign(item, { name: "New", quoteDescription: "New", primaryImageUrl: "/new.png", manufacturer: "New", cost: 50, defaultProductionRate: 3, defaultCrewSize: 2, defaultLaborClassId: "specialist" });
  assert.deepEqual(line, before);
  const state = emptyBuilderWorkspace(); state.lines = [line];
  const view = builderPresentation(state, calculateQuote(builderCalculationInput(state, fixtureConfiguration())))[0].lines[0];
  assert.deepEqual(view.itemFacts, before.itemFacts); assert.equal(view.imageUrl, "/original.png");
  const updated = reapplyItemEstimatingDefaults({ ...line, mode: "MATERIAL_ONLY" }, item);
  assert.equal(updated.material.baseUnitCost, "50"); assert.equal(updated.labor.productionRate, "3");
  assert.equal(updated.mode, "MATERIAL_ONLY"); assert.equal(updated.name, "Cable"); assert.equal(updated.imageUrl, "/original.png");
  assert.deepEqual(updated.itemFacts, line.itemFacts);
  assert.equal(item.cost, 50);
  item.status = "INACTIVE";
  assert.throws(() => createBuilderLine("new", fixtureConfiguration(), 1, item), /inactive/);
  assert.throws(() => reapplyItemEstimatingDefaults(line, item), /inactive/);
  assert.equal(createBuilderLine("custom", fixtureConfiguration(), 0).itemFacts, null);
});

test("new lines use enabled Standard from configuration while preserving explicit Item classes", async () => {
  const { STANDARD_LABOR_CLASS_ID } = await import("@pulse/contracts/quote-builder");
  const configuration = fixtureConfiguration();
  configuration.laborClasses.push({ id: STANDARD_LABOR_CLASS_ID, name: "Standard", enabled: true, hourlyRate: "25" });
  const item = { id: "item", status: "ACTIVE", name: "Cable", itemType: "PRODUCT", defaultLaborClassId: null } as ItemRecord;
  const custom = createBuilderLine("custom", configuration, 0);
  const catalog = createBuilderLine("catalog", configuration, 1, item);
  for (const line of [custom, catalog]) {
    assert.equal(line.labor.laborClassId, STANDARD_LABOR_CLASS_ID);
    assert.equal(line.origins["labor.laborClassId"], "company");
  }
  custom.mode = "LABOR_ONLY"; custom.quantity = "2"; custom.labor.productionRate = "1"; custom.labor.crewSize = "1";
  const state = emptyBuilderWorkspace(); state.lines = [custom];
  assert.equal(calculateQuote(builderCalculationInput(state, configuration)).labor.directCost, "50");
  const original = structuredClone(custom);
  item.defaultLaborClassId = "specialist";
  const explicit = createBuilderLine("explicit", configuration, 2, item);
  assert.equal(explicit.labor.laborClassId, "specialist"); assert.equal(explicit.origins["labor.laborClassId"], "item");
  item.defaultLaborClassId = "unavailable";
  assert.equal(createBuilderLine("unavailable", configuration, 3, item).labor.laborClassId, "unavailable");
  configuration.laborClasses.find(role => role.id === STANDARD_LABOR_CLASS_ID)!.enabled = false;
  assert.equal(createBuilderLine("disabled", configuration, 4).labor.laborClassId, null);
  assert.deepEqual(custom, original);
  assert.equal(item.defaultLaborClassId, "unavailable");
});
