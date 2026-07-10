import type { ItemRelationType, ItemStatus, ItemType } from "@pulse/contracts/items";

export type QuoteBomCatalogRelation = {
  childItemId: string;
  relationType: ItemRelationType;
  defaultQuantity: number;
  sortOrder: number;
};

export type QuoteBomCatalogItem = {
  id: string;
  itemType: ItemType;
  status: ItemStatus;
  defaultLaborHours: number;
  defaultLaborItemId: string | null;
  relations: QuoteBomCatalogRelation[];
};

export type PlannedQuoteSource = {
  itemId: string;
  quantity: number;
};

type PlanQuoteBomInput = {
  parentItemId: string;
  quantity: number;
  mode: "ITEM" | "KIT";
  suggestionItemIds: string[];
  catalog: QuoteBomCatalogItem[];
};

const maximumQuoteQuantity = 999_999_999.999;

function roundedQuantity(value: number) {
  return Number(value.toFixed(3));
}

function multipliedQuantity(left: number, right: number) {
  const value = roundedQuantity(left * right);
  if (!Number.isFinite(value) || value <= 0 || value > maximumQuoteQuantity) {
    throw new Error("ITEM_BOM_QUANTITY_INVALID");
  }
  return value;
}

export function planQuoteBomSources(input: PlanQuoteBomInput): PlannedQuoteSource[] {
  const catalog = new Map(input.catalog.map((item) => [item.id, item]));
  const parent = catalog.get(input.parentItemId);
  if (!parent || parent.status !== "ACTIVE") throw new Error("ITEM_NOT_FOUND");

  const planned = new Map<string, PlannedQuoteSource>();
  const addSource = (itemId: string, quantity: number) => {
    const item = catalog.get(itemId);
    if (!item || item.status !== "ACTIVE") {
      throw new Error("ITEM_BOM_DEPENDENCY_INACTIVE");
    }
    const existing = planned.get(itemId);
    const nextQuantity = roundedQuantity((existing?.quantity ?? 0) + quantity);
    if (nextQuantity <= 0 || nextQuantity > maximumQuoteQuantity) {
      throw new Error("ITEM_BOM_QUANTITY_INVALID");
    }
    planned.set(itemId, { itemId, quantity: nextQuantity });
  };
  const addSourceWithRequired = (
    itemId: string,
    quantity: number,
    ancestry: ReadonlySet<string> = new Set()
  ) => {
    if (ancestry.has(itemId)) throw new Error("ITEM_RELATION_CYCLE");
    addSource(itemId, quantity);
    const item = catalog.get(itemId);
    if (!item) throw new Error("ITEM_BOM_DEPENDENCY_INACTIVE");
    const nextAncestry = new Set(ancestry).add(itemId);
    for (const relation of item.relations
      .filter((candidate) => candidate.relationType === "REQUIRED")
      .sort((left, right) => left.sortOrder - right.sortOrder)) {
      addSourceWithRequired(
        relation.childItemId,
        multipliedQuantity(quantity, relation.defaultQuantity),
        nextAncestry
      );
    }
  };

  const parentRelations = [...parent.relations].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );
  const kitComponents = parentRelations.filter(
    (relation) => relation.relationType === "KIT_COMPONENT"
  );
  const requiredRelations = parentRelations.filter(
    (relation) => relation.relationType === "REQUIRED"
  );
  const selectableRelations = parentRelations.filter(
    (relation) =>
      relation.relationType === "RELATED" || relation.relationType === "OPTIONAL"
  );
  const selectedIds = Array.from(new Set(input.suggestionItemIds));
  if (
    selectedIds.some(
      (itemId) => !selectableRelations.some((relation) => relation.childItemId === itemId)
    )
  ) {
    throw new Error("ITEM_SUGGESTION_INVALID");
  }

  if (input.mode === "ITEM") {
    addSourceWithRequired(parent.id, input.quantity);
  } else {
    if (!kitComponents.length) throw new Error("ITEM_KIT_EMPTY");
    for (const relation of kitComponents) {
      addSourceWithRequired(
        relation.childItemId,
        multipliedQuantity(input.quantity, relation.defaultQuantity)
      );
    }
    for (const relation of requiredRelations) {
      addSourceWithRequired(
        relation.childItemId,
        multipliedQuantity(input.quantity, relation.defaultQuantity),
        new Set([parent.id])
      );
    }
  }
  for (const itemId of selectedIds) {
    const relation = selectableRelations.find((candidate) => candidate.childItemId === itemId);
    if (!relation) throw new Error("ITEM_SUGGESTION_INVALID");
    addSourceWithRequired(
      itemId,
      multipliedQuantity(input.quantity, relation.defaultQuantity)
    );
  }

  const laborOwners = [
    ...(input.mode === "KIT" ? [{ itemId: parent.id, quantity: input.quantity }] : []),
    ...planned.values()
  ];
  for (const source of laborOwners) {
    const item = catalog.get(source.itemId);
    if (
      !item ||
      item.itemType === "LABOR" ||
      !item.defaultLaborItemId ||
      item.defaultLaborHours <= 0
    ) {
      continue;
    }
    const laborItem = catalog.get(item.defaultLaborItemId);
    if (
      !laborItem ||
      laborItem.status !== "ACTIVE" ||
      laborItem.itemType !== "LABOR"
    ) {
      throw new Error("ITEM_BOM_DEPENDENCY_INACTIVE");
    }
    addSource(
      laborItem.id,
      multipliedQuantity(source.quantity, item.defaultLaborHours)
    );
  }

  return [...planned.values()];
}
