import assert from "node:assert/strict";
import test from "node:test";
import {
  planQuoteBomSources,
  type QuoteBomCatalogItem
} from "@/modules/quote-items/quote-bom";

function catalogItem(
  input: Partial<QuoteBomCatalogItem> & Pick<QuoteBomCatalogItem, "id">
): QuoteBomCatalogItem {
  return {
    id: input.id,
    itemType: input.itemType ?? "PRODUCT",
    status: input.status ?? "ACTIVE",
    defaultLaborHours: input.defaultLaborHours ?? 0,
    defaultLaborItemId: input.defaultLaborItemId ?? null,
    relations: input.relations ?? []
  };
}

const baseCatalog: QuoteBomCatalogItem[] = [
  catalogItem({
    id: "parent",
    defaultLaborHours: 2,
    defaultLaborItemId: "labor",
    relations: [
      {
        childItemId: "component",
        relationType: "KIT_COMPONENT",
        defaultQuantity: 3,
        sortOrder: 1
      },
      {
        childItemId: "required",
        relationType: "REQUIRED",
        defaultQuantity: 1.5,
        sortOrder: 2
      },
      {
        childItemId: "optional",
        relationType: "OPTIONAL",
        defaultQuantity: 2,
        sortOrder: 3
      }
    ]
  }),
  catalogItem({
    id: "component",
    defaultLaborHours: 0.5,
    defaultLaborItemId: "labor",
    relations: [
      {
        childItemId: "component-required",
        relationType: "REQUIRED",
        defaultQuantity: 4,
        sortOrder: 1
      }
    ]
  }),
  catalogItem({ id: "required", itemType: "SERVICE" }),
  catalogItem({ id: "optional", itemType: "SERVICE" }),
  catalogItem({ id: "component-required", itemType: "SERVICE" }),
  catalogItem({ id: "labor", itemType: "LABOR" })
];

test("single item expansion adds required, selected, and default labor quantities", () => {
  assert.deepEqual(
    planQuoteBomSources({
      parentItemId: "parent",
      quantity: 2,
      mode: "ITEM",
      suggestionItemIds: ["optional"],
      catalog: baseCatalog
    }),
    [
      { itemId: "parent", quantity: 2 },
      { itemId: "required", quantity: 3 },
      { itemId: "optional", quantity: 4 },
      { itemId: "labor", quantity: 4 }
    ]
  );
});

test("full kit omits the parent price line and expands component requirements and labor", () => {
  assert.deepEqual(
    planQuoteBomSources({
      parentItemId: "parent",
      quantity: 2,
      mode: "KIT",
      suggestionItemIds: [],
      catalog: baseCatalog
    }),
    [
      { itemId: "component", quantity: 6 },
      { itemId: "component-required", quantity: 24 },
      { itemId: "required", quantity: 3 },
      { itemId: "labor", quantity: 7 }
    ]
  );
});

test("BOM planner rejects unrelated suggestions", () => {
  assert.throws(
    () =>
      planQuoteBomSources({
        parentItemId: "parent",
        quantity: 1,
        mode: "ITEM",
        suggestionItemIds: ["component"],
        catalog: baseCatalog
      }),
    /ITEM_SUGGESTION_INVALID/
  );
});

test("BOM planner rejects inactive automatic dependencies", () => {
  assert.throws(
    () =>
      planQuoteBomSources({
        parentItemId: "parent",
        quantity: 1,
        mode: "ITEM",
        suggestionItemIds: [],
        catalog: baseCatalog.map((item) =>
          item.id === "required" ? { ...item, status: "INACTIVE" } : item
        )
      }),
    /ITEM_BOM_DEPENDENCY_INACTIVE/
  );
});

test("BOM planner rejects required relation cycles", () => {
  const catalog = [
    catalogItem({
      id: "one",
      relations: [
        {
          childItemId: "two",
          relationType: "REQUIRED",
          defaultQuantity: 1,
          sortOrder: 0
        }
      ]
    }),
    catalogItem({
      id: "two",
      relations: [
        {
          childItemId: "one",
          relationType: "REQUIRED",
          defaultQuantity: 1,
          sortOrder: 0
        }
      ]
    })
  ];

  assert.throws(
    () =>
      planQuoteBomSources({
        parentItemId: "one",
        quantity: 1,
        mode: "ITEM",
        suggestionItemIds: [],
        catalog
      }),
    /ITEM_RELATION_CYCLE/
  );
});
