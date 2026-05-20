const { PrismaClient } = require("@prisma/client");
const { readdir, readFile, stat } = require("fs/promises");
const path = require("path");

const prisma = new PrismaClient();
const backupTables = ["Lead", "LeadActivity", "LeadAttachment", "LeadNote", "LeadTask"];

const statusMap = new Map([
  ["New", "Received"],
  ["Contacted", "Reviewing"],
  ["Qualified", "Reviewing"],
  ["Site Visit Needed", "Site Visit Required"],
  ["Estimating", "Ready for Quote"],
  ["Proposal Needed", "Ready for Quote"]
]);

const sourceMap = new Map([
  ["Existing Customer", "Existing Client"],
  ["Public Bid", "RFP"],
  ["Phone", "Call"],
  ["Website", "Website"],
  ["Referral", "Referral"],
  ["Partner", "Partner"]
]);

const serviceMap = new Map([
  ["CCTV / Cameras", "CCTV / Surveillance"],
  ["Network", "Networking"],
  ["AV", "AV"],
  ["Fiber", "Fiber"],
  ["Access Control", "Access Control"],
  ["Structured Cabling", "Structured Cabling"]
]);

const requestTypesBySource = new Map([
  ["RFP", "RFP / Bid"],
  ["Call", "Quote Request"],
  ["Existing Client", "Quote Request"],
  ["Website", "Quote Request"],
  ["Referral", "Quote Request"],
  ["Partner", "Quote Request"],
  ["Other", "General Inquiry"]
]);

const runtimeOwnerEmails = new Map([
  ["Sales User", "sales@r2.local"],
  ["Project Manager User", "project.manager@r2.local"]
]);

function repoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

function backupRoot() {
  if (process.env.PULSE_LEGACY_LEAD_BACKUP_ROOT) {
    return path.resolve(process.env.PULSE_LEGACY_LEAD_BACKUP_ROOT);
  }

  return path.join(repoRoot(), "database", "local-backups", "legacy-leads");
}

function argValue(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function isApplyMode() {
  return process.argv.includes("--apply");
}

function shouldReplace() {
  return process.argv.includes("--replace");
}

async function latestBackupDir() {
  const root = backupRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(root, entry.name);
        const details = await stat(fullPath);
        return { fullPath, mtimeMs: details.mtimeMs };
      })
  );

  dirs.sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!dirs[0]) {
    throw new Error(`No legacy Lead backups found in ${root}. Run legacy-leads:export first.`);
  }

  return dirs[0].fullPath;
}

