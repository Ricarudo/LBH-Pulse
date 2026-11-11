import assert from "node:assert/strict";
import test from "node:test";
import { builderWorkspaceSchema, calculationSettingsSchema, emptyBuilderWorkspace, saveBuilderSchema } from "./quote-builder";

test("working state accepts empty inputs and excludes transient disclosure and lifecycle fields", () => {
  const state = emptyBuilderWorkspace();
  assert.deepEqual(builderWorkspaceSchema.parse(state), state);
  assert.equal(builderWorkspaceSchema.safeParse({ ...state, collapsedGroups: [] }).success, false);
  assert.equal(builderWorkspaceSchema.safeParse({ ...state, sent: false }).success, false);
  assert.equal(saveBuilderSchema.safeParse({ state, expectedWriteToken: null }).success, true);
});
test("unknown company costs remain null and zero is a separate explicit value", () => {
  const settings = Object.fromEntries(Object.keys(calculationSettingsSchema.shape).map(key => [key, null]));
  const parsed = calculationSettingsSchema.parse(settings);
  assert.equal(parsed.vehicleWeeklyCost, null);
  assert.equal(parsed.indirectRoles, null);
  assert.equal(calculationSettingsSchema.parse({ ...settings, vehicleWeeklyCost: "0", indirectRoles: [] }).vehicleWeeklyCost, "0");
  assert.equal(calculationSettingsSchema.safeParse({ ...settings, laborMargin: "1" }).success, false);
});

test("v1 documents upgrade without catalog reconstruction and v2 facts stay strict", async () => {
  const { readBuilderWorkspace, builderLineSchema } = await import("./quote-builder");
  const line = { id: "old", itemId: "catalog", name: "Copied old name", unit: "ft", proposalDescription: "Copied description", imageUrl: "/old-image", groupId: null, order: 0, quantity: "-1", mode: "MATERIAL_ONLY", origins: {}, material: { baseUnitCost: null, contingency: null, freight: null, margin: "1", materialIvuEnabled: false, materialIvuRate: null }, labor: { laborClassId: null, productionRate: null, crewSize: null, overtimeMultiplier: null } };
  const { schemaVersion, ...old } = emptyBuilderWorkspace();
  const upgraded = readBuilderWorkspace({ ...old, lines: [line] }, 1);
  assert.equal(upgraded.schemaVersion, 2);
  assert.deepEqual(upgraded.lines[0], { ...line, itemFacts: null });
  assert.deepEqual(readBuilderWorkspace(upgraded, 2), upgraded);
  assert.equal(builderLineSchema.safeParse({ ...upgraded.lines[0], itemFacts: { inventedModel: "no" } }).success, false);
  assert.throws(() => readBuilderWorkspace({ ...old, unexpected: true }, 1));
  assert.throws(() => readBuilderWorkspace(upgraded, 3));
});
