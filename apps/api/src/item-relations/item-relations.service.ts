import { Injectable } from "@nestjs/common";
import type {
  CreateItemInput,
  ItemRelationType,
  UpdateItemInput
} from "@pulse/contracts/items";
import type { Prisma } from "@/generated/prisma/client";

type ItemRelationsInput =
  | CreateItemInput["relations"]
  | NonNullable<UpdateItemInput["relations"]>;

function relationKey(relation: {
  childItemId: string;
  relationType: ItemRelationType;
}) {
  return `${relation.childItemId}:${relation.relationType}`;
}

@Injectable()
export class ItemRelationsService {
  async validateDefaultLaborItem(
    tx: Prisma.TransactionClient,
    defaultLaborItemId: string | null | undefined,
    defaultLaborHours: number,
    parentItemId?: string
  ) {
    if (!defaultLaborItemId) {
      if (defaultLaborHours > 0) {
        throw new Error("ITEM_DEFAULT_LABOR_REQUIRED");
      }
      return;
    }

    if (defaultLaborItemId === parentItemId) {
      throw new Error("ITEM_DEFAULT_LABOR_SELF");
    }

    const laborItem = await tx.item.findUnique({
      where: { id: defaultLaborItemId },
      select: { itemType: true, status: true }
    });

    if (!laborItem) {
      throw new Error("ITEM_DEFAULT_LABOR_NOT_FOUND");
    }

    if (laborItem.itemType !== "LABOR" || laborItem.status !== "ACTIVE") {
      throw new Error("ITEM_DEFAULT_LABOR_INVALID");
    }
  }

  async replaceRelations(
    tx: Prisma.TransactionClient,
    parentItemId: string,
    relations: ItemRelationsInput
  ) {
    await tx.itemRelation.deleteMany({ where: { parentItemId } });

    if (!relations.length) {
      return;
    }

    if (relations.some((relation) => relation.childItemId === parentItemId)) {
      throw new Error("ITEM_RELATION_SELF");
    }

    const uniqueRelations = Array.from(
      new Map(
        relations.map((relation) => [relationKey(relation), relation])
      ).values()
    );
    const uniqueChildIds = new Set(
      uniqueRelations.map((relation) => relation.childItemId)
    );
    const childCount = await tx.item.count({
      where: { id: { in: [...uniqueChildIds] } }
    });

    if (childCount !== uniqueChildIds.size) {
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
}
