import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type {
  CreateItemInput,
  ItemSearchInput,
  UpdateItemInput
} from "@/lib/validations/item";
import type {
  ItemRecord,
  ItemRelationRecord,
  ItemRelationType,
  ItemStatus,
  ItemType
} from "@/types/item";

const itemInclude = {
  outgoingRelations: {
    include: {
      childItem: {
        select: {
          id: true,
          name: true,
          itemType: true,
          sku: true,
          partNumber: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }]
  }
} satisfies Prisma.ItemInclude;

type ItemWithRelations = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

function dateOutput(value?: Date | null) {
  return value ? value.toISOString() : "";
}

function nullable(value?: string) {
  return value ? value : null;
}

function relationKey(relation: {
  childItemId: string;
  relationType: ItemRelationType;
}) {
  return `${relation.childItemId}:${relation.relationType}`;
}

function toRelationRecord(
  relation: ItemWithRelations["outgoingRelations"][number]
): ItemRelationRecord {
  return {
    id: relation.id,
    parentItemId: relation.parentItemId,
    childItemId: relation.childItemId,
    childItemName: relation.childItem.name,
    childItemType: relation.childItem.itemType as ItemType,
    childSku: relation.childItem.sku ?? "",
    childPartNumber: relation.childItem.partNumber ?? "",
    relationType: relation.relationType as ItemRelationType,
    defaultQuantity: Number(relation.defaultQuantity),
    sortOrder: relation.sortOrder
  };
}

export function toItemRecord(item: ItemWithRelations): ItemRecord {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    itemType: item.itemType as ItemType,
    status: item.status as ItemStatus,
    sku: item.sku ?? "",
    partNumber: item.partNumber ?? "",
    manufacturer: item.manufacturer ?? "",
    brand: item.brand ?? "",
    category: item.category ?? "",
    subcategory: item.subcategory ?? "",
    unitOfMeasure: item.unitOfMeasure ?? "",
    cost: Number(item.cost),
    sellPrice: Number(item.sellPrice),
    markupPercent: Number(item.markupPercent),
    taxable: item.taxable,
    primaryImageUrl: item.primaryImageUrl ?? "",
    productUrl: item.productUrl ?? "",
    datasheetUrl: item.datasheetUrl ?? "",
    internalNotes: item.internalNotes ?? "",
    quoteDescription: item.quoteDescription ?? "",
    defaultLaborHours: Number(item.defaultLaborHours),
    defaultLaborItemId: item.defaultLaborItemId,
    createdAt: dateOutput(item.createdAt),
    updatedAt: dateOutput(item.updatedAt),
    relations: item.outgoingRelations.map(toRelationRecord)
  };
}

function createItemData(input: CreateItemInput): Prisma.ItemUncheckedCreateInput {
  return {
    name: input.name,
    description: nullable(input.description),
    itemType: input.itemType,
    status: input.status,
    sku: nullable(input.sku),
    partNumber: nullable(input.partNumber),
    manufacturer: nullable(input.manufacturer),
    brand: nullable(input.brand),
    category: nullable(input.category),
    subcategory: nullable(input.subcategory),
    unitOfMeasure: nullable(input.unitOfMeasure),
    cost: input.cost,
    sellPrice: input.sellPrice,
    markupPercent: input.markupPercent,
    taxable: input.taxable,
    primaryImageUrl: nullable(input.primaryImageUrl),
    productUrl: nullable(input.productUrl),
    datasheetUrl: nullable(input.datasheetUrl),
    internalNotes: nullable(input.internalNotes),
    quoteDescription: nullable(input.quoteDescription),
    defaultLaborHours: input.defaultLaborHours,
    defaultLaborItemId: input.defaultLaborItemId || null
  };
}

function updateItemData(input: UpdateItemInput): Prisma.ItemUncheckedUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: nullable(input.description) } : {}),
    ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.sku !== undefined ? { sku: nullable(input.sku) } : {}),
    ...(input.partNumber !== undefined ? { partNumber: nullable(input.partNumber) } : {}),
    ...(input.manufacturer !== undefined ? { manufacturer: nullable(input.manufacturer) } : {}),
    ...(input.brand !== undefined ? { brand: nullable(input.brand) } : {}),
    ...(input.category !== undefined ? { category: nullable(input.category) } : {}),
    ...(input.subcategory !== undefined ? { subcategory: nullable(input.subcategory) } : {}),
    ...(input.unitOfMeasure !== undefined ? { unitOfMeasure: nullable(input.unitOfMeasure) } : {}),
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
    ...(input.sellPrice !== undefined ? { sellPrice: input.sellPrice } : {}),
    ...(input.markupPercent !== undefined ? { markupPercent: input.markupPercent } : {}),
    ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
    ...(input.primaryImageUrl !== undefined ? { primaryImageUrl: nullable(input.primaryImageUrl) } : {}),
    ...(input.productUrl !== undefined ? { productUrl: nullable(input.productUrl) } : {}),
    ...(input.datasheetUrl !== undefined ? { datasheetUrl: nullable(input.datasheetUrl) } : {}),
    ...(input.internalNotes !== undefined ? { internalNotes: nullable(input.internalNotes) } : {}),
    ...(input.quoteDescription !== undefined ? { quoteDescription: nullable(input.quoteDescription) } : {}),
    ...(input.defaultLaborHours !== undefined ? { defaultLaborHours: input.defaultLaborHours } : {}),
    ...(input.defaultLaborItemId !== undefined
      ? { defaultLaborItemId: input.defaultLaborItemId || null }
      : {})
  };
}

