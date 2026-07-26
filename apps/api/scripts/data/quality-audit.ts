import "dotenv/config";
import { prisma } from "@/lib/db";

type Finding = {
  entityType: string;
  entityId: string;
  identifier: string;
  currentValue: unknown;
  proposedRepair: string;
  reason: string;
  confidence: "high" | "medium" | "low" | "none";
  automaticRepairSafe: boolean;
  humanReviewRequired: boolean;
};

async function main() {
  const [clientsWithoutSites, quotesWithoutSites, quotesWithoutAssignees, quotesWithoutContacts, request, anomalousQuotes] = await Promise.all([
    prisma.client.findMany({
      where: { sites: { none: {} } },
      select: { id: true, clientNumber: true, displayName: true },
      orderBy: { clientNumber: "asc" }
    }),
    prisma.quote.findMany({
      where: { siteId: null },
      select: { id: true, quoteNumber: true, clientId: true, status: true },
      orderBy: { quoteNumber: "asc" }
    }),
    prisma.quote.findMany({
      where: { assignedToId: null },
      select: { id: true, quoteNumber: true, owner: true, status: true },
      orderBy: { quoteNumber: "asc" }
    }),
    prisma.quote.findMany({
      where: { contactId: null },
      select: { id: true, quoteNumber: true, contactNameSnapshot: true, clientId: true },
      orderBy: { quoteNumber: "asc" }
    }),
    prisma.request.findUnique({
      where: { requestNumber: "RQ-2026-1001" },
      select: { id: true, requestNumber: true, currentStepId: true, status: true }
    }),
    prisma.quote.findMany({
      where: { quoteNumber: { in: ["QM260054", "QM260055"] } },
      select: { id: true, quoteNumber: true, status: true, sentAt: true, versionCreatedAt: true },
      orderBy: { quoteNumber: "asc" }
    })
  ]);

  const findings: Record<string, Finding[]> = {
    clientsWithoutSites: clientsWithoutSites.map((client) => ({
      entityType: "Client",
      entityId: client.id,
      identifier: client.clientNumber,
      currentValue: { siteCount: 0 },
      proposedRepair: "Review the client and create a real site through the application.",
      reason: "No trustworthy address can be inferred from the client row.",
      confidence: "none",
      automaticRepairSafe: false,
      humanReviewRequired: true
    })),
    quotesWithoutSites: quotesWithoutSites.map((quote) => ({
      entityType: "Quote",
      entityId: quote.id,
      identifier: quote.quoteNumber,
      currentValue: { siteId: null, clientId: quote.clientId, status: quote.status },
      proposedRepair: "Select a verified site belonging to the quote client.",
      reason: "Synthetic or inferred sites could misrepresent delivery scope.",
      confidence: "none",
      automaticRepairSafe: false,
      humanReviewRequired: true
    })),
    quotesWithoutAssignees: quotesWithoutAssignees.map((quote) => ({
      entityType: "Quote",
      entityId: quote.id,
      identifier: quote.quoteNumber,
      currentValue: { assignedToId: null, ownerSnapshot: quote.owner, status: quote.status },
      proposedRepair: "Select an active Pulse user after ownership review.",
      reason: "A free-text owner snapshot is not proof of the intended account.",
      confidence: "low",
      automaticRepairSafe: false,
      humanReviewRequired: true
    })),
    quotesWithoutContacts: quotesWithoutContacts.map((quote) => ({
      entityType: "Quote",
      entityId: quote.id,
      identifier: quote.quoteNumber,
      currentValue: { contactId: null, contactNameSnapshot: quote.contactNameSnapshot, clientId: quote.clientId },
      proposedRepair: "Match the historical snapshot to a verified client contact or document the unresolved exception.",
      reason: "Names alone are not a reliable unique identity.",
      confidence: "low",
      automaticRepairSafe: false,
      humanReviewRequired: true
    }))
  };

  if (request?.currentStepId) {
    const [current, successors] = await Promise.all([
      prisma.requestUpdate.findUnique({
        where: { id: request.currentStepId },
        select: { id: true, requestId: true, kind: true, stepStatus: true, supersedesId: true, createdAt: true }
      }),
      prisma.requestUpdate.findMany({
        where: { requestId: request.id, supersedesId: request.currentStepId },
        select: { id: true, kind: true, stepStatus: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    ]);
    const deterministic = successors.length === 1 && successors[0].stepStatus === "OPEN";
    findings.requestCurrentStep = [{
      entityType: "Request",
      entityId: request.id,
      identifier: request.requestNumber,
      currentValue: { status: request.status, currentStepId: request.currentStepId, currentUpdate: current, supersedingUpdates: successors },
      proposedRepair: deterministic
        ? `Point currentStepId to the sole open superseding update ${successors[0].id}.`
        : "Review the update chain and select the canonical open step.",
      reason: "The current pointer references an update that has been superseded.",
      confidence: deterministic ? "high" : "low",
      automaticRepairSafe: deterministic,
      humanReviewRequired: !deterministic
    }];
  } else {
    findings.requestCurrentStep = [];
  }

  findings.quoteSentBeforeVersion = [];
  for (const quote of anomalousQuotes) {
    const candidates = quote.versionCreatedAt
      ? await prisma.lifecycleStatusEvent.findMany({
          where: {
            entityType: "QUOTE",
            entityId: quote.id,
            toStatus: "Sent",
            changedAt: { gte: quote.versionCreatedAt },
            precision: "EXACT"
          },
          select: { id: true, changedAt: true, source: true, precision: true },
          orderBy: [{ changedAt: "asc" }, { id: "asc" }]
        })
      : [];
    const deterministic = candidates.length === 1;
    findings.quoteSentBeforeVersion.push({
      entityType: "Quote",
      entityId: quote.id,
      identifier: quote.quoteNumber,
      currentValue: {
        status: quote.status,
        sentAt: quote.sentAt?.toISOString() ?? null,
        versionCreatedAt: quote.versionCreatedAt?.toISOString() ?? null,
        exactPostVersionSentEvents: candidates.map((candidate) => ({ ...candidate, changedAt: candidate.changedAt.toISOString() }))
      },
      proposedRepair: deterministic
        ? `Set sentAt to the sole exact post-version Sent event ${candidates[0].changedAt.toISOString()}.`
        : "Review source documents and event provenance; no timestamp will be guessed.",
      reason: "A quote version cannot have been sent before it existed.",
      confidence: deterministic ? "high" : "none",
      automaticRepairSafe: deterministic,
      humanReviewRequired: !deterministic
    });
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_AUDIT",
    summary: Object.fromEntries(Object.entries(findings).map(([category, rows]) => [category, rows.length])),
    findings
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Data-quality audit failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
