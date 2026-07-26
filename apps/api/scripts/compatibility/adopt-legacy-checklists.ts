import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const apply = process.argv.includes("--apply");

async function main() {
  const [requests, legacyChecklistItems] = await Promise.all([
    prisma.request.findMany({
      where: {
        checklistInstances: { none: {} },
        checklistItems: { some: {} }
      },
      select: {
        id: true,
        requestNumber: true,
        checklistTemplateId: true,
        checklistTemplateNameSnapshot: true,
        checklistTemplate: { select: { key: true, name: true } },
        checklistItems: { select: { id: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }
      },
      orderBy: { requestNumber: "asc" }
    }),
    prisma.requestChecklistItem.findMany({
      where: { checklistInstanceId: null },
      select: {
        id: true,
        requestId: true,
        templateItemId: true,
        checklistInstanceId: true,
        label: true,
        description: true,
        required: true,
        appliesWhen: true,
        sortOrder: true,
        group: true,
        completed: true,
        completedAt: true,
        completedById: true,
        completedByNameSnapshot: true,
        notes: true,
        request: {
          select: {
            requestNumber: true,
            checklistInstances: {
              select: {
                id: true,
                templateKeySnapshot: true,
                items: {
                  select: {
                    id: true,
                    templateItemId: true,
                    checklistInstanceId: true,
                    label: true,
                    description: true,
                    required: true,
                    appliesWhen: true,
                    sortOrder: true,
                    group: true,
                    completed: true,
                    completedAt: true,
                    completedById: true,
                    completedByNameSnapshot: true,
                    notes: true
                  }
                }
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }]
            }
          }
        }
      },
      orderBy: [{ requestId: "asc" }, { sortOrder: "asc" }, { id: "asc" }]
    })
  ]);
  const plan = requests.map((request) => ({
    entityType: "Request",
    entityId: request.id,
    identifier: request.requestNumber,
    currentValue: { checklistInstanceCount: 0, legacyItemIds: request.checklistItems.map((item) => item.id) },
    proposedRepair: {
      createOneInstance: true,
      templateId: request.checklistTemplateId,
      templateKeySnapshot: request.checklistTemplate?.key ?? "legacy-adopted",
      templateNameSnapshot: request.checklistTemplateNameSnapshot ?? request.checklistTemplate?.name ?? "Legacy request checklist",
      reparentExistingItems: request.checklistItems.length,
      deleteItems: 0
    },
    reason: "Expose one canonical checklist-instance path while preserving every legacy item and completion value.",
    confidence: "high",
    automaticRepairSafe: true,
    humanReviewRequired: false
  }));
  const legacyOnlyRequestIds = new Set(requests.map((request) => request.id));
  const comparablePayload = (item: {
    templateItemId: string | null;
    label: string;
    description: string | null;
    required: boolean;
    appliesWhen: string | null;
    sortOrder: number;
    group: string | null;
    completed: boolean;
    completedAt: Date | null;
    completedById: string | null;
    completedByNameSnapshot: string | null;
    notes: string | null;
  }) => ({
    templateItemId: item.templateItemId,
    label: item.label,
    description: item.description,
    required: item.required,
    appliesWhen: item.appliesWhen,
    sortOrder: item.sortOrder,
    group: item.group,
    completed: item.completed,
    completedAt: item.completedAt?.toISOString() ?? null,
    completedById: item.completedById,
    completedByNameSnapshot: item.completedByNameSnapshot,
    notes: item.notes
  });
  const coexistence = legacyChecklistItems
    .filter((item) => !legacyOnlyRequestIds.has(item.requestId))
    .map((item) => {
      const matches = item.request.checklistInstances.flatMap((instance) =>
        instance.items
          .filter((candidate) => item.templateItemId && candidate.templateItemId === item.templateItemId)
          .map((candidate) => ({
            id: candidate.id,
            checklistInstanceId: candidate.checklistInstanceId,
            templateKey: instance.templateKeySnapshot,
            payloadEquivalent: JSON.stringify(comparablePayload(candidate)) === JSON.stringify(comparablePayload(item))
          }))
      );
      const payloadEquivalent = matches.length === 1 && matches[0]?.payloadEquivalent === true;
      return {
      entityType: "RequestChecklistItem",
      entityId: item.id,
      identifier: `${item.request.requestNumber}:${item.id}`,
        currentValue: {
          requestId: item.requestId,
          checklistInstanceId: null,
          payload: comparablePayload(item),
          matchingCanonicalItems: matches
        },
        proposedRepair: "No automatic change; retain as a legacy compatibility record pending reviewed disposition.",
        reason: payloadEquivalent
          ? "A payload-equivalent canonical item exists, but attaching this row would expose a duplicate item."
          : "Canonical and legacy state cannot be merged without choosing which historical completion data is authoritative.",
        confidence: matches.length === 1 ? "medium" : "low",
      automaticRepairSafe: false,
        humanReviewRequired: true
      };
    });
  const digestPayload = legacyChecklistItems.map((item) => ({
    id: item.id,
    requestId: item.requestId,
    payload: comparablePayload(item),
    canonicalCandidates: item.request.checklistInstances.flatMap((instance) =>
      instance.items
        .filter((candidate) => item.templateItemId && candidate.templateItemId === item.templateItemId)
        .map((candidate) => ({ id: candidate.id, checklistInstanceId: candidate.checklistInstanceId, payload: comparablePayload(candidate) }))
    )
  }));
  const reportDigest = createHash("sha256").update(JSON.stringify(digestPayload)).digest("hex");
  const candidateItemCount = plan.reduce((count, row) => count + row.currentValue.legacyItemIds.length, 0);
  const payloadEquivalentCoexistenceItems = coexistence.filter((item) =>
    item.currentValue.matchingCanonicalItems.length === 1 && item.currentValue.matchingCanonicalItems[0]?.payloadEquivalent
  ).length;
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    reportDigest,
    summary: {
      legacyTableItemsReviewed: legacyChecklistItems.length,
      requestsToAdopt: plan.length,
      itemsToReparent: candidateItemCount,
      coexistenceItemsDeferred: coexistence.length,
      payloadEquivalentCoexistenceItems,
      conflictingOrAmbiguousCoexistenceItems: coexistence.length - payloadEquivalentCoexistenceItems,
      itemsDeleted: 0
    },
    plan,
    coexistence
  }, null, 2));
  if (!apply) {
    console.log("No changes made. Apply requires --apply and PULSE_REPAIR_REPORT_DIGEST matching this preview.");
    return;
  }
  if (!plan.length) {
    console.log("All legacy checklist items already use canonical checklist instances; no changes made.");
    return;
  }
  if (process.env.PULSE_REPAIR_REPORT_DIGEST !== reportDigest) throw new Error("PULSE_REPAIR_REPORT_DIGEST does not match the reviewed checklist preview.");
  const completed = await prisma.maintenanceRun.findFirst({
    where: { kind: "LEGACY_CHECKLIST_ADOPTION", mode: "APPLY", reportDigest, completedAt: { not: null } },
    select: { id: true }
  });
  if (completed) {
    console.log(`Legacy checklist adoption already completed in maintenance run ${completed.id}.`);
    return;
  }

  await prisma.$transaction(async (transaction) => {
    const run = await transaction.maintenanceRun.create({
      data: {
        kind: "LEGACY_CHECKLIST_ADOPTION",
        mode: "APPLY",
        reportDigest,
        actorEmailSnapshot: process.env.PULSE_MAINTENANCE_ACTOR_EMAIL || null,
        summary: { requests: plan.length, items: plan.reduce((count, row) => count + row.currentValue.legacyItemIds.length, 0), deleted: 0 }
      }
    });
    for (const request of requests) {
      const existing = await transaction.requestChecklistInstance.findFirst({ where: { requestId: request.id } });
      if (existing) continue;
      const instance = await transaction.requestChecklistInstance.create({
        data: {
          requestId: request.id,
          templateId: request.checklistTemplateId,
          templateKeySnapshot: request.checklistTemplate?.key ?? "legacy-adopted",
          templateNameSnapshot: request.checklistTemplateNameSnapshot ?? request.checklistTemplate?.name ?? "Legacy request checklist",
          matchType: "CORE",
          matchValue: "legacy-adoption",
          active: true
        }
      });
      await transaction.requestChecklistItem.updateMany({
        where: { requestId: request.id, checklistInstanceId: null },
        data: { checklistInstanceId: instance.id }
      });
      await transaction.activity.create({
        data: {
          relatedEntityType: "Request",
          relatedEntityId: request.id,
          actorName: "Pulse Maintenance",
          actorRole: "System",
          type: "Compatibility Adoption",
          title: "Legacy checklist adopted into canonical instance",
          metadata: { maintenanceRunId: run.id, checklistInstanceId: instance.id, preservedItemCount: request.checklistItems.length }
        }
      });
    }
    await transaction.maintenanceRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
  });
  console.log("Legacy checklists adopted without deleting or recreating checklist items.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Legacy checklist adoption failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
