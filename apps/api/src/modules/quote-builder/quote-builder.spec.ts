import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import type { PrismaClient } from "@/generated/prisma/client";
import { emptyBuilderWorkspace, type CalculationConfiguration } from "@pulse/contracts/quote-builder";
import { QuoteBuilderService } from "./quote-builder.service";
import { CalculationConfigService, configurationIdentifier } from "./calculation-config.service";
import { initialCalculationSettings } from "./calculation-settings";

function setup() {
  let saved: { quoteId: string; state: unknown; writeToken: number; schemaVersion: number } | null = null;
  const quote = { id: "q", archivedAt: null, status: "Draft", sentAt: null, calculationMode: "PULSE" };
  const configuration: CalculationConfiguration = { ...initialCalculationSettings, laborClasses: [] };
  let bomCount = 0;
  // Deliberately no writers for Quote, Item, Updates, Files, or lifecycle tables.
  const db = {
    quote: { findUnique: async () => quote }, quoteItem: { count: async () => bomCount },
    $queryRaw: async () => [{ id: "q" }],
    quoteBuilderWorkspace: {
      findUnique: async () => saved,
      create: async ({ data }: { data: { quoteId: string; state: unknown } }) => saved = { ...data, writeToken: 1, schemaVersion: 2 },
      update: async ({ data }: { data: { state: unknown } }) => saved = { ...saved!, state: data.state, writeToken: saved!.writeToken + 1 }
    },
    $transaction: async <T>(callback: (tx: unknown) => T) => callback(db)
  };
  const config = { read: async () => ({ configuration: structuredClone(configuration), configurationId: configurationIdentifier(configuration) }) } as CalculationConfigService;
  return { service: new QuoteBuilderService(db as unknown as PrismaClient, config), configuration, quote, setBomCount: (n: number) => { bomCount = n; }, getSaved: () => saved };
}

test("load is read-only and isolated saves round-trip incomplete working state", async () => {
  const ctx = setup();
  const loaded = await ctx.service.load("q");
  assert.equal(ctx.getSaved(), null);
  const state = emptyBuilderWorkspace(); state.projectCosts.travelTotal = "120";
  const saved = await ctx.service.save("q", { state, expectedWriteToken: loaded.writeToken });
  assert.equal(saved.writeToken, 1);
  assert.deepEqual(Object.keys(saved).sort(), ["state", "writeToken"]);
  const reopened = await ctx.service.load("q");
  assert.deepEqual(reopened.state, state);
  assert.equal(reopened.calculation.status, "incomplete");
  assert.equal(reopened.calculation.projectCosts.allocatedCostTotal, "0");
});

test("configuration changes never silently reprice a calculation request or input save", async () => {
  const ctx = setup(); const loaded = await ctx.service.load("q");
  ctx.configuration.materialIvuRate = "0.12";
  await assert.rejects(ctx.service.calculate("q", loaded.state, loaded.configurationId), error => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "BUILDER_CONFIGURATION_CHANGED");
  const saved = await ctx.service.save("q", { state: loaded.state, expectedWriteToken: null });
  assert.equal("configuration" in saved, false);
  assert.equal(loaded.configuration.materialIvuRate, "0.115");
  assert.equal((await ctx.service.load("q")).configuration.materialIvuRate, "0.12");
});

test("stale saves, existing BOMs, and host edit restrictions are respected", async () => {
  const ctx = setup(); const state = emptyBuilderWorkspace();
  ctx.setBomCount(1);
  await assert.rejects(ctx.service.save("q", { state, expectedWriteToken: null }), /existing BOM/);
  ctx.setBomCount(0);
  await ctx.service.save("q", { state, expectedWriteToken: null });
  await assert.rejects(ctx.service.save("q", { state, expectedWriteToken: null }), error => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "BUILDER_WRITE_CONFLICT");
  ctx.quote.status = "Sent";
  await assert.rejects(ctx.service.save("q", { state, expectedWriteToken: 1 }), /existing Quote policy/);
  assert.equal(ctx.getSaved()?.writeToken, 1);
});

