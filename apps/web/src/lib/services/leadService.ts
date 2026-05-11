import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { LeadActivityType, LeadRecord } from "@/types/lead";
import type {
  ConvertLeadInput,
  CreateLeadActivityInput,
  CreateLeadInput,
  CreateLeadTaskInput,
  UpdateLeadInput
} from "@/lib/validations/lead";

const leadInclude = {
  activities: {
    orderBy: {
      createdAt: "desc"
    }
  },
  tasks: {
    orderBy: {
      createdAt: "desc"
    }
  },
  attachments: {
    orderBy: {
      createdAt: "desc"
    }
  }
} satisfies Prisma.LeadInclude;

type LeadWithRelations = Prisma.LeadGetPayload<{
  include: typeof leadInclude;
}>;

function parseDateInput(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateInput(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDateTime(date?: Date | null) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toLeadRecord(lead: LeadWithRelations): LeadRecord {
  return {
    id: lead.id,
    leadNumber: lead.leadNumber,
    name: lead.name,
    companyName: lead.companyName ?? "",
    contactName: lead.contactName ?? "",
    contactTitle: lead.contactTitle ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    leadSource: lead.leadSource as LeadRecord["leadSource"],
    serviceInterest: lead.serviceInterest as LeadRecord["serviceInterest"],
    siteName: lead.siteName ?? "",
    siteAddress: lead.siteAddress ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    estimatedValue: Number(lead.estimatedValue),
    status: lead.status as LeadRecord["status"],
    priority: lead.priority as LeadRecord["priority"],
    assignedOwner: lead.assignedOwner,
    nextFollowUpDate: formatDateInput(lead.nextFollowUpDate),
    notes: lead.notes ?? "",
    qualificationContactIdentified: lead.qualificationContactIdentified,
    qualificationSiteKnown: lead.qualificationSiteKnown,
    qualificationBudgetKnown: lead.qualificationBudgetKnown,
    qualificationFollowUpScheduled: lead.qualificationFollowUpScheduled,
    converted: lead.converted,
    convertedOpportunityId: lead.convertedOpportunityId ?? undefined,
    convertedQuoteId: lead.convertedQuoteId ?? undefined,
    convertedProjectId: lead.convertedProjectId ?? undefined,
    archivedAt: lead.archivedAt ? lead.archivedAt.toISOString() : undefined,
    createdAt: formatDateInput(lead.createdAt),
    updatedAt: lead.updatedAt.toISOString(),
    lastActivityAt: formatDateTime(lead.lastActivityAt ?? lead.updatedAt),
    files: lead.attachments.map((attachment) => attachment.fileName),
    activity: lead.activities.map((activity) => ({
      id: activity.id,
      type: activity.type as LeadActivityType,
      title: activity.title,
      body: activity.body ?? undefined,
      actor: activity.actor,
      at: formatDateTime(activity.createdAt)
    })),
    tasks: lead.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: formatDateInput(task.dueAt),
      owner: task.owner,
      completed: Boolean(task.completedAt)
    }))
  };
}

async function generateLeadNumber(tx: Prisma.TransactionClient) {
  const count = await tx.lead.count();
  return `LD-2026-${String(1001 + count).padStart(4, "0")}`;
}

async function getLeadOrThrow(id: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: leadInclude
  });

  if (!lead || lead.archivedAt) {
    throw new Error("LEAD_NOT_FOUND");
  }

  return lead;
}

export async function listLeads() {
  const leads = await prisma.lead.findMany({
    where: {
      archivedAt: null
    },
    include: leadInclude,
    orderBy: [
      {
        updatedAt: "desc"
      }
    ]
  });

  return leads.map(toLeadRecord);
}

export async function getLeadById(id: string) {
  return toLeadRecord(await getLeadOrThrow(id));
}

export async function createLead(input: CreateLeadInput) {
  const lead = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const leadNumber = await generateLeadNumber(tx);

    return tx.lead.create({
      data: {
        leadNumber,
        name: input.name,
        companyName: input.companyName || null,
        contactName: input.contactName || null,
        contactTitle: input.contactTitle || null,
        email: input.email || null,
        phone: input.phone || null,
        leadSource: input.leadSource,
        serviceInterest: input.serviceInterest,
        siteName: input.siteName || null,
        siteAddress: input.siteAddress || null,
        city: input.city || null,
        state: input.state || null,
        estimatedValue: input.estimatedValue,
        status: input.status,
        priority: input.priority,
        assignedOwner: input.assignedOwner,
        nextFollowUpDate: parseDateInput(input.nextFollowUpDate),
        notes: input.notes || null,
        qualificationContactIdentified:
          input.qualificationContactIdentified ?? Boolean(input.contactName),
        qualificationSiteKnown:
          input.qualificationSiteKnown ?? Boolean(input.siteName),
        qualificationBudgetKnown:
          input.qualificationBudgetKnown ?? input.estimatedValue > 0,
        qualificationFollowUpScheduled:
          input.qualificationFollowUpScheduled ??
          Boolean(input.nextFollowUpDate),
        lastActivityAt: now,
        activities: {
          create: {
            type: "Note",
            title: "Lead created",
            body: input.notes || "New lead captured in Pulse.",
            actor: "Alex Morgan",
            createdAt: now
          }
        },
        notesList: input.notes
          ? {
              create: {
                body: input.notes,
                actor: "Alex Morgan",
                createdAt: now
              }
            }
          : undefined
      },
      include: leadInclude
    });
  });

  return toLeadRecord(lead);
}

