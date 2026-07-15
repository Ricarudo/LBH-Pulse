import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Prisma
} from "../src/generated/prisma/client";
import {
  planLegacyQuoteContactReconciliation,
  type ExistingClientContactCandidate,
  type LegacyQuoteContactCandidate,
  type LegacyQuoteContactReconciliationPlan,
  type NewClientContactPlan
} from "../src/lib/legacyQuoteContacts";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");
const plannedCurrentContactPrefix = "planned-current-contact:";

type ReconciliationDatabase = PrismaClient | Prisma.TransactionClient;

type RevisionCandidate = LegacyQuoteContactCandidate & {
  snapshot: Prisma.JsonValue;
};

type ReconciliationBundle = {
  quotePlan: LegacyQuoteContactReconciliationPlan;
  revisionPlan: LegacyQuoteContactReconciliationPlan;
  revisionSnapshots: Map<string, Prisma.JsonValue>;
};

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function jsonString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function hasContactObject(snapshot: Prisma.JsonValue) {
  const contact = jsonObject(snapshot).contact;
  return Boolean(
    contact &&
    typeof contact === "object" &&
    !Array.isArray(contact) &&
    typeof (contact as Record<string, Prisma.JsonValue>).id === "string"
  );
}

async function loadQuoteCandidates(db: ReconciliationDatabase) {
  const rows = await db.quote.findMany({
    where: {
      contactId: null,
      clientId: { not: null }
    },
    select: {
      id: true,
      quoteNumber: true,
      clientId: true,
      clientName: true,
      contactNameSnapshot: true,
      contactEmailSnapshot: true,
      contactPhoneSnapshot: true,
      updatedAt: true,
      client: { select: { displayName: true } }
    },
    orderBy: [{ clientId: "asc" }, { quoteNumber: "asc" }, { id: "asc" }]
  });

  return rows.flatMap<LegacyQuoteContactCandidate>((row) =>
    row.clientId
      ? [{
          quoteId: row.id,
          quoteNumber: row.quoteNumber,
          clientId: row.clientId,
          clientName: row.client?.displayName ?? row.clientName ?? "Unknown client",
          contactName: row.contactNameSnapshot,
          contactEmail: row.contactEmailSnapshot,
          contactPhone: row.contactPhoneSnapshot,
          updatedAt: row.updatedAt
        }]
      : []
  );
}

async function loadRevisionCandidates(db: ReconciliationDatabase) {
  const rows = await db.quoteRevision.findMany({
    select: {
      id: true,
      quoteNumber: true,
      clientIdSnapshot: true,
      clientNameSnapshot: true,
      versionCreatedAt: true,
      snapshot: true,
      quote: {
        select: {
          clientId: true,
          clientName: true,
          client: { select: { displayName: true } }
        }
      }
    },
    orderBy: [{ quoteId: "asc" }, { revisionNumber: "asc" }, { id: "asc" }]
  });

  return rows.flatMap<RevisionCandidate>((row) => {
    if (hasContactObject(row.snapshot)) return [];
    const clientId = row.clientIdSnapshot ?? row.quote.clientId;
    if (!clientId) return [];
    const context = jsonObject(jsonObject(row.snapshot).context);
    return [{
      quoteId: row.id,
      quoteNumber: row.quoteNumber,
      clientId,
      clientName: row.clientNameSnapshot ??
        row.quote.client?.displayName ??
        row.quote.clientName ??
        "Unknown client",
      contactName: jsonString(context.contactName),
      contactEmail: jsonString(context.contactEmail),
      contactPhone: jsonString(context.contactPhone),
      updatedAt: row.versionCreatedAt,
      snapshot: row.snapshot
    }];
  });
}

async function loadExistingContacts(
  db: ReconciliationDatabase,
  clientIds: string[]
) {
  if (!clientIds.length) return [];
  const rows = await db.pointOfContact.findMany({
    where: { clientId: { in: clientIds } },
    select: {
      id: true,
      clientId: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobile: true
    },
    orderBy: [{ clientId: "asc" }, { createdAt: "asc" }, { id: "asc" }]
  });
  return rows.flatMap<ExistingClientContactCandidate>((contact) =>
    contact.clientId ? [{ ...contact, clientId: contact.clientId }] : []
  );
}

function plannedContactsAsCandidates(
  contacts: NewClientContactPlan[]
): ExistingClientContactCandidate[] {
  return contacts.map((contact, index) => ({
    id: `${plannedCurrentContactPrefix}${index}`,
    clientId: contact.clientId,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    mobile: null
  }));
}

