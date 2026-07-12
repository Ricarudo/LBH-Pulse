import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateItemInput,
  ItemDetailResponse,
  ItemPriceHistoryRecord,
  ItemQuoteUsageRecord,
  ItemRecord,
  ItemRelationRecord,
  ItemRelationType,
  ItemSearchInput,
  ItemStatus,
  ItemType,
  UpdateItemInput
} from "@pulse/contracts/items";
import {
  Prisma,
  type PrismaClient
} from "@/generated/prisma/client";
import { ItemRelationsService } from "@/item-relations/item-relations.service";
import { PRISMA_CLIENT } from "@/shared/prisma.module";

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

type ItemWithRelations = Prisma.ItemGetPayload<{
  include: typeof itemInclude;
}>;

function dateOutput(value?: Date | null) {
  return value ? value.toISOString() : "";
}

function nullable(value?: string) {
  return value ? value : null;
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

function toPriceHistoryRecord(
  history: {
    id: string;
    previousCost: Prisma.Decimal | null;
    newCost: Prisma.Decimal;
    previousSellPrice: Prisma.Decimal | null;
    newSellPrice: Prisma.Decimal;
    changedAt: Date;
  }
): ItemPriceHistoryRecord {
  return {
    id: history.id,
    previousCost:
      history.previousCost === null ? null : Number(history.previousCost),
    newCost: Number(history.newCost),
    previousSellPrice:
      history.previousSellPrice === null
        ? null
        : Number(history.previousSellPrice),
    newSellPrice: Number(history.newSellPrice),
    changedAt: dateOutput(history.changedAt)
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

function createItemData(
  input: CreateItemInput
): Prisma.ItemUncheckedCreateInput {
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

function updateItemData(
  input: UpdateItemInput
): Prisma.ItemUncheckedUpdateInput {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined
      ? { description: nullable(input.description) }
      : {}),
    ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.sku !== undefined ? { sku: nullable(input.sku) } : {}),
    ...(input.partNumber !== undefined
      ? { partNumber: nullable(input.partNumber) }
      : {}),
    ...(input.manufacturer !== undefined
      ? { manufacturer: nullable(input.manufacturer) }
      : {}),
    ...(input.brand !== undefined ? { brand: nullable(input.brand) } : {}),
    ...(input.category !== undefined
      ? { category: nullable(input.category) }
      : {}),
    ...(input.subcategory !== undefined
      ? { subcategory: nullable(input.subcategory) }
      : {}),
    ...(input.unitOfMeasure !== undefined
      ? { unitOfMeasure: nullable(input.unitOfMeasure) }
      : {}),
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
    ...(input.sellPrice !== undefined ? { sellPrice: input.sellPrice } : {}),
    ...(input.markupPercent !== undefined
      ? { markupPercent: input.markupPercent }
      : {}),
    ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
    ...(input.primaryImageUrl !== undefined
      ? { primaryImageUrl: nullable(input.primaryImageUrl) }
      : {}),
    ...(input.productUrl !== undefined
      ? { productUrl: nullable(input.productUrl) }
      : {}),
    ...(input.datasheetUrl !== undefined
      ? { datasheetUrl: nullable(input.datasheetUrl) }
      : {}),
    ...(input.internalNotes !== undefined
      ? { internalNotes: nullable(input.internalNotes) }
      : {}),
    ...(input.quoteDescription !== undefined
      ? { quoteDescription: nullable(input.quoteDescription) }
      : {}),
    ...(input.defaultLaborHours !== undefined
      ? { defaultLaborHours: input.defaultLaborHours }
      : {}),
    ...(input.defaultLaborItemId !== undefined
      ? { defaultLaborItemId: input.defaultLaborItemId || null }
      : {})
  };
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

@Injectable()
export class ItemsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(ItemRelationsService)
    private readonly itemRelations: ItemRelationsService
  ) {}

  async listItems(input: ItemSearchInput): Promise<ItemRecord[]> {
    const items = await this.prisma.item.findMany({
      where: searchWhere(input),
      include: itemInclude,
      orderBy: [
        { status: "asc" },
        { updatedAt: "desc" },
        { name: "asc" }
      ],
      take: 200
    });

    return items.map(toItemRecord);
  }

  async searchActiveItems(input: ItemSearchInput): Promise<ItemRecord[]> {
    const items = await this.prisma.item.findMany({
      where: searchWhere({
        ...input,
        includeInactive: false,
        status: "ACTIVE"
      }),
      include: itemInclude,
      orderBy: [{ name: "asc" }],
      take: 40
    });

    return items.map(toItemRecord);
  }

  async getItemById(id: string): Promise<ItemRecord> {
    return toItemRecord(await this.itemOrThrow(id));
  }

  async getItemDetail(id: string): Promise<ItemDetailResponse> {
    const item = await this.itemOrThrow(id);
    const [quoteGroups, recentQuoteLines, priceHistory, priceChangeCount] =
      await Promise.all([
        this.prisma.quoteItem.groupBy({
          by: ["quoteId"],
          where: { sourceItemId: id },
          _count: { _all: true },
          _sum: { quantity: true, lineTotal: true }
        }),
        this.prisma.quoteItem.findMany({
          where: { sourceItemId: id },
          orderBy: [{ createdAt: "desc" }],
          take: 100,
          select: {
            quoteId: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            createdAt: true,
            quote: {
              select: {
                id: true,
                quoteNumber: true,
                title: true,
                status: true
              }
            }
          }
        }),
        this.prisma.itemPriceHistory.findMany({
          where: { itemId: id },
          orderBy: [{ changedAt: "desc" }],
          take: 50
        }),
        this.prisma.itemPriceHistory.count({
          where: { itemId: id, previousCost: { not: null } }
        })
      ]);

    const recentQuoteMap = new Map<string, ItemQuoteUsageRecord>();
    for (const line of recentQuoteLines) {
      const existing = recentQuoteMap.get(line.quoteId);
      if (existing) {
        existing.quoteLineCount += 1;
        existing.quantity += Number(line.quantity);
        existing.quotedValue += Number(line.lineTotal);
        continue;
      }

      recentQuoteMap.set(line.quoteId, {
        quoteId: line.quote.id,
        quoteNumber: line.quote.quoteNumber,
        quoteTitle: line.quote.title,
        quoteStatus: line.quote.status,
        quoteLineCount: 1,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        quotedValue: Number(line.lineTotal),
        quotedAt: dateOutput(line.createdAt)
      });
    }

    const summary = quoteGroups.reduce(
      (totals, group) => ({
        quoteLineCount: totals.quoteLineCount + group._count._all,
        totalQuantity: totals.totalQuantity + Number(group._sum.quantity ?? 0),
        totalQuotedValue:
          totals.totalQuotedValue + Number(group._sum.lineTotal ?? 0)
      }),
      { quoteLineCount: 0, totalQuantity: 0, totalQuotedValue: 0 }
    );

    return {
      item: toItemRecord(item),
      statistics: {
        quoteCount: quoteGroups.length,
        quoteLineCount: summary.quoteLineCount,
        totalQuantity: summary.totalQuantity,
        totalQuotedValue: summary.totalQuotedValue,
        latestQuotedAt: recentQuoteLines[0]
          ? dateOutput(recentQuoteLines[0].createdAt)
          : "",
        priceChangeCount
      },
      priceHistory: priceHistory.map(toPriceHistoryRecord),
      recentQuotes: [...recentQuoteMap.values()].slice(0, 8)
    };
  }

  async createItem(input: CreateItemInput): Promise<ItemRecord> {
    const created = await this.prisma.$transaction(async (tx) => {
      await this.itemRelations.validateDefaultLaborItem(
        tx,
        input.defaultLaborItemId,
        input.defaultLaborHours
      );
      const item = await tx.item.create({
        data: createItemData(input)
      });
      await tx.itemPriceHistory.create({
        data: {
          itemId: item.id,
          previousCost: null,
          newCost: item.cost,
          previousSellPrice: null,
          newSellPrice: item.sellPrice,
          changedAt: item.createdAt
        }
      });
      await this.itemRelations.replaceRelations(tx, item.id, input.relations);

      return tx.item.findUniqueOrThrow({
        where: { id: item.id },
        include: itemInclude
      });
    });

    return toItemRecord(created);
  }

  async updateItem(id: string, input: UpdateItemInput): Promise<ItemRecord> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.item.findUnique({
        where: { id },
        select: {
          defaultLaborItemId: true,
          defaultLaborHours: true,
          cost: true,
          sellPrice: true
        }
      });

      if (!existing) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const defaultLaborItemId =
        input.defaultLaborItemId !== undefined
          ? input.defaultLaborItemId || null
          : existing.defaultLaborItemId;
      const defaultLaborHours =
        input.defaultLaborHours !== undefined
          ? input.defaultLaborHours
          : Number(existing.defaultLaborHours);

      await this.itemRelations.validateDefaultLaborItem(
        tx,
        defaultLaborItemId,
        defaultLaborHours,
        id
      );
      const savedItem = await tx.item.update({
        where: { id },
        data: updateItemData(input),
        select: { cost: true, sellPrice: true }
      });

      if (
        Number(existing.cost) !== Number(savedItem.cost) ||
        Number(existing.sellPrice) !== Number(savedItem.sellPrice)
      ) {
        await tx.itemPriceHistory.create({
          data: {
            itemId: id,
            previousCost: existing.cost,
            newCost: savedItem.cost,
            previousSellPrice: existing.sellPrice,
            newSellPrice: savedItem.sellPrice
          }
        });
      }

      if (input.relations) {
        await this.itemRelations.replaceRelations(tx, id, input.relations);
      }

      return tx.item.findUniqueOrThrow({
        where: { id },
        include: itemInclude
      });
    });

    return toItemRecord(updated);
  }

  async markItemInactive(id: string): Promise<ItemRecord> {
    await this.itemOrThrow(id);
    const item = await this.prisma.item.update({
      where: { id },
      data: { status: "INACTIVE" },
      include: itemInclude
    });

    return toItemRecord(item);
  }

  private async itemOrThrow(id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id },
      include: itemInclude
    });

    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    return item;
  }
}
