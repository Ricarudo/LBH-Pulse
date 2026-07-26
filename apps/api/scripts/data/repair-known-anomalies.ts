import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const apply = process.argv.includes("--apply");

async function plan() {
  const request = await prisma.request.findUnique({
    where: { requestNumber: "RQ-2026-1001" },
    select: { id: true, requestNumber: true, currentStepId: true }
  });
  const requestCurrent = request?.currentStepId
    ? await prisma.requestUpdate.findUnique({
        where: { id: request.currentStepId },
        select: { id: true, stepStatus: true, supersedesId: true }
      })
    : null;
  const requestSuccessors = request?.currentStepId
    ? await prisma.requestUpdate.findMany({
        where: { requestId: request.id, supersedesId: request.currentStepId },
        select: { id: true, stepStatus: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    : [];
  const requestCandidate = requestCurrent?.stepStatus === "OPEN" && requestSuccessors.length === 0
    ? requestCurrent
    : requestSuccessors.length === 1 && requestSuccessors[0].stepStatus === "OPEN"
      ? requestSuccessors[0]
      : null;

  const quotes = await prisma.quote.findMany({
    where: { quoteNumber: { in: ["QM260054", "QM260055"] } },
    select: { id: true, quoteNumber: true, sentAt: true, versionCreatedAt: true },
    orderBy: { quoteNumber: "asc" }
  });
  const quotePlans = [];
  for (const quote of quotes) {
    const candidates = quote.versionCreatedAt
      ? await prisma.lifecycleStatusEvent.findMany({
          where: { entityType: "QUOTE", entityId: quote.id, toStatus: "Sent", changedAt: { gte: quote.versionCreatedAt }, precision: "EXACT" },
          select: { id: true, changedAt: true },
          orderBy: [{ changedAt: "asc" }, { id: "asc" }]
        })
      : [];
    quotePlans.push({ ...quote, candidate: candidates.length === 1 ? candidates[0] : null, candidateCount: candidates.length });
  }
  return { request, requestSuccessors, requestCandidate, quotePlans };
}

async function main() {
  const repairPlan = await plan();
  const digestInput = {
    request: repairPlan.request ? {
      id: repairPlan.request.id,
      to: repairPlan.requestCandidate?.id ?? null
    } : null,
    quotes: repairPlan.quotePlans.map((quote) => ({
      id: quote.id,
      version: quote.versionCreatedAt?.toISOString() ?? null,
      to: quote.candidate?.changedAt.toISOString() ?? null,
      evidenceEventId: quote.candidate?.id ?? null
    }))
  };
  const reportDigest = createHash("sha256").update(JSON.stringify(digestInput)).digest("hex");
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    reportDigest,
    request: {
      entityId: repairPlan.request?.id ?? null,
      identifier: repairPlan.request?.requestNumber ?? "RQ-2026-1001",
      currentStepId: repairPlan.request?.currentStepId ?? null,
      proposedCurrentStepId: repairPlan.requestCandidate?.id ?? null,
      changeRequired: Boolean(repairPlan.requestCandidate && repairPlan.request?.currentStepId !== repairPlan.requestCandidate.id),
      successors: repairPlan.requestSuccessors,
      deterministic: Boolean(repairPlan.requestCandidate)
    },
    quotes: repairPlan.quotePlans.map((quote) => ({
      entityId: quote.id,
      identifier: quote.quoteNumber,
      sentAt: quote.sentAt?.toISOString() ?? null,
      versionCreatedAt: quote.versionCreatedAt?.toISOString() ?? null,
      proposedSentAt: quote.candidate?.changedAt.toISOString() ?? null,
      changeRequired: Boolean(quote.candidate && quote.sentAt?.getTime() !== quote.candidate.changedAt.getTime()),
      evidenceEventId: quote.candidate?.id ?? null,
      deterministic: Boolean(quote.candidate),
      humanReviewRequired: !quote.candidate
    }))
  }, null, 2));
  if (!apply) {
    console.log("No changes made. Apply requires --apply and PULSE_REPAIR_REPORT_DIGEST matching this preview.");
    return;
  }
  if (process.env.PULSE_REPAIR_REPORT_DIGEST !== reportDigest) {
    throw new Error("PULSE_REPAIR_REPORT_DIGEST does not match the reviewed preview.");
  }
  const completed = await prisma.maintenanceRun.findFirst({
    where: { kind: "KNOWN_ANOMALY_REPAIR", mode: "APPLY", reportDigest, completedAt: { not: null } },
    select: { id: true }
  });
  if (completed) {
    console.log(`Known-anomaly repair was already applied by maintenance run ${completed.id}.`);
    return;
  }

  await prisma.$transaction(async (transaction) => {
    const run = await transaction.maintenanceRun.create({
      data: {
        kind: "KNOWN_ANOMALY_REPAIR",
        mode: "APPLY",
        reportDigest,
        actorEmailSnapshot: process.env.PULSE_MAINTENANCE_ACTOR_EMAIL || null,
        summary: { deterministicOnly: true, input: digestInput }
      }
    });
    if (repairPlan.request && repairPlan.requestCandidate && repairPlan.request.currentStepId !== repairPlan.requestCandidate.id) {
      await transaction.request.update({
        where: { id: repairPlan.request.id },
        data: { currentStepId: repairPlan.requestCandidate.id }
      });
      await transaction.activity.create({
        data: {
          relatedEntityType: "Request",
          relatedEntityId: repairPlan.request.id,
          actorName: "Pulse Maintenance",
          actorRole: "System",
          type: "Data Repair",
          title: "Superseded current-step pointer repaired",
          metadata: { maintenanceRunId: run.id, from: repairPlan.request.currentStepId, to: repairPlan.requestCandidate.id }
        }
      });
    }
    for (const quote of repairPlan.quotePlans.filter((candidate) =>
      candidate.candidate && candidate.sentAt?.getTime() !== candidate.candidate.changedAt.getTime()
    )) {
      await transaction.quote.update({ where: { id: quote.id }, data: { sentAt: quote.candidate!.changedAt } });
      await transaction.activity.create({
        data: {
          relatedEntityType: "Quote",
          relatedEntityId: quote.id,
          actorName: "Pulse Maintenance",
          actorRole: "System",
          type: "Data Repair",
          title: "Quote sent timestamp repaired from exact lifecycle evidence",
          metadata: { maintenanceRunId: run.id, evidenceEventId: quote.candidate!.id }
        }
      });
    }
    await transaction.maintenanceRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
  });
  console.log("Deterministic known-anomaly repairs applied; ambiguous records were not changed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Known-anomaly repair failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
