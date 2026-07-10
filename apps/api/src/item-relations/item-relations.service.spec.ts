import assert from "node:assert/strict";
import test from "node:test";
import type { CreateItemInput } from "@pulse/contracts/items";
import type { Prisma } from "@/generated/prisma/client";
import { ItemRelationsService } from "@/item-relations/item-relations.service";

type LaborItem = {
  itemType: "PRODUCT" | "LABOR" | "SERVICE";
  status: "ACTIVE" | "INACTIVE";
} | null;

function fakeTransaction(options: {
  laborItem?: LaborItem;
  childCount?: number;
  onDelete?: () => void;
  onCreate?: (data: unknown) => void;
} = {}) {
  return {
    item: {
      findUnique: async (_query: unknown) => options.laborItem ?? null,
      count: async (_query: unknown) => options.childCount ?? 0
    },
    itemRelation: {
      deleteMany: async (_query: unknown) => {
        options.onDelete?.();
        return { count: 0 };
      },
      createMany: async (query: { data: unknown }) => {
        options.onCreate?.(query.data);
        return { count: Array.isArray(query.data) ? query.data.length : 0 };
      }
    }
  } as unknown as Prisma.TransactionClient;
}

test("default labor requires a selected item when hours are positive", async () => {
  const service = new ItemRelationsService();

  await assert.rejects(
    service.validateDefaultLaborItem(fakeTransaction(), null, 1.5),
    /ITEM_DEFAULT_LABOR_REQUIRED/
  );
});

test("default labor rejects self, missing, inactive, and non-labor items", async () => {
  const service = new ItemRelationsService();

  await assert.rejects(
    service.validateDefaultLaborItem(fakeTransaction(), "item-1", 1, "item-1"),
    /ITEM_DEFAULT_LABOR_SELF/
  );
  await assert.rejects(
    service.validateDefaultLaborItem(fakeTransaction(), "missing", 1),
    /ITEM_DEFAULT_LABOR_NOT_FOUND/
  );
  await assert.rejects(
    service.validateDefaultLaborItem(
      fakeTransaction({ laborItem: { itemType: "LABOR", status: "INACTIVE" } }),
      "labor-1",
      1
    ),
    /ITEM_DEFAULT_LABOR_INVALID/
  );
  await assert.rejects(
    service.validateDefaultLaborItem(
      fakeTransaction({ laborItem: { itemType: "PRODUCT", status: "ACTIVE" } }),
      "product-1",
      1
    ),
    /ITEM_DEFAULT_LABOR_INVALID/
  );
});

test("default labor accepts an active labor catalog item", async () => {
  const service = new ItemRelationsService();

  await service.validateDefaultLaborItem(
    fakeTransaction({ laborItem: { itemType: "LABOR", status: "ACTIVE" } }),
    "labor-1",
    2
  );
});

test("relation replacement rejects a parent-to-self relation after clearing old rows", async () => {
  const service = new ItemRelationsService();
  let deleted = false;
  const relations: CreateItemInput["relations"] = [
    {
      childItemId: "parent-1",
      relationType: "RELATED",
      defaultQuantity: 1,
      sortOrder: 0
    }
  ];

  await assert.rejects(
    service.replaceRelations(
      fakeTransaction({ onDelete: () => { deleted = true; } }),
      "parent-1",
      relations
    ),
    /ITEM_RELATION_SELF/
  );
  assert.equal(deleted, true);
});

test("relation replacement verifies every distinct child", async () => {
  const service = new ItemRelationsService();
  const relations: CreateItemInput["relations"] = [
    {
      childItemId: "child-1",
      relationType: "RELATED",
      defaultQuantity: 1,
      sortOrder: 0
    },
    {
      childItemId: "child-2",
      relationType: "REQUIRED",
      defaultQuantity: 1,
      sortOrder: 1
    }
  ];

  await assert.rejects(
    service.replaceRelations(
      fakeTransaction({ childCount: 1 }),
      "parent-1",
      relations
    ),
    /ITEM_RELATION_CHILD_NOT_FOUND/
  );
});

test("relation replacement deduplicates child/type pairs and retains the last values", async () => {
  const service = new ItemRelationsService();
  let created: unknown;
  const relations: CreateItemInput["relations"] = [
    {
      childItemId: "child-1",
      relationType: "RELATED",
      defaultQuantity: 1,
      sortOrder: 0
    },
    {
      childItemId: "child-1",
      relationType: "RELATED",
      defaultQuantity: 3,
      sortOrder: 2
    },
    {
      childItemId: "child-1",
      relationType: "OPTIONAL",
      defaultQuantity: 2,
      sortOrder: 1
    }
  ];

  await service.replaceRelations(
    fakeTransaction({
      childCount: 1,
      onCreate: (data) => { created = data; }
    }),
    "parent-1",
    relations
  );

  assert.deepEqual(created, [
    {
      parentItemId: "parent-1",
      childItemId: "child-1",
      relationType: "RELATED",
      defaultQuantity: 3,
      sortOrder: 2
    },
    {
      parentItemId: "parent-1",
      childItemId: "child-1",
      relationType: "OPTIONAL",
      defaultQuantity: 2,
      sortOrder: 1
    }
  ]);
});