async function loadBundle(db: ReconciliationDatabase): Promise<ReconciliationBundle> {
  const [quotes, revisions] = await Promise.all([
    loadQuoteCandidates(db),
    loadRevisionCandidates(db)
  ]);
  const clientIds = Array.from(new Set([
    ...quotes.map((quote) => quote.clientId),
    ...revisions.map((revision) => revision.clientId)
  ]));
  const existingContacts = await loadExistingContacts(db, clientIds);
  const quotePlan = planLegacyQuoteContactReconciliation(quotes, existingContacts);
  const revisionPlan = planLegacyQuoteContactReconciliation(
    revisions,
    [...existingContacts, ...plannedContactsAsCandidates(quotePlan.newContacts)]
  );

  return {
    quotePlan,
    revisionPlan,
    revisionSnapshots: new Map(revisions.map((revision) => [revision.quoteId, revision.snapshot]))
  };
}

function recordCount(plan: LegacyQuoteContactReconciliationPlan) {
  return plan.existingLinks.length +
    plan.newContacts.reduce((total, contact) => total + contact.quoteIds.length, 0) +
    plan.unresolved.length;
}

function printUnresolved(plan: LegacyQuoteContactReconciliationPlan, label: string) {
  for (const item of plan.unresolved) {
    const detail = item.reason === "missing_identity"
      ? "no name, valid email, or phone was captured"
      : `equally matched contacts ${item.candidateContactIds.join(", ")}`;
    console.log(`  Unresolved ${label} ${item.quoteNumber} (${item.clientName}): ${detail}.`);
  }
}

function printNewContacts(plan: LegacyQuoteContactReconciliationPlan, label: string) {
  if (!verbose) return;
  for (const contact of plan.newContacts) {
    console.log(
      `  ${label} ${contact.clientName}: ${contact.name} ` +
      `<${contact.email ?? contact.phone ?? "no method"}> [${contact.quoteNumbers.join(", ")}]`
    );
  }
}

function printBundle(bundle: ReconciliationBundle, mode: "preview" | "applied") {
  const { quotePlan, revisionPlan } = bundle;
  const affectedClients = new Set([
    ...quotePlan.existingLinks.map((link) => link.clientId),
    ...quotePlan.newContacts.map((contact) => contact.clientId),
    ...quotePlan.unresolved.map((item) => item.clientId),
    ...revisionPlan.existingLinks.map((link) => link.clientId),
    ...revisionPlan.newContacts.map((contact) => contact.clientId),
    ...revisionPlan.unresolved.map((item) => item.clientId)
  ]);
  const contactsToCreate = quotePlan.newContacts.length + revisionPlan.newContacts.length;
  const recordsLinkedToNewContacts = [...quotePlan.newContacts, ...revisionPlan.newContacts]
    .reduce((total, contact) => total + contact.quoteIds.length, 0);
  const unresolved = quotePlan.unresolved.length + revisionPlan.unresolved.length;

  console.log(`Legacy quote contact reconciliation ${mode}.`);
  console.log(
    `Reviewed ${recordCount(quotePlan)} current quotes and ` +
    `${recordCount(revisionPlan)} historical versions across ${affectedClients.size} clients.`
  );
  console.log(
    `Records matched to existing or planned contacts: ` +
    `${quotePlan.existingLinks.length + revisionPlan.existingLinks.length}.`
  );
  console.log(
    `Additional client contacts ${mode === "applied" ? "created" : "to create"}: ` +
    `${contactsToCreate}, covering ${recordsLinkedToNewContacts} records.`
  );
  console.log(`Records left unresolved: ${unresolved}.`);

  printNewContacts(quotePlan, "Current quote ·");
  printNewContacts(revisionPlan, "Historical version ·");
  printUnresolved(quotePlan, "quote");
  printUnresolved(revisionPlan, "version");
}

function migrationNote(quoteNumbers: string[]) {
  const visible = quoteNumbers.slice(0, 20);
  const remainder = quoteNumbers.length - visible.length;
  return `Created from legacy quote history. Linked quote${quoteNumbers.length === 1 ? "" : "s"}: ` +
    `${visible.join(", ")}${remainder > 0 ? `, and ${remainder} more` : ""}.`;
}

async function createAdditionalContact(
  tx: Prisma.TransactionClient,
  contact: NewClientContactPlan
) {
  return tx.pointOfContact.create({
    data: {
      ownerType: "Client",
      ownerId: contact.clientId,
      clientId: contact.clientId,
      role: "Additional",
      name: contact.name,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      preferredContactMethod: contact.preferredContactMethod,
      isPrimary: false,
      isBilling: false,
      isPrimaryContact: false,
      isBillingContact: false,
      isTechnicalContact: false,
      isDecisionMaker: false,
      notes: migrationNote(contact.quoteNumbers)
    }
  });
}