test("configuration identifiers cover rates and availability, not array ordering", () => {
  const configuration: CalculationConfiguration = { ...initialCalculationSettings, laborClasses: [
    { id: "a", name: "A", enabled: true, hourlyRate: "10" }, { id: "b", name: "B", enabled: true, hourlyRate: null }
  ] };
  const first = configurationIdentifier(configuration);
  configuration.laborClasses.reverse(); assert.equal(configurationIdentifier(configuration), first);
  configuration.laborClasses[0].enabled = false; assert.notEqual(configurationIdentifier(configuration), first);
});

test("production settings do not contain regression-only rates or implicit zero costs", () => {
  assert.equal(initialCalculationSettings.materialIvuRate, "0.115");
  assert.equal(initialCalculationSettings.b2bServiceTaxRate, "0.04");
  for (const key of ["vehicleWeeklyCost", "annualRent", "annualBondInsurance", "indirectRoles"] as const) assert.equal(initialCalculationSettings[key], null);
});

test("complete configuration identity is canonical and sensitive to every environment field", () => {
  const configuration: CalculationConfiguration = { ...initialCalculationSettings, laborClasses: [{ id: "b", name: "B", enabled: false, hourlyRate: "10" }, { id: "a", name: "A", enabled: true, hourlyRate: "20" }], indirectRoles: [{ id: "b", name: "B", enabled: false, weeklyCost: "100", allocationPercent: "0.2" }, { id: "a", name: "A", enabled: true, weeklyCost: "200", allocationPercent: "0.3" }] };
  const first = configurationIdentifier(configuration);
  const equivalent = structuredClone(configuration);
  equivalent.laborClasses.reverse(); equivalent.indirectRoles!.reverse();
  equivalent.laborClasses[1].hourlyRate = "0010.000";
  equivalent.indirectRoles![1].allocationPercent = "00.20000";
  assert.equal(configurationIdentifier(Object.fromEntries(Object.entries(equivalent).reverse()) as CalculationConfiguration), first);
  for (const key of Object.keys(initialCalculationSettings) as Array<keyof typeof initialCalculationSettings>) {
    const changed = structuredClone(configuration);
    if (key === "indirectRoles") changed.indirectRoles = [];
    else changed[key] = changed[key] === null ? "0" : changed[key] === "0.2" ? "0.3" : "0.2";
    assert.notEqual(configurationIdentifier(changed), first, key);
  }
  for (const collection of ["laborClasses", "indirectRoles"] as const) {
    for (const field of Object.keys(configuration[collection]![0])) {
      const changed = structuredClone(configuration);
      const row = changed[collection]![0] as unknown as Record<string, unknown>;
      row[field] = field === "enabled" ? true : field === "id" || field === "name" ? "different" : "0.123";
      assert.notEqual(configurationIdentifier(changed), first, `${collection}.${field}`);
    }
  }
  const zero = { ...configuration, vehicleWeeklyCost: "0" };
  assert.equal(configurationIdentifier({ ...zero, vehicleWeeklyCost: "-0.000" }), configurationIdentifier(zero));
  assert.notEqual(configurationIdentifier(zero), first);
});

test("server verification rejects class/role changes and accepts equivalent environments", async () => {
  const ctx = setup();
  ctx.configuration.laborClasses = [{ id: "a", name: "A", enabled: true, hourlyRate: "10" }];
  ctx.configuration.indirectRoles = [{ id: "r", name: "Role", enabled: true, weeklyCost: "100", allocationPercent: "0.2" }];
  const loaded = await ctx.service.load("q");
  ctx.configuration.laborClasses[0].hourlyRate = "0010.00";
  assert.equal((await ctx.service.calculate("q", loaded.state, loaded.configurationId)).configurationId, loaded.configurationId);
  ctx.configuration.laborClasses[0].enabled = false;
  await assert.rejects(ctx.service.calculate("q", loaded.state, loaded.configurationId), ConflictException);
  ctx.configuration.laborClasses[0].enabled = true;
  ctx.configuration.indirectRoles[0].weeklyCost = "101";
  await assert.rejects(ctx.service.calculate("q", loaded.state, loaded.configurationId), ConflictException);
  assert.equal(ctx.getSaved(), null);
});