async function backupDirFromArgs() {
  const backup = argValue("--backup");

  if (backup) {
    return path.resolve(backup);
  }

  return latestBackupDir();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readBackup(backupDir) {
  const manifest = await readJson(path.join(backupDir, "manifest.json"));
  const data = {};

  for (const table of backupTables) {
    data[table] = await readJson(path.join(backupDir, `${table}.json`));
    const expectedCount = manifest.tables?.[table]?.count;

    if (typeof expectedCount === "number" && expectedCount !== data[table].length) {
      throw new Error(
        `Backup count mismatch for ${table}: manifest=${expectedCount}, file=${data[table].length}`
      );
    }
  }

  return { manifest, data };
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function toNullableText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function mapStatus(value) {
  return statusMap.get(value) || "Received";
}

function mapSource(value) {
  return sourceMap.get(value) || "Other";
}

function mapService(value) {
  return serviceMap.get(value) || "Other";
}

function mapRequestType(source) {
  return requestTypesBySource.get(source) || "Quote Request";
}

function missingInfoForLead(lead) {
  const missing = [];

  if (lead.qualificationContactIdentified === false) {
    missing.push("Contact not identified");
  }

  if (lead.qualificationSiteKnown === false) {
    missing.push("Site not confirmed");
  }

  if (lead.qualificationBudgetKnown === false) {
    missing.push("Budget not confirmed");
  }

  if (lead.qualificationFollowUpScheduled === false) {
    missing.push("Follow-up not scheduled");
  }

  return missing.length > 0 ? missing.join("; ") : null;
}

function internalNotesForLead(lead, mappedSource, mappedService) {
  const lines = [
    "Imported from legacy Lead data.",
    `Legacy Lead ID: ${lead.id}`,
    `Legacy Lead Number: ${lead.leadNumber}`
  ];

  if (lead.contactTitle) {
    lines.push(`Legacy contact title: ${lead.contactTitle}`);
  }

  if (lead.estimatedValue !== null && lead.estimatedValue !== undefined) {
    lines.push(`Legacy estimated value: ${lead.estimatedValue}`);
  }

  if (lead.leadSource && lead.leadSource !== mappedSource) {
    lines.push(`Legacy source: ${lead.leadSource}`);
  }

  if (lead.serviceInterest && lead.serviceInterest !== mappedService) {
    lines.push(`Legacy service interest: ${lead.serviceInterest}`);
  }

  if (lead.assignedOwner) {
    lines.push(`Legacy assigned owner: ${lead.assignedOwner}`);
  }

  if (lead.converted) {
    lines.push("Legacy converted flag: true");
  }

  if (lead.convertedOpportunityId) {
    lines.push(`Legacy opportunity ID: ${lead.convertedOpportunityId}`);
  }

  if (lead.convertedQuoteId) {
    lines.push(`Legacy quote ID: ${lead.convertedQuoteId}`);
  }

  if (lead.convertedProjectId) {
    lines.push(`Legacy project ID: ${lead.convertedProjectId}`);
  }

  return lines.join("\n");
}

async function runtimeUsersByEmail() {
  const users = await prisma.localUser.findMany({
    where: {
      email: {
        in: Array.from(runtimeOwnerEmails.values()).concat("admin@r2.local")
      }
    }
  });

  return new Map(users.map((user) => [user.email, user]));
}

async function templatesByKey() {
  const templates = await prisma.requestChecklistTemplate.findMany({
    where: { active: true },
    include: { items: { where: { active: true }, orderBy: { sortOrder: "asc" } } }
  });

  return new Map(templates.map((template) => [template.key, template]));
}

function templateKeyFor(serviceCategory) {
  if (serviceCategory === "Fiber") return "fiber-install";
  if (serviceCategory === "Access Control") return "access-control";
  if (serviceCategory === "CCTV / Surveillance") return "cctv-surveillance";
  if (serviceCategory === "Structured Cabling") return "structured-cabling";
  if (serviceCategory === "Power / UPS") return "power-ups";
  return "general";
}

function completedChecklistLabels(lead, hasAttachments) {
  const labels = new Set(["Scope summary captured", "Service category selected"]);

  if (lead.companyName || lead.contactName) {
    labels.add("Client / company identified");
  }

  if (lead.email || lead.phone) {
    labels.add("Contact information confirmed");
  }

  if (lead.siteName || lead.siteAddress || lead.city || lead.state) {
    labels.add("Site address confirmed");
  }

  if (lead.nextFollowUpDate) {
    labels.add("Due date confirmed");
  }

  if (hasAttachments) {
    labels.add("Files received, if applicable");
    labels.add("Drawings received");
    labels.add("Drawings/photos received");
    labels.add("Floor plan received");
    labels.add("Floor plan/drawing received");
    labels.add("Photos or equipment label received");
  }

  if (lead.status) {
    labels.add("Site visit decision made");
  }

  if (lead.assignedOwner && lead.assignedOwner !== "Unassigned") {
    labels.add("Internal owner assigned");
  }

  return labels;
}

function checklistItemCreates(template, lead, hasAttachments) {
  if (!template) {
    return [];
  }

  const completedLabels = completedChecklistLabels(lead, hasAttachments);

  return template.items.map((item) => {
    const completed = completedLabels.has(item.label);

    return {
      templateItemId: item.id,
      label: item.label,
      description: item.description,
      required: item.required,
      appliesWhen: item.appliesWhen,
      sortOrder: item.sortOrder,
      group: item.group,
      completed,
      completedAt: completed ? toDate(lead.updatedAt) || new Date() : null,
      completedByNameSnapshot: completed ? "Legacy Lead Import" : null,
      notes: completed ? "Completed from legacy Lead import." : null,
      createdAt: toDate(lead.createdAt) || new Date(),
      updatedAt: toDate(lead.updatedAt) || new Date()
    };
  });
}

function groupBy(items, key) {
  const grouped = new Map();

  for (const item of items) {
    const value = item[key];

    if (!grouped.has(value)) {
      grouped.set(value, []);
    }

    grouped.get(value).push(item);
  }

  return grouped;
}

function legacyIdNote(prefix, id, body) {
  return [`${prefix}: ${id}`, body].filter(Boolean).join("\n");
}

function requestCreateData(lead, context) {
  const status = mapStatus(lead.status);
  const source = mapSource(lead.leadSource);
  const serviceCategory = mapService(lead.serviceInterest);
  const requestType = mapRequestType(source);
  const ownerEmail = runtimeOwnerEmails.get(lead.assignedOwner);
  const assignedTo = ownerEmail ? context.usersByEmail.get(ownerEmail) : null;
  const createdBy = context.usersByEmail.get("admin@r2.local") ?? null;
  const template = context.templatesByKey.get(templateKeyFor(serviceCategory)) ?? context.templatesByKey.get("general");
  const activities = context.activitiesByLeadId.get(lead.id) ?? [];
  const tasks = context.tasksByLeadId.get(lead.id) ?? [];
  const notes = context.notesByLeadId.get(lead.id) ?? [];
  const attachments = context.attachmentsByLeadId.get(lead.id) ?? [];

  return {
    requestNumber: lead.leadNumber,
    title: lead.name,
    requestType,
    source,
    serviceCategory,
    status,
    priority: lead.priority || "Normal",
    companyName: toNullableText(lead.companyName),
    contactName: toNullableText(lead.contactName),
    contactEmail: toNullableText(lead.email),
    contactPhone: toNullableText(lead.phone),
    siteName: toNullableText(lead.siteName),
    siteAddress: toNullableText(lead.siteAddress),
    city: toNullableText(lead.city),
    state: toNullableText(lead.state),
    assignedToId: assignedTo?.id ?? null,
    createdById: createdBy?.id ?? null,
    receivedDate: toDate(lead.createdAt) || new Date(),
    dueDate: toDate(lead.nextFollowUpDate),
    nextAction: lead.nextFollowUpDate ? "Follow up from legacy lead" : null,
    nextFollowUpAt: toDate(lead.nextFollowUpDate),
    lastActivityAt: toDate(lead.lastActivityAt),
    missingInfo: missingInfoForLead(lead),
    siteVisitNeeded: status === "Site Visit Required",
    siteVisitCompleted: false,
    description: toNullableText(lead.notes) || toNullableText(lead.name),
    internalNotes: internalNotesForLead(lead, source, serviceCategory),
    archivedAt: toDate(lead.archivedAt),
    createdAt: toDate(lead.createdAt) || new Date(),
    updatedAt: toDate(lead.updatedAt) || new Date(),
    checklistTemplateId: template?.id ?? null,
    checklistTemplateNameSnapshot: template?.name ?? null,
    activities: {
      create: activities.map((activity) => ({
        type: activity.type || "Note",
        title: activity.title || "Legacy Lead activity",
        body: legacyIdNote("Legacy LeadActivity ID", activity.id, activity.body),
        actor: activity.actor || "Legacy Lead Import",
        createdAt: toDate(activity.createdAt) || new Date()
      }))
    },
    tasks: {
      create: tasks.map((task) => ({
        title: task.title || "Legacy Lead task",
        dueAt: toDate(task.dueAt),
        owner: task.owner || "Unassigned",
        completedAt: toDate(task.completedAt),
        createdAt: toDate(task.createdAt) || new Date(),
        updatedAt: toDate(task.updatedAt) || new Date()
      }))
    },
    notesList: {
      create: notes.map((note) => ({
        body: legacyIdNote("Legacy LeadNote ID", note.id, note.body),
        actor: note.actor || "Legacy Lead Import",
        createdAt: toDate(note.createdAt) || new Date()
      }))
    },
    attachments: {
      create: attachments.map((attachment) => ({
        fileName: attachment.fileName || "legacy-lead-attachment",
        url: attachment.url || null,
        createdAt: toDate(attachment.createdAt) || new Date()
      }))
    },
    checklistItems: {
      create: checklistItemCreates(template, lead, attachments.length > 0)
    }
  };
}

async function importLead(lead, context, apply, replaceExisting) {
  const existing = await prisma.request.findUnique({
    where: { requestNumber: lead.leadNumber },
    select: { id: true, requestNumber: true }
  });

  if (existing && !replaceExisting) {
    return "skipped";
  }

  if (!apply) {
    return existing ? "would-replace" : "would-create";
  }

  const data = requestCreateData(lead, context);

  if (existing) {
    await prisma.$transaction([
      prisma.requestChecklistItem.deleteMany({ where: { requestId: existing.id } }),
      prisma.requestAttachment.deleteMany({ where: { requestId: existing.id } }),
      prisma.requestNote.deleteMany({ where: { requestId: existing.id } }),
      prisma.requestTask.deleteMany({ where: { requestId: existing.id } }),
      prisma.requestActivity.deleteMany({ where: { requestId: existing.id } }),
      prisma.request.update({
        where: { id: existing.id },
        data
      })
    ]);

    return "replaced";
  }

  await prisma.request.create({ data });
  return "created";
}

async function main() {
  const apply = isApplyMode();
  const replaceExisting = shouldReplace();
  const backupDir = await backupDirFromArgs();
  const { data } = await readBackup(backupDir);
  const usersByEmail = await runtimeUsersByEmail();
  const templates = await templatesByKey();
  const context = {
    usersByEmail,
    templatesByKey: templates,
    activitiesByLeadId: groupBy(data.LeadActivity, "leadId"),
    attachmentsByLeadId: groupBy(data.LeadAttachment, "leadId"),
    notesByLeadId: groupBy(data.LeadNote, "leadId"),
    tasksByLeadId: groupBy(data.LeadTask, "leadId")
  };

  const results = {
    created: 0,
    replaced: 0,
    skipped: 0,
    "would-create": 0,
    "would-replace": 0
  };

  for (const lead of data.Lead) {
    const result = await importLead(lead, context, apply, replaceExisting);
    results[result] += 1;
  }

  console.log(`${apply ? "Imported" : "Dry run for"} legacy Lead backup: ${backupDir}`);
  console.log(results);

  if (!apply) {
    console.log("No database rows were changed. Re-run with -- --apply to import.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