async function linkCurrentQuotes(
  tx: Prisma.TransactionClient,
  plan: LegacyQuoteContactReconciliationPlan
) {
  for (const link of plan.existingLinks) {
    const result = await tx.quote.updateMany({
      where: { id: link.quoteId, contactId: null },
      data: { contactId: link.contactId, updatedAt: link.quoteUpdatedAt }
    });
    if (result.count !== 1) {
      throw new Error(`${link.quoteNumber}: quote changed while linking an existing contact.`);
    }
  }

  const plannedContactIds = new Map<string, string>();
  for (const [index, contact] of plan.newContacts.entries()) {
    const created = await createAdditionalContact(tx, contact);
    plannedContactIds.set(`${plannedCurrentContactPrefix}${index}`, created.id);
    for (const quoteId of contact.quoteIds) {
      const quoteUpdatedAt = contact.quoteUpdatedAtById.get(quoteId);
      if (!quoteUpdatedAt) throw new Error(`${quoteId}: original quote timestamp is missing.`);
      const result = await tx.quote.updateMany({
        where: { id: quoteId, contactId: null },
        data: { contactId: created.id, updatedAt: quoteUpdatedAt }
      });
      if (result.count !== 1) {
        throw new Error(`${quoteId}: quote changed while linking a newly created contact.`);
      }
    }
  }
  return plannedContactIds;
}

function contactSnapshot(contact: {
  id: string;
  siteId: string | null;
  role: string | null;
  name: string | null;
  firstName: string;
  lastName: string;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  preferredContactMethod: string | null;
  isPrimary: boolean;
  isBilling: boolean;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
  notes: string | null;
  site: { siteName: string } | null;
}) {
  return {
    id: contact.id,
    siteId: contact.siteId ?? undefined,
    siteName: contact.site?.siteName ?? undefined,
    role: contact.role ?? "",
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: contact.name?.trim() ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      "Not captured",
    title: contact.title ?? "",
    department: contact.department ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    mobile: contact.mobile ?? "",
    preferredContactMethod: contact.preferredContactMethod ?? "",
    isPrimary: contact.isPrimary,
    isBilling: contact.isBilling,
    isPrimaryContact: contact.isPrimary || contact.isPrimaryContact,
    isBillingContact: contact.isBilling || contact.isBillingContact,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker,
    notes: contact.notes ?? ""
  };
}

async function linkHistoricalVersions(
  tx: Prisma.TransactionClient,
  bundle: ReconciliationBundle,
  plannedCurrentContactIds: Map<string, string>
) {
  const assignments = new Map<string, string>();
  for (const link of bundle.revisionPlan.existingLinks) {
    const contactId = plannedCurrentContactIds.get(link.contactId) ?? link.contactId;
    assignments.set(link.quoteId, contactId);
  }
  for (const contact of bundle.revisionPlan.newContacts) {
    const created = await createAdditionalContact(tx, contact);
    for (const revisionId of contact.quoteIds) assignments.set(revisionId, created.id);
  }

  const contacts = assignments.size
    ? await tx.pointOfContact.findMany({
        where: { id: { in: Array.from(new Set(assignments.values())) } },
        include: { site: { select: { siteName: true } } }
      })
    : [];
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

  for (const [revisionId, contactId] of assignments) {
    const snapshot = bundle.revisionSnapshots.get(revisionId);
    const contact = contactsById.get(contactId);
    if (!snapshot || !contact) {
      throw new Error(`${revisionId}: revision snapshot or contact was not available.`);
    }
    const nextSnapshot = JSON.parse(JSON.stringify({
      ...jsonObject(snapshot),
      contact: contactSnapshot(contact)
    })) as Prisma.InputJsonObject;
    await tx.quoteRevision.update({
      where: { id: revisionId },
      data: { snapshot: nextSnapshot }
    });
  }
}

async function applyBundle() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pulse:legacy-quote-contact-reconciliation'))`;
    const bundle = await loadBundle(tx);
    const plannedCurrentContactIds = await linkCurrentQuotes(tx, bundle.quotePlan);
    await linkHistoricalVersions(tx, bundle, plannedCurrentContactIds);
    return bundle;
  }, {
    isolationLevel: "Serializable",
    maxWait: 10_000,
    timeout: 120_000
  });
}

async function main() {
  if (!apply) {
    const bundle = await loadBundle(prisma);
    printBundle(bundle, "preview");
    console.log("Run with --apply to create and link the planned contacts.");
    return;
  }

  const bundle = await applyBundle();
  printBundle(bundle, "applied");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
