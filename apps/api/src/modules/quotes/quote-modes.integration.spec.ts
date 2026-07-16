import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { addAdHocQuoteItemSchema } from "@pulse/contracts/items";
import { prisma } from "@/lib/db";
import {
  addAdHocQuoteItem,
  convertQuoteToProject,
  createQuoteRevision,
  getQuoteRevision,
  replaceLegacyQuoteFinancials,
  switchQuoteCalculationMode
} from "@/lib/services/workService";

const runDatabaseTests = process.env.PULSE_RUN_DB_TESTS === "1";
const key = (label: string) => `TEST-${label}-${randomUUID()}`;

async function cleanupQuote(quoteId: string) {
  const projects = await prisma.project.findMany({
    where: { quoteId },
    select: { id: true, lifecycleContextId: true }
  });
  const projectIds = projects.map((project) => project.id);
  await prisma.requestUpdate.deleteMany({
    where: { OR: [{ quoteId }, { projectId: { in: projectIds } }] }
  });
  await prisma.activity.deleteMany({
    where: {
      OR: [
        { relatedEntityType: "Quote", relatedEntityId: quoteId },
        { relatedEntityType: "Project", relatedEntityId: { in: projectIds } }
      ]
    }
  });
  await prisma.lifecycleStatusEvent.deleteMany({
    where: {
      OR: [
        { entityType: "QUOTE", entityId: quoteId },
        { entityType: "PROJECT", entityId: { in: projectIds } }
      ]
    }
  });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.quote.deleteMany({ where: { id: quoteId } });
  await prisma.lifecycleContext.deleteMany({
    where: { id: { in: projects.flatMap((project) => project.lifecycleContextId ? [project.lifecycleContextId] : []) } }
  });
}

test("Legacy mode rejects QuoteItems and requires destructive confirmation to switch", { skip: !runDatabaseTests }, async () => {
  const quote = await prisma.quote.create({
    data: { quoteNumber: key("LEGACY"), title: "Legacy mode integration", calculationMode: "LEGACY" }
  });
  try {
    await replaceLegacyQuoteFinancials(quote.id, {
      materialSale: 100,
      materialCost: 40,
      laborSale: 50,
      laborCost: 25,
      taxAmount: 12,
      estimatedDurationBusinessDays: 4
    });
    await assert.rejects(
      addAdHocQuoteItem(quote.id, addAdHocQuoteItemSchema.parse({ name: "Forbidden line" })),
      /QUOTE_ITEMS_REQUIRE_PULSE_MODE/
    );
    await assert.rejects(
      switchQuoteCalculationMode(quote.id, { calculationMode: "PULSE", discardFinancialData: false }),
      /QUOTE_MODE_SWITCH_CONFIRMATION_REQUIRED/
    );
    const switched = await switchQuoteCalculationMode(quote.id, {
      calculationMode: "PULSE",
      discardFinancialData: true
    });
    assert.equal(switched.calculationMode, "PULSE");
    assert.equal(switched.total, 0);
    assert.equal(switched.legacyFinancials.materialSale, 0);
    await assert.rejects(
      replaceLegacyQuoteFinancials(quote.id, {
        materialSale: 1,
        materialCost: 0,
        laborSale: 0,
        laborCost: 0,
        taxAmount: 0,
        estimatedDurationBusinessDays: null
      }),
      /QUOTE_LEGACY_FINANCIALS_REQUIRE_LEGACY_MODE/
    );
  } finally {
    await cleanupQuote(quote.id);
  }
});

test("Legacy revision snapshots remain reproducible after the current quote changes", { skip: !runDatabaseTests }, async () => {
  const quote = await prisma.quote.create({
    data: {
      quoteNumber: key("REVISION"),
      baseQuoteNumber: key("BASE"),
      title: "Legacy revision integration",
      calculationMode: "LEGACY",
      status: "Sent"
    }
  });
  try {
    await replaceLegacyQuoteFinancials(quote.id, {
      materialSale: 200,
      materialCost: 100,
      laborSale: 50,
      laborCost: 25,
      taxAmount: 20,
      estimatedDurationBusinessDays: 5
    });
    await createQuoteRevision(quote.id, { reason: "Client changed scope" });
    await replaceLegacyQuoteFinancials(quote.id, {
      materialSale: 500,
      materialCost: 100,
      laborSale: 0,
      laborCost: 0,
      taxAmount: 40,
      estimatedDurationBusinessDays: 10
    });
    const historical = await getQuoteRevision(quote.id, "0");
    assert.equal(historical.calculationMode, "LEGACY");
    assert.equal(historical.legacyFinancials.materialSale, 200);
    assert.equal(historical.financialSummary.preTaxContractValue, 250);
    assert.equal(historical.financialSummary.finalCustomerTotal, 270);
  } finally {
    await cleanupQuote(quote.id);
  }
});

test("project conversion snapshots Legacy finances and excludes tax from the budget", { skip: !runDatabaseTests }, async () => {
  const client = await prisma.client.create({
    data: { clientNumber: key("CLIENT"), displayName: "Quote conversion client" }
  });
  const contact = await prisma.pointOfContact.create({
    data: {
      ownerType: "Client",
      ownerId: client.id,
      clientId: client.id,
      firstName: "Test",
      lastName: "Contact",
      name: "Test Contact"
    }
  });
  const quote = await prisma.quote.create({
    data: {
      quoteNumber: key("CONVERT"),
      title: "Legacy conversion integration",
      clientId: client.id,
      contactId: contact.id,
      calculationMode: "LEGACY",
      status: "Approved"
    }
  });
  try {
    await replaceLegacyQuoteFinancials(quote.id, {
      materialSale: 1000,
      materialCost: 600,
      laborSale: 500,
      laborCost: 200,
      taxAmount: 120,
      estimatedDurationBusinessDays: 12
    });
    const project = await convertQuoteToProject(quote.id, {
      startDate: undefined,
      dueDate: undefined
    });
    assert.equal(project.budget, 1500);
    assert.equal(project.sourceQuoteCalculationMode, "LEGACY");
    assert.equal(project.quoteFinancialSnapshot?.financialSummary.taxAmount, 120);
    assert.equal(project.quoteFinancialSnapshot?.financialSummary.finalCustomerTotal, 1620);
    assert.equal(project.dueDate, "");
  } finally {
    await cleanupQuote(quote.id);
    await prisma.client.deleteMany({ where: { id: client.id } });
  }
});