async function validateDefaultLaborItem(
  tx: Prisma.TransactionClient,
  defaultLaborItemId: string | null | undefined,
  defaultLaborHours: number,
  parentItemId?: string
) {
  if (!defaultLaborItemId) {
    if (defaultLaborHours > 0) throw new Error("ITEM_DEFAULT_LABOR_REQUIRED");
    return;
  }
  if (defaultLaborItemId === parentItemId) {
    throw new Error("ITEM_DEFAULT_LABOR_SELF");
  }

  const laborItem = await tx.item.findUnique({
    where: { id: defaultLaborItemId },
    select: { itemType: true, status: true }
  });
  if (!laborItem) throw new Error("ITEM_DEFAULT_LABOR_NOT_FOUND");
  if (laborItem.itemType !== "LABOR" || laborItem.status !== "ACTIVE") {
    throw new Error("ITEM_DEFAULT_LABOR_INVALID");
  }
}

async function itemOrThrow(id: string) {
  const item = await prisma.item.findFirst({
    where: { id },
    include: itemInclude
  });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  return item;
}

function searchWhere(input: ItemSearchInput): Prisma.ItemWhereInput {
  const query = input.q.trim();
  const contains = { contains: query, mode: "insensitive" as const };
  return {
    ...(input.includeInactive ? {} : { status: "ACTIVE" }),
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { itemType: input.type } : {}),
    ...(query
      ? {
          OR: [
            { name: contains },
            { sku: contains },
            { partNumber: contains },
            { manufacturer: contains },
            { brand: contains },
            { category: contains },
            { subcategory: contains },
            { description: contains }
          ]
        }
      : {})
  };
}

export async function listItems(input: ItemSearchInput) {
  const items = await prisma.item.findMany({
    where: searchWhere(input),
    include: itemInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
    take: 200
  });
  return items.map(toItemRecord);
}

export async function searchActiveItems(input: ItemSearchInput) {
  const items = await prisma.item.findMany({
    where: searchWhere({ ...input, includeInactive: false, status: "ACTIVE" }),
    include: itemInclude,
    orderBy: [{ name: "asc" }],
    take: 40
  });
  return items.map(toItemRecord);
}

async function replaceRelations(
  tx: Prisma.TransactionClient,
  parentItemId: string,
  relations: CreateItemInput["relations"] | NonNullable<UpdateItemInput["relations"]>
) {
  await tx.itemRelation.deleteMany({ where: { parentItemId } });
  if (!relations.length) return;

  if (relations.some((relation) => relation.childItemId === parentItemId)) {
    throw new Error("ITEM_RELATION_SELF");
  }

  const uniqueRelations = Array.from(
    new Map(relations.map((relation) => [relationKey(relation), relation])).values()
  );
  const childCount = await tx.item.count({
    where: { id: { in: uniqueRelations.map((relation) => relation.childItemId) } }
  });
  if (childCount !== new Set(uniqueRelations.map((relation) => relation.childItemId)).size) {
    throw new Error("ITEM_RELATION_CHILD_NOT_FOUND");
  }

  await tx.itemRelation.createMany({
    data: uniqueRelations.map((relation) => ({
      parentItemId,
      childItemId: relation.childItemId,
      relationType: relation.relationType,
      defaultQuantity: relation.defaultQuantity,
      sortOrder: relation.sortOrder
    }))
  });
}

export async function getItemById(id: string) {
  return toItemRecord(await itemOrThrow(id));
}

export async function createItem(input: CreateItemInput) {
  const created = await prisma.$transaction(async (tx) => {
    await validateDefaultLaborItem(
      tx,
      input.defaultLaborItemId,
      input.defaultLaborHours
    );
    const item = await tx.item.create({
      data: createItemData(input)
    });
    await replaceRelations(tx, item.id, input.relations);
    return tx.item.findUniqueOrThrow({
      where: { id: item.id },
      include: itemInclude
    });
  });
  return toItemRecord(created);
}

export async function updateItem(id: string, input: UpdateItemInput) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.item.findUnique({
      where: { id },
      select: { defaultLaborItemId: true, defaultLaborHours: true }
    });
    if (!existing) throw new Error("ITEM_NOT_FOUND");
    const defaultLaborItemId =
      input.defaultLaborItemId !== undefined
        ? input.defaultLaborItemId || null
        : existing.defaultLaborItemId;
    const defaultLaborHours =
      input.defaultLaborHours !== undefined
        ? input.defaultLaborHours
        : Number(existing.defaultLaborHours);
    await validateDefaultLaborItem(
      tx,
      defaultLaborItemId,
      defaultLaborHours,
      id
    );
    await tx.item.update({
      where: { id },
      data: updateItemData(input)
    });
    if (input.relations) {
      await replaceRelations(tx, id, input.relations);
    }
    return tx.item.findUniqueOrThrow({
      where: { id },
      include: itemInclude
    });
  });
  return toItemRecord(updated);
}

export async function markItemInactive(id: string) {
  await itemOrThrow(id);
  const item = await prisma.item.update({
    where: { id },
    data: { status: "INACTIVE" },
    include: itemInclude
  });
  return toItemRecord(item);
}