export async function updateLead(id: string, input: UpdateLeadInput) {
  await getLeadOrThrow(id);

  const now = new Date();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.companyName !== undefined
        ? { companyName: input.companyName || null }
        : {}),
      ...(input.contactName !== undefined
        ? { contactName: input.contactName || null }
        : {}),
      ...(input.contactTitle !== undefined
        ? { contactTitle: input.contactTitle || null }
        : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.leadSource !== undefined ? { leadSource: input.leadSource } : {}),
      ...(input.serviceInterest !== undefined
        ? { serviceInterest: input.serviceInterest }
        : {}),
      ...(input.siteName !== undefined
        ? { siteName: input.siteName || null }
        : {}),
      ...(input.siteAddress !== undefined
        ? { siteAddress: input.siteAddress || null }
        : {}),
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.state !== undefined ? { state: input.state || null } : {}),
      ...(input.estimatedValue !== undefined
        ? { estimatedValue: input.estimatedValue }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assignedOwner !== undefined
        ? { assignedOwner: input.assignedOwner || "Unassigned" }
        : {}),
      ...(input.nextFollowUpDate !== undefined
        ? { nextFollowUpDate: parseDateInput(input.nextFollowUpDate) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.qualificationContactIdentified !== undefined
        ? { qualificationContactIdentified: input.qualificationContactIdentified }
        : {}),
      ...(input.qualificationSiteKnown !== undefined
        ? { qualificationSiteKnown: input.qualificationSiteKnown }
        : {}),
      ...(input.qualificationBudgetKnown !== undefined
        ? { qualificationBudgetKnown: input.qualificationBudgetKnown }
        : {}),
      ...(input.qualificationFollowUpScheduled !== undefined
        ? { qualificationFollowUpScheduled: input.qualificationFollowUpScheduled }
        : {}),
      lastActivityAt: now,
      activities: {
        create: {
          type: "Note",
          title: "Lead updated",
          body: "Lead fields were updated from the edit form.",
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function archiveLead(id: string) {
  await getLeadOrThrow(id);

  const now = new Date();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      archivedAt: now,
      lastActivityAt: now,
      activities: {
        create: {
          type: "Status",
          title: "Lead archived",
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function changeLeadStatus(id: string, status: string) {
  await getLeadOrThrow(id);

  const now = new Date();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      status,
      lastActivityAt: now,
      ...(status === "Won / Converted" ? { converted: true } : {}),
      activities: {
        create: {
          type: "Status",
          title: `Status changed to ${status}`,
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function addLeadActivity(
  id: string,
  input: CreateLeadActivityInput
) {
  await getLeadOrThrow(id);

  const now = new Date();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      lastActivityAt: now,
      activities: {
        create: {
          type: input.type,
          title: input.title,
          body: input.body || null,
          actor: input.actor || "Alex Morgan",
          createdAt: now
        }
      },
      notesList:
        input.type === "Note" && input.body
          ? {
              create: {
                body: input.body,
                actor: input.actor || "Alex Morgan",
                createdAt: now
              }
            }
          : undefined
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function createLeadTask(id: string, input: CreateLeadTaskInput) {
  await getLeadOrThrow(id);

  const now = new Date();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      lastActivityAt: now,
      tasks: {
        create: {
          title: input.title,
          dueAt: parseDateInput(input.dueAt),
          owner: input.owner || "Unassigned"
        }
      },
      activities: {
        create: {
          type: "Task",
          title: "Task created",
          body: input.title,
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function completeLeadTask(
  id: string,
  taskId: string,
  completed: boolean
) {
  await getLeadOrThrow(id);

  const now = new Date();
  const result = await prisma.leadTask.updateMany({
    where: {
      id: taskId,
      leadId: id
    },
    data: {
      completedAt: completed ? now : null
    }
  });

  if (result.count === 0) {
    throw new Error("LEAD_NOT_FOUND");
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      lastActivityAt: now,
      activities: {
        create: {
          type: "Task",
          title: completed ? "Task completed" : "Task reopened",
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}

export async function convertLead(id: string, input: ConvertLeadInput) {
  const existingLead = await getLeadOrThrow(id);
  const suffix = existingLead.leadNumber.slice(-4);
  const opportunityId = `OPP-${suffix}`;
  const quoteId = input.createQuote ? `QM26${suffix}` : null;
  const projectId = input.createProject ? `PRJ-${suffix}` : null;
  const now = new Date();

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      status: "Won / Converted",
      converted: true,
      convertedOpportunityId: opportunityId,
      convertedQuoteId: quoteId,
      convertedProjectId: projectId,
      lastActivityAt: now,
      activities: {
        create: {
          type: "Conversion",
          title: "Lead converted",
          body: quoteId
            ? `Created ${opportunityId} and quote placeholder ${quoteId}.`
            : `Created ${opportunityId}.`,
          actor: "Alex Morgan",
          createdAt: now
        }
      }
    },
    include: leadInclude
  });

  return toLeadRecord(lead);
}
