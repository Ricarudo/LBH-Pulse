import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  addAdHocQuoteItemSchema,
  addQuoteKitSchema,
  updateQuoteItemSchema,
  updateQuoteProposalSchema
} from "@pulse/contracts/items";
import { ItemRelationsService } from "@/item-relations/item-relations.service";
import { ItemsService } from "@/items/items.service";
import { prisma } from "@/lib/db";
import {
  addAdHocQuoteItem,
  addQuoteKit,
  reorderQuoteItems,
  updateQuoteItem,
  updateQuoteProposal
} from "@/lib/services/workService";

const runDatabaseTests = process.env.PULSE_RUN_DB_TESTS === "1";

function testKey(label: string) {
  return `TEST-${label}-${randomUUID()}`;
}

test(
  "quote item mutations recalculate totals, reorder atomically, and update proposal state",
  { skip: !runDatabaseTests },
  async () => {
    const quote = await prisma.quote.create({
      data: {
        quoteNumber: testKey("QUOTE"),
        title: "Quote transaction integration test",
        total: 77
      }
    });

    try {
      const firstResult = await addAdHocQuoteItem(
        quote.id,
        addAdHocQuoteItemSchema.parse({
          name: "Custom line",
          quantity: 2,
          unitCost: 50,
          unitPrice: 100,
          discountPercent: 10
        })
      );
      assert.equal(firstResult.total, 180);
      assert.equal(firstResult.items.length, 1);

      const firstLine = firstResult.items[0];
      const updatedResult = await updateQuoteItem(
        quote.id,
        firstLine.id,
        updateQuoteItemSchema.parse({
          quantity: 3,
          unitCost: 60,
          unitPrice: 120,
          discountPercent: 25
        })
      );
      assert.equal(updatedResult.items[0].lineTotal, 270);
      assert.equal(updatedResult.items[0].markupPercent, 100);
      assert.equal(updatedResult.total, 270);

      const secondResult = await addAdHocQuoteItem(
        quote.id,
        addAdHocQuoteItemSchema.parse({
          name: "Second line",
          quantity: 1,
          unitPrice: 10
        })
      );
      assert.equal(secondResult.total, 280);

      const reversedIds = secondResult.items.map((item) => item.id).reverse();
      const reordered = await reorderQuoteItems(
        quote.id,
        { quoteItemIds: reversedIds }
      );
      assert.deepEqual(
        reordered.items.map((item) => item.id),
        reversedIds
      );
      assert.deepEqual(
        reordered.items.map((item) => item.sortOrder),
        [0, 1]
      );

      await assert.rejects(
        reorderQuoteItems(quote.id, { quoteItemIds: reversedIds.slice(0, 1) }),
        /QUOTE_ITEM_REORDER_STALE/
      );
      const orderAfterRejectedMutation = await prisma.quoteItem.findMany({
        where: { quoteId: quote.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true }
      });
      assert.deepEqual(
        orderAfterRejectedMutation.map((item) => item.id),
        reversedIds
      );

      const proposal = await updateQuoteProposal(
        quote.id,
        updateQuoteProposalSchema.parse({ proposalNotes: "Ready for review" })
      );
      assert.equal(proposal.proposalNotes, "Ready for review");
      assert.notEqual(proposal.proposalPreparedAt, "");
    } finally {
      await prisma.activity.deleteMany({
        where: { relatedEntityType: "Quote", relatedEntityId: quote.id }
      });
      await prisma.quote.deleteMany({ where: { id: quote.id } });
    }
  }
);

test(
  "kit expansion persists components and default labor in one quote transaction",
  { skip: !runDatabaseTests },
  async () => {
    const quote = await prisma.quote.create({
      data: {
        quoteNumber: testKey("KIT-QUOTE"),
        title: "Kit integration test"
      }
    });
    const labor = await prisma.item.create({
      data: {
        name: testKey("LABOR"),
        itemType: "LABOR",
        sellPrice: 50,
        unitOfMeasure: "hour"
      }
    });
    const component = await prisma.item.create({
      data: {
        name: testKey("COMPONENT"),
        sellPrice: 25,
        unitOfMeasure: "each"
      }
    });
    const parent = await prisma.item.create({
      data: {
        name: testKey("KIT"),
        defaultLaborItemId: labor.id,
        defaultLaborHours: 1.5,
        outgoingRelations: {
          create: {
            childItemId: component.id,
            relationType: "KIT_COMPONENT",
            defaultQuantity: 2
          }
        }
      }
    });

    try {
      const result = await addQuoteKit(
        quote.id,
        addQuoteKitSchema.parse({ itemId: parent.id, quantity: 2 })
      );
      assert.deepEqual(
        result.items.map((item) => ({
          sourceItemId: item.sourceItemId,
          quantity: item.quantity,
          lineTotal: item.lineTotal
        })),
        [
          { sourceItemId: component.id, quantity: 4, lineTotal: 100 },
          { sourceItemId: labor.id, quantity: 3, lineTotal: 150 }
        ]
      );
      assert.equal(result.total, 250);
    } finally {
      await prisma.activity.deleteMany({
        where: { relatedEntityType: "Quote", relatedEntityId: quote.id }
      });
      await prisma.quote.deleteMany({ where: { id: quote.id } });
      await prisma.item.deleteMany({
        where: { id: { in: [parent.id, component.id, labor.id] } }
      });
    }
  }
);

test(
  "invalid relation replacement rolls back the relation delete",
  { skip: !runDatabaseTests },
  async () => {
    const child = await prisma.item.create({
      data: { name: testKey("CHILD") }
    });
    const parent = await prisma.item.create({
      data: {
        name: testKey("PARENT"),
        outgoingRelations: {
          create: {
            childItemId: child.id,
            relationType: "RELATED",
            defaultQuantity: 1
          }
        }
      }
    });
    const service = new ItemsService(prisma, new ItemRelationsService());

    try {
      await assert.rejects(
        service.updateItem(parent.id, {
          relations: [
            {
              childItemId: randomUUID(),
              relationType: "REQUIRED",
              defaultQuantity: 1,
              sortOrder: 0
            }
          ]
        }),
        /ITEM_RELATION_CHILD_NOT_FOUND/
      );

      const preserved = await prisma.itemRelation.findMany({
        where: { parentItemId: parent.id }
      });
      assert.equal(preserved.length, 1);
      assert.equal(preserved[0].childItemId, child.id);
      assert.equal(preserved[0].relationType, "RELATED");
    } finally {
      await prisma.item.deleteMany({
        where: { id: { in: [parent.id, child.id] } }
      });
    }
  }
);
