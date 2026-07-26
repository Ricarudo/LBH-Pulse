import "dotenv/config";
import { createHash } from "node:crypto";
import { LifecycleEntityType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  lifecycleEventIdentity,
  resolveLifecycleLedger,
  type LifecycleLedgerEvent
} from "@/lib/lifecycleLedger";

const apply = process.argv.includes("--apply");
const markExactDuplicates = process.argv.includes("--mark-exact-duplicates");

type AuditedEvent = LifecycleLedgerEvent & {
  entityType: LifecycleEntityType;
  entityId: string;
  createdAt: Date;
  disposition: {
    status: string;
    reason: string;
    maintenanceRunId: string;
    reviewedAt: Date;
  } | null;
};

async function main() {
  const [dispositionCatalog] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('pulse."LifecycleEventDisposition"') IS NOT NULL AS present
  `;
  const dispositionTablePresent = Boolean(dispositionCatalog?.present);
  const [requests, quotes, projects, invoices, sourceEvents, dispositions] = await Promise.all([
    prisma.request.findMany({ select: { id: true, requestNumber: true, status: true } }),
    prisma.quote.findMany({ select: { id: true, quoteNumber: true, status: true } }),
    prisma.project.findMany({ select: { id: true, projectNumber: true, status: true } }),
    prisma.invoice.findMany({ select: { id: true, invoiceNumber: true, status: true } }),
    prisma.lifecycleStatusEvent.findMany({
      orderBy: [{ entityType: "asc" }, { entityId: "asc" }, { changedAt: "asc" }, { id: "asc" }]
    }),
    dispositionTablePresent
      ? prisma.lifecycleEventDisposition.findMany({
          select: { eventId: true, status: true, reason: true, maintenanceRunId: true, reviewedAt: true }
        })
      : Promise.resolve([])
  ]);
  const dispositionsByEvent = new Map(dispositions.map(({ eventId, ...disposition }) => [eventId, disposition]));
  const events: AuditedEvent[] = sourceEvents.map((event) => ({
    ...event,
    disposition: dispositionsByEvent.get(event.id) ?? null
  }));
  const entities = new Map<string, { identifier: string; status: string }>([
    ...requests.map((row) => [`${LifecycleEntityType.REQUEST}:${row.id}`, { identifier: row.requestNumber, status: row.status }] as const),
    ...quotes.map((row) => [`${LifecycleEntityType.QUOTE}:${row.id}`, { identifier: row.quoteNumber, status: row.status }] as const),
    ...projects.map((row) => [`${LifecycleEntityType.PROJECT}:${row.id}`, { identifier: row.projectNumber, status: row.status }] as const),
    ...invoices.map((row) => [`${LifecycleEntityType.INVOICE}:${row.id}`, { identifier: row.invoiceNumber, status: row.status }] as const)
  ]);
  const grouped = new Map<string, AuditedEvent[]>();
  for (const event of events) {
    const key = `${event.entityType}:${event.entityId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const duplicateIds = new Set<string>();
  const transitionCollisionIds = new Set<string>();
  for (const entityEvents of grouped.values()) {
    const identities = new Map<string, AuditedEvent[]>();
    const transitions = new Map<string, AuditedEvent[]>();
    for (const event of entityEvents) {
      const identity = lifecycleEventIdentity(event);
      identities.set(identity, [...(identities.get(identity) ?? []), event]);
      const transition = JSON.stringify({
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changedAt: event.changedAt.toISOString(),
        source: event.source,
        precision: event.precision
      });
      transitions.set(transition, [...(transitions.get(transition) ?? []), event]);
    }
    for (const duplicates of identities.values()) {
      duplicates.sort((left, right) => left.id.localeCompare(right.id)).slice(1).forEach((event) => duplicateIds.add(event.id));
    }
    for (const collisions of transitions.values()) {
      const identitiesInCollision = new Set(collisions.map(lifecycleEventIdentity));
      if (collisions.length > 1 && identitiesInCollision.size > 1) {
        collisions.sort((left, right) => left.id.localeCompare(right.id)).slice(1)
          .forEach((event) => transitionCollisionIds.add(event.id));
      }
    }
  }

  const affected = [];
  for (const [key, entityEvents] of grouped) {
    const entity = entities.get(key);
    const currentStatus = entity?.status ?? entityEvents.at(-1)?.toStatus ?? "Unknown";
    const resolution = resolveLifecycleLedger(entityEvents, currentStatus);
    const chainBreaks = entityEvents.slice(1).flatMap((event, index) => {
      const previous = entityEvents[index];
      return event.fromStatus === previous.toStatus
        ? []
        : [{
            previousEventId: previous.id,
            eventId: event.id,
            expectedFromStatus: previous.toStatus,
            actualFromStatus: event.fromStatus,
            at: event.changedAt.toISOString(),
            source: event.source
          }];
    });
    const collisionGroups = new Map<string, AuditedEvent[]>();
    for (const event of entityEvents) {
      const transition = JSON.stringify({
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changedAt: event.changedAt.toISOString(),
        source: event.source,
        precision: event.precision
      });
      collisionGroups.set(transition, [...(collisionGroups.get(transition) ?? []), event]);
    }
    const transitionCollisions = [...collisionGroups.values()].flatMap((collisions) => {
      if (collisions.length < 2) return [];
      const identities = new Set(collisions.map(lifecycleEventIdentity));
      return [{
        eventIds: collisions.map((event) => event.id),
        payloadEquivalent: identities.size === 1,
        detail: identities.size === 1
          ? "Transition identity and full payload are equivalent."
          : "Transition identity matches, but value/provenance payload differs; automatic disposition is unsafe."
      }];
    });
    const latestEvent = entityEvents.at(-1);
    const latestEventDisagreesWithCurrent = Boolean(latestEvent && latestEvent.toStatus !== currentStatus);
    if (!resolution.issues.length && !chainBreaks.length && !transitionCollisions.length && !latestEventDisagreesWithCurrent) continue;
    affected.push({
      entityType: entityEvents[0].entityType,
      entityId: entityEvents[0].entityId,
      identifier: entity?.identifier ?? entityEvents[0].entityId,
      currentStatus,
      orderedEvents: entityEvents.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changedAt: event.changedAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
        source: event.source,
        precision: event.precision,
        disposition: event.disposition ?? null
      })),
      issues: resolution.issues.map((issue) => ({ ...issue, at: issue.at?.toISOString() ?? null })),
      chainBreakLocation: chainBreaks[0]?.at ?? null,
      chainBreaks,
      duplicateEvents: resolution.issues.filter((issue) => issue.type === "exact-duplicate").flatMap((issue) => issue.eventIds.slice(1)),
      transitionCollisions,
      timestampAnomalies: resolution.issues.filter((issue) => issue.type.includes("timestamp")),
      latestEventStatus: latestEvent?.toStatus ?? null,
      latestEventDisagreesWithCurrent,
      proposedCanonicalSequence: resolution.canonicalEvents.map((event) => event.id),
      deterministic: resolution.deterministic,
      unreliableFrom: resolution.unreliableFrom?.toISOString() ?? null
    });
  }

  const reportDigest = createHash("sha256").update(JSON.stringify({
    affected: affected.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      eventIds: entity.orderedEvents.map((event) => event.id),
      issueTypes: entity.issues.map((issue) => issue.type),
      chainBreakEventIds: entity.chainBreaks.map((issue) => issue.eventId),
      transitionCollisions: entity.transitionCollisions,
      latestEventDisagreesWithCurrent: entity.latestEventDisagreesWithCurrent
    })),
    duplicateIds: [...duplicateIds].sort(),
    transitionCollisionIds: [...transitionCollisionIds].sort()
  })).digest("hex");
  const pendingDuplicateIds = [...duplicateIds].filter((eventId) =>
    events.find((event) => event.id === eventId)?.disposition?.status !== "DUPLICATE"
  );
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: apply ? "APPLY" : "PREVIEW",
    reportDigest,
    summary: {
      eventCount: events.length,
      affectedEntityCount: affected.length,
      chainBreaks: affected.reduce((count, entity) => count + entity.chainBreaks.length, 0),
      legacyQuoteChainBreaks: affected.reduce((count, entity) => count + (
        entity.entityType === LifecycleEntityType.QUOTE
          ? entity.chainBreaks.filter((issue) => issue.source === "LEGACY_IMPORT").length
          : 0
      ), 0),
      exactDuplicateEvents: duplicateIds.size,
      conflictingTransitionCollisions: transitionCollisionIds.size,
      latestEventCurrentStatusDisagreements: affected.filter((entity) => entity.latestEventDisagreesWithCurrent).length,
      pendingExactDuplicateEvents: pendingDuplicateIds.length,
      deterministicEntities: affected.filter((entity) => entity.deterministic).length,
      ambiguousEntities: affected.filter((entity) => !entity.deterministic).length
    },
    repairPolicy: {
      automatic: "Mark payload-identical duplicate events as DUPLICATE; preserve every original row.",
      transitionCollision: "No automatic write when status/timestamp identity matches but value or provenance payload differs.",
      ambiguous: "No write. Requires reviewed evidence and a separate explicit disposition plan.",
      fabricatedTransitions: false
    },
    affected
  }, null, 2));

  if (!apply) {
    console.log("No changes made. Exact-duplicate disposition requires --apply --mark-exact-duplicates and a matching PULSE_REPAIR_REPORT_DIGEST.");
    return;
  }
  if (!dispositionTablePresent) {
    throw new Error("Lifecycle disposition schema is not deployed; pre-baseline environments support preview only.");
  }
  if (!markExactDuplicates) throw new Error("Write mode requires --mark-exact-duplicates; ambiguous lifecycle events are never changed automatically.");
  if (!pendingDuplicateIds.length) {
    console.log("All exact duplicate events already have reviewed DUPLICATE dispositions; no changes made.");
    return;
  }
  if (process.env.PULSE_REPAIR_REPORT_DIGEST !== reportDigest) throw new Error("PULSE_REPAIR_REPORT_DIGEST does not match the reviewed lifecycle preview.");
  const completed = await prisma.maintenanceRun.findFirst({
    where: { kind: "LIFECYCLE_DUPLICATE_DISPOSITION", mode: "APPLY", reportDigest, completedAt: { not: null } },
    select: { id: true }
  });
  if (completed) {
    console.log(`Lifecycle duplicate disposition already completed in maintenance run ${completed.id}.`);
    return;
  }

  const actorEmail = process.env.PULSE_MAINTENANCE_ACTOR_EMAIL?.trim().toLowerCase();
  const actor = actorEmail
    ? await prisma.localUser.findUnique({ where: { email: actorEmail }, select: { id: true, email: true } })
    : null;
  await prisma.$transaction(async (transaction) => {
    const run = await transaction.maintenanceRun.create({
      data: {
        kind: "LIFECYCLE_DUPLICATE_DISPOSITION",
        mode: "APPLY",
        reportDigest,
        actorUserId: actor?.id ?? null,
        actorEmailSnapshot: actor?.email ?? actorEmail ?? null,
        summary: { exactDuplicateEventIds: [...pendingDuplicateIds].sort(), rowsDeleted: 0, ambiguousEventsChanged: 0 }
      }
    });
    for (const eventId of [...pendingDuplicateIds].sort()) {
      const existing = await transaction.lifecycleEventDisposition.findUnique({ where: { eventId } });
      if (existing && existing.status !== "DUPLICATE") {
        throw new Error(`Event ${eventId} already has a conflicting reviewed disposition.`);
      }
      if (!existing) {
        await transaction.lifecycleEventDisposition.create({
          data: {
            eventId,
            status: "DUPLICATE",
            reason: "Payload-identical duplicate; excluded from Pulse 0.1 analytics without deleting source history.",
            maintenanceRunId: run.id,
            reviewedById: actor?.id ?? null
          }
        });
      }
    }
    await transaction.maintenanceRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
  });
  console.log("Exact duplicates were marked; no lifecycle event row was deleted and no transition was fabricated.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Lifecycle audit failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
