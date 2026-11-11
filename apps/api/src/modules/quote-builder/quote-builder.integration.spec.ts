import { ConflictException } from "@nestjs/common";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emptyBuilderWorkspace } from "@pulse/contracts/quote-builder";
import { prisma } from "@/lib/db";
import { CalculationConfigService } from "./calculation-config.service";
import { QuoteBuilderService } from "./quote-builder.service";

test("Builder database round trip, concurrent writes, inactive Items, and parent isolation", { skip: process.env.PULSE_RUN_DB_TESTS !== "1" }, async () => {
  const config = new CalculationConfigService(prisma); const service = new QuoteBuilderService(prisma, config);
  const quote = await prisma.quote.create({ data: { quoteNumber: `TEST-BUILDER-${randomUUID()}`, title: "Builder isolation test", total: 77, legacyMaterialSale: 11, legacyLaborSale: 22, legacyTaxAmount: 3, revisionNumber: 2, baseQuoteNumber: "BUILDER-ISOLATION" } });
  const item = await prisma.item.create({ data: { name: "Builder test Item", itemType: "PRODUCT", cost: 1, sellPrice: 2, defaultLaborHours: 20 } });
  try {
    await prisma.quoteRevision.create({ data: { quoteId: quote.id, revisionNumber: 1, quoteNumber: `${quote.quoteNumber}-old`, titleSnapshot: "Earlier content", ownerSnapshot: "Estimator", totalSnapshot: 66, priorStatus: "Draft", versionCreatedAt: new Date(), requestedAt: new Date(), reason: "Existing test evidence", snapshot: { preserved: true } } });
    await prisma.requestUpdate.create({ data: { quoteId: quote.id, kind: "note", body: "Existing update" } });
    await prisma.lifecycleDocument.create({ data: { quoteId: quote.id, originalFileName: "existing-file.pdf" } });
    await prisma.activity.create({ data: { relatedEntityType: "quote", relatedEntityId: quote.id, actorName: "Tester", actorRole: "ADMIN", type: "EXISTING", title: "Existing activity" } });
    await prisma.lifecycleStatusEvent.create({ data: { entityType: "QUOTE", entityId: quote.id, toStatus: "Draft", changedAt: new Date() } });
    await prisma.itemPriceHistory.create({ data: { itemId: item.id, newCost: 1, newSellPrice: 2 } });
    const related = async () => ({
      revisions: await prisma.quoteRevision.findMany({ where: { quoteId: quote.id }, orderBy: { id: "asc" } }),
      updates: await prisma.requestUpdate.findMany({ where: { quoteId: quote.id }, orderBy: { id: "asc" } }),
      files: await prisma.lifecycleDocument.findMany({ where: { quoteId: quote.id }, orderBy: { id: "asc" } }),
      activity: await prisma.activity.findMany({ where: { relatedEntityId: quote.id }, orderBy: { id: "asc" } }),
      lifecycle: await prisma.lifecycleStatusEvent.findMany({ where: { entityId: quote.id }, orderBy: { id: "asc" } }),
      itemHistory: await prisma.itemPriceHistory.findMany({ where: { itemId: item.id }, orderBy: { id: "asc" } })
    });
    const relatedBefore = await related();
    const before = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    const loaded = await service.load(quote.id); assert.equal(loaded.writeToken, null);
    const state = emptyBuilderWorkspace();
    state.lines.push({ id: "line", itemId: item.id, itemFacts: { itemType: "PRODUCT", sku: "COPIED-SKU", partNumber: "PN-1", manufacturer: "Original", brand: "Brand", category: "Network", subcategory: "Cable", productUrl: "https://example.test/product", datasheetUrl: "https://example.test/data.pdf" }, name: "Custom proposal name", unit: "ft", proposalDescription: "Proposal only", imageUrl: null, groupId: null, order: 0, quantity: "1.125", mode: "MATERIAL_ONLY", origins: {}, material: { baseUnitCost: "1", margin: "0.3", contingency: "0.025", freight: "0.05", materialIvuEnabled: true, materialIvuRate: "0.115" }, labor: { laborClassId: null, productionRate: null, crewSize: null, overtimeMultiplier: null } });
    const results = await Promise.allSettled([service.save(quote.id, { state, expectedWriteToken: null }), service.save(quote.id, { state, expectedWriteToken: null })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected").length, 1);
    const reopened = await service.load(quote.id); assert.deepEqual(reopened.state, state); assert.equal(reopened.writeToken, 1);
    assert.equal(reopened.calculation.status, "complete");
    assert.deepEqual(await prisma.item.findUniqueOrThrow({ where: { id: item.id } }), item);
    await prisma.item.update({ where: { id: item.id }, data: { status: "INACTIVE", name: "Changed in catalog", cost: 100, primaryImageUrl: "/changed", defaultProductionRate: 999, defaultCrewSize: 9 } });
    const itemAfterCatalogChange = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    assert.deepEqual((await service.load(quote.id)).unavailableItemIds, [item.id]);
    assert.deepEqual((await service.load(quote.id)).state, state);
    await service.save(quote.id, { state, expectedWriteToken: 1 });
    const newlySelected = structuredClone(state); newlySelected.lines.push({ ...state.lines[0], id: "new-inactive-line" });
    await assert.rejects(service.save(quote.id, { state: newlySelected, expectedWriteToken: 2 }), /inactive/);
    const invalid = structuredClone(state); invalid.lines[0].material.margin = "1";
    await service.save(quote.id, { state: invalid, expectedWriteToken: 2 });
    assert.equal((await service.load(quote.id)).calculation.status, "invalid");
    invalid.lines[0].material.margin = null;
    await service.save(quote.id, { state: invalid, expectedWriteToken: 3 });
    assert.equal((await service.load(quote.id)).calculation.status, "incomplete");
    await assert.rejects(service.save(quote.id, { state, expectedWriteToken: 2 }), error => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "BUILDER_WRITE_CONFLICT");
    assert.equal((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).updatedAt.getTime(), before.updatedAt.getTime());
    assert.deepEqual(await related(), relatedBefore);
    assert.deepEqual(await prisma.item.findUniqueOrThrow({ where: { id: item.id } }), itemAfterCatalogChange);
    assert.deepEqual(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } }), before);
    assert.equal(await prisma.quoteItem.count({ where: { quoteId: quote.id } }), 0);
    assert.equal(await prisma.itemPriceHistory.count({ where: { itemId: item.id } }), 1);
    assert.equal((await prisma.item.findUniqueOrThrow({ where: { id: item.id } })).defaultLaborHours.toString(), "20");
  } finally {
    await prisma.activity.deleteMany({ where: { relatedEntityId: quote.id } });
    await prisma.lifecycleStatusEvent.deleteMany({ where: { entityId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    await prisma.item.delete({ where: { id: item.id } });
  }
});


test("v1 Builder upgrades on read without writes, and persists v2 only on save", { skip: process.env.PULSE_RUN_DB_TESTS !== "1" }, async () => {
  const service = new QuoteBuilderService(prisma, new CalculationConfigService(prisma));
  const quote = await prisma.quote.create({ data: { quoteNumber: `TEST-BUILDER-V1-${randomUUID()}`, title: "Old working document" } });
  try {
    const { schemaVersion, ...v1 } = emptyBuilderWorkspace();
    await prisma.quoteBuilderWorkspace.create({ data: { quoteId: quote.id, schemaVersion: 1, state: v1 } });
    const before = await prisma.quoteBuilderWorkspace.findUniqueOrThrow({ where: { quoteId: quote.id } });
    const loaded = await service.load(quote.id);
    assert.equal(loaded.state.schemaVersion, 2);
    assert.deepEqual(await prisma.quoteBuilderWorkspace.findUniqueOrThrow({ where: { quoteId: quote.id } }), before);
    await service.save(quote.id, { state: loaded.state, expectedWriteToken: loaded.writeToken });
    const saved = await prisma.quoteBuilderWorkspace.findUniqueOrThrow({ where: { quoteId: quote.id } });
    assert.equal(saved.schemaVersion, 2); assert.equal(saved.writeToken, 2);
    assert.deepEqual(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } }), quote);
  } finally { await prisma.quote.delete({ where: { id: quote.id } }); }
});

test("Standard labor class is available at the approved rate without writes on load", { skip: process.env.PULSE_RUN_DB_TESTS !== "1" }, async () => {
  const { STANDARD_LABOR_CLASS_ID } = await import("@pulse/contracts/quote-builder");
  const before = await prisma.quoteLaborClass.findUniqueOrThrow({ where: { id: STANDARD_LABOR_CLASS_ID } });
  assert.equal(before.name, "Standard"); assert.equal(before.hourlyRate?.toFixed(), "25"); assert.equal(before.enabled, true);
  const { configuration } = await new CalculationConfigService(prisma).read();
  assert.deepEqual(configuration.laborClasses.find(role => role.id === STANDARD_LABOR_CLASS_ID), { id: STANDARD_LABOR_CLASS_ID, name: "Standard", hourlyRate: "25", enabled: true });
  assert.deepEqual(await prisma.quoteLaborClass.findUniqueOrThrow({ where: { id: STANDARD_LABOR_CLASS_ID } }), before);
});
