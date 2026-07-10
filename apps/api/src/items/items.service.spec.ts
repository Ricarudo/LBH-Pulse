import assert from "node:assert/strict";
import test from "node:test";
import type { ItemSearchInput } from "@pulse/contracts/items";
import {
  Prisma,
  type PrismaClient
} from "@/generated/prisma/client";
import { ItemRelationsService } from "@/item-relations/item-relations.service";
import { ItemsService, toItemRecord } from "@/items/items.service";

type ItemWithRelations = Parameters<typeof toItemRecord>[0];

function catalogItem(
  overrides: Partial<ItemWithRelations> = {}
): ItemWithRelations {
  return {
    id: "item-1",
    name: "PoE Switch",
    description: null,
    itemType: "PRODUCT",
    status: "ACTIVE",
    sku: "SW-1",
    partNumber: null,
    manufacturer: null,
    brand: null,
    category: null,
    subcategory: null,
    unitOfMeasure: "each",
    cost: new Prisma.Decimal(100),
    sellPrice: new Prisma.Decimal(150),
    markupPercent: new Prisma.Decimal(50),
    taxable: true,
    primaryImageUrl: null,
    productUrl: null,
    datasheetUrl: null,
    internalNotes: null,
    quoteDescription: null,
    defaultLaborHours: new Prisma.Decimal(0),
    defaultLaborItemId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    outgoingRelations: [],
    ...overrides
  };
}

test("item mapping emits API-safe strings, numbers, and outgoing relations", () => {
  const item = catalogItem({
    outgoingRelations: [
      {
        id: "relation-1",
        parentItemId: "item-1",
        childItemId: "labor-1",
        relationType: "REQUIRED",
        defaultQuantity: new Prisma.Decimal(2),
        sortOrder: 3,
        childItem: {
          id: "labor-1",
          name: "Installation labor",
          itemType: "LABOR",
          sku: null,
          partNumber: "LAB-1"
        }
      }
    ]
  });

  const result = toItemRecord(item);

  assert.equal(result.description, "");
  assert.equal(result.cost, 100);
  assert.equal(result.updatedAt, "2026-01-02T00:00:00.000Z");
  assert.deepEqual(result.relations[0], {
    id: "relation-1",
    parentItemId: "item-1",
    childItemId: "labor-1",
    childItemName: "Installation labor",
    childItemType: "LABOR",
    childSku: "",
    childPartNumber: "LAB-1",
    relationType: "REQUIRED",
    defaultQuantity: 2,
    sortOrder: 3
  });
});

test("item list preserves filters, ordering, and the 200-record limit", async () => {
  let query: unknown;
  const prisma = {
    item: {
      findMany: async (input: unknown) => {
        query = input;
        return [catalogItem()];
      }
    }
  } as unknown as PrismaClient;
  const service = new ItemsService(prisma, new ItemRelationsService());
  const input: ItemSearchInput = {
    q: "switch",
    type: "PRODUCT",
    includeInactive: false
  };

  const items = await service.listItems(input);
  const captured = query as {
    where: Prisma.ItemWhereInput;
    orderBy: Prisma.ItemOrderByWithRelationInput[];
    take: number;
  };

  assert.equal(items.length, 1);
  assert.equal(captured.take, 200);
  assert.deepEqual(captured.orderBy, [
    { status: "asc" },
    { updatedAt: "desc" },
    { name: "asc" }
  ]);
  assert.equal(captured.where.status, "ACTIVE");
  assert.equal(captured.where.itemType, "PRODUCT");
  assert.deepEqual(captured.where.OR?.[0], {
    name: { contains: "switch", mode: "insensitive" }
  });
});

test("active item search forces active status, name ordering, and a 40-record limit", async () => {
  let query: unknown;
  const prisma = {
    item: {
      findMany: async (input: unknown) => {
        query = input;
        return [];
      }
    }
  } as unknown as PrismaClient;
  const service = new ItemsService(prisma, new ItemRelationsService());

  await service.searchActiveItems({
    q: "",
    status: "INACTIVE",
    includeInactive: true
  });
  const captured = query as {
    where: Prisma.ItemWhereInput;
    orderBy: Prisma.ItemOrderByWithRelationInput[];
    take: number;
  };

  assert.equal(captured.where.status, "ACTIVE");
  assert.deepEqual(captured.orderBy, [{ name: "asc" }]);
  assert.equal(captured.take, 40);
});

test("item deletion is a soft transition to inactive", async () => {
  const original = catalogItem();
  let updateQuery: unknown;
  const prisma = {
    item: {
      findFirst: async (_query: unknown) => original,
      update: async (input: unknown) => {
        updateQuery = input;
        return catalogItem({ status: "INACTIVE" });
      }
    }
  } as unknown as PrismaClient;
  const service = new ItemsService(prisma, new ItemRelationsService());

  const result = await service.markItemInactive("item-1");

  assert.equal(result.status, "INACTIVE");
  assert.deepEqual(
    (updateQuery as { where: unknown; data: unknown }).where,
    { id: "item-1" }
  );
  assert.deepEqual(
    (updateQuery as { where: unknown; data: unknown }).data,
    { status: "INACTIVE" }
  );
});
