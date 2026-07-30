import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { recordActivity } from "@/lib/services/activityService";
import type {
  ClientContact,
  ClientMergeDuplicateWarning,
  ClientMergePreview,
  ClientRecord,
  ClientSite
} from "@pulse/contracts/clients";
import type {
  ParsedClientContactInput as ClientContactInput,
  ParsedClientSiteInput as ClientSiteInput,
  CreateClientActivityInput,
  CreateClientInput,
  ImportClientInfoInput,
  MergeClientsInput,
  PreviewClientMergeInput,
  UpdateClientContactInput,
  UpdateClientInput,
  UpdateClientSiteInput
} from "@pulse/contracts/clients";

const CLIENT_OWNER_TYPE = "Client";

const clientInclude = {
  contacts: {
    include: {
      site: true
    },
    orderBy: {
      createdAt: "asc"
    }
  },
  sites: {
    orderBy: {
      createdAt: "asc"
    }
  },
  services: {
    orderBy: {
      serviceName: "asc"
    }
  },
  activities: {
    orderBy: {
      createdAt: "desc"
    }
  },
  aliases: {
    orderBy: {
      name: "asc"
    }
  },
  mergedClients: {
    orderBy: {
      mergedAt: "desc"
    },
    select: {
      id: true,
      clientNumber: true,
      displayName: true,
      mergedAt: true,
      mergedByName: true
    }
  },
  projects: {
    where: { archivedAt: null },
    select: { status: true }
  },
  invoices: {
    where: { archivedAt: null },
    select: { status: true, amount: true }
  }
} satisfies Prisma.ClientInclude;

type ClientWithRelations = Prisma.ClientGetPayload<{
  include: typeof clientInclude;
}>;

const emptyContact: ClientContact = {
  id: "",
  role: "",
  firstName: "",
  lastName: "",
  name: "Not captured",
  title: "",
  department: "",
  email: "",
  phone: "",
  mobile: "",
  preferredContactMethod: "",
  isPrimary: false,
  isBilling: false,
  isPrimaryContact: false,
  isBillingContact: false,
  isTechnicalContact: false,
  isDecisionMaker: false,
  notes: ""
};

const emptySite: ClientSite = {
  id: "",
  siteName: "No site captured",
  name: "No site captured",
  siteType: "",
  addressLine1: "",
  addressLine2: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  googleMapsUrl: "",
  operationalHours: "",
  accessInstructions: "",
  parkingInstructions: "",
  securityRequirements: "",
  siteNotes: "",
  isPrimarySite: false,
  status: ""
};

function formatDateInput(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function fullName(firstName: string, lastName: string) {
  return [firstName, lastName].filter(Boolean).join(" ") || "Not captured";
}

function formatAddress(site: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  return [
    site.addressLine1,
    site.addressLine2,
    [site.city, site.state, site.postalCode].filter(Boolean).join(" ")
  ]
    .filter(Boolean)
    .join(", ");
}

function toNullable(value?: string) {
  return value ? value : null;
}

function toDecimal(value?: number | string) {
  if (value === undefined || value === "") {
    return null;
  }

  return new Prisma.Decimal(value);
}

function mapContact(
  contact?: ClientWithRelations["contacts"][number]
): ClientContact {
  if (!contact) {
    return emptyContact;
  }

  return {
    id: contact.id,
    siteId: contact.siteId ?? undefined,
    siteName: contact.site?.siteName,
    role: contact.role ?? "",
    firstName: contact.firstName,
    lastName: contact.lastName,
    name: contact.name ?? fullName(contact.firstName, contact.lastName),
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

function mapSite(site?: ClientWithRelations["sites"][number]): ClientSite {
  if (!site) {
    return emptySite;
  }

  return {
    id: site.id,
    siteName: site.siteName,
    name: site.siteName,
    siteType: site.siteType,
    addressLine1: site.addressLine1 ?? "",
    addressLine2: site.addressLine2 ?? "",
    address: formatAddress(site),
    city: site.city ?? "",
    state: site.state ?? "",
    postalCode: site.postalCode ?? "",
    country: site.country,
    googleMapsUrl: site.googleMapsUrl ?? "",
    latitude: site.latitude ? Number(site.latitude) : undefined,
    longitude: site.longitude ? Number(site.longitude) : undefined,
    operationalHours: site.operationalHours ?? "",
    accessInstructions: site.accessInstructions ?? "",
    parkingInstructions: site.parkingInstructions ?? "",
    securityRequirements: site.securityRequirements ?? "",
    siteNotes: site.siteNotes ?? "",
    isPrimarySite: site.isPrimarySite,
    status: site.isPrimarySite ? "Primary" : site.siteType
  };
}

function toClientRecord(client: ClientWithRelations): ClientRecord {
  const primaryContact =
    client.contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact);
  const billingContact =
    client.contacts.find((contact) => contact.isBilling || contact.isBillingContact);
  const primarySite =
    client.sites.find((site) => site.isPrimarySite) ?? client.sites[0];

  return {
    id: client.id,
    clientNumber: client.clientNumber,
    legalName: client.legalName ?? "",
    displayName: client.displayName,
    companyName: client.displayName,
    industry: client.industry ?? "",
    website: client.website ?? "",
    status: client.status as ClientRecord["status"],
    accountOwner: client.accountOwner,
    primaryContact: mapContact(primaryContact),
    billingContact: mapContact(billingContact),
    taxId: client.taxId ?? "",
    paymentTerms: client.paymentTerms ?? "",
    preferredCurrency: client.preferredCurrency,
    preferredLanguage: client.preferredLanguage,
    primarySite: primarySite?.siteName ?? "",
    city: primarySite?.city ?? "",
    state: primarySite?.state ?? "",
    serviceProfile: client.services.map((service) => service.serviceName),
    openOpportunities: client.openOpportunities,
    activeProjects: client.projects.filter(
      (project) => !["Completed", "Cancelled"].includes(project.status)
    ).length,
    lifetimeValue: Number(client.lifetimeValue),
    outstandingBalance: client.invoices
      .filter((invoice) => !["Paid", "Void"].includes(invoice.status))
      .reduce((total, invoice) => total + Number(invoice.amount), 0),
    lastActivity: formatDateInput(client.lastActivityAt ?? client.updatedAt),
    source: client.source ?? "",
    importantNotes: client.generalNotes ?? client.brandPreferences ?? "",
    brandPreferences: client.brandPreferences ?? "",
    technologyPreferences: client.technologyPreferences ?? "",
    generalNotes: client.generalNotes ?? "",
    preferredVendors: client.preferredVendors ?? "",
    preferredCameraBrand: client.preferredCameraBrand ?? "",
    preferredAccessControlBrand: client.preferredAccessControlBrand ?? "",
    preferredNetworkBrand: client.preferredNetworkBrand ?? "",
    preferredCablingBrand: client.preferredCablingBrand ?? "",
    standardTechnologies: client.standardTechnologies ?? "",
    documentationRequirements: client.documentationRequirements ?? "",
    invoiceRequirements: client.invoiceRequirements ?? "",
    insuranceRequirements: client.insuranceRequirements ?? "",
    purchaseOrderRequired: client.purchaseOrderRequired,
    sites: client.sites.map(mapSite),
    contacts: client.contacts.map(mapContact),
    recentActivity: client.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      title: activity.title,
      detail: activity.detail ?? "",
      actor: activity.actor,
      date: formatDateInput(activity.createdAt)
    })),
    aliases: client.aliases.map((alias) => ({
      id: alias.id,
      name: alias.name,
      source: alias.source,
      ...(alias.originalClientId ? { originalClientId: alias.originalClientId } : {})
    })),
    mergedFrom: client.mergedClients.map((source) => ({
      id: source.id,
      clientNumber: source.clientNumber,
      displayName: source.displayName,
      mergedAt: source.mergedAt?.toISOString() ?? "",
      mergedByName: source.mergedByName ?? "Pulse System"
    })),
    createdAt: formatDateInput(client.createdAt),
    updatedAt: client.updatedAt.toISOString()
  };
}

async function generateClientNumber(tx: Prisma.TransactionClient) {
  const count = await tx.client.count();
  return `CL-${String(1001 + count).padStart(4, "0")}`;
}

async function getClientOrThrow(id: string) {
  const client = await prisma.client.findFirst({
    where: {
      archivedAt: null,
      OR: [{ id }, { clientNumber: id }]
    },
    include: clientInclude
  });

  if (!client) {
    throw new Error("CLIENT_NOT_FOUND");
  }

  return client;
}

function normalizeClientIdentity(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US") ?? "";
}

export async function getClientProfileById(id: string) {
  const requested = await prisma.client.findFirst({
    where: { OR: [{ id }, { clientNumber: id }] },
    select: { id: true, archivedAt: true, mergedIntoId: true }
  });
  if (!requested) throw new Error("CLIENT_NOT_FOUND");

  const resolvedId = requested.mergedIntoId ?? requested.id;
  if (requested.archivedAt && !requested.mergedIntoId) throw new Error("CLIENT_NOT_FOUND");

  return {
    client: toClientRecord(await getClientOrThrow(resolvedId)),
    redirectClientId: requested.mergedIntoId ?? undefined
  };
}

function siteCreateData(clientId: string, site: ClientSiteInput, primary: boolean) {
  return {
    clientId,
    siteName: site.siteName,
    siteType: site.siteType || "Main Office",
    addressLine1: toNullable(site.addressLine1),
    addressLine2: toNullable(site.addressLine2),
    city: toNullable(site.city),
    state: toNullable(site.state),
    postalCode: toNullable(site.postalCode),
    country: site.country || "Puerto Rico",
    googleMapsUrl: toNullable(site.googleMapsUrl),
    latitude: toDecimal(site.latitude),
    longitude: toDecimal(site.longitude),
    operationalHours: toNullable(site.operationalHours),
    accessInstructions: toNullable(site.accessInstructions),
    parkingInstructions: toNullable(site.parkingInstructions),
    securityRequirements: toNullable(site.securityRequirements),
    siteNotes: toNullable(site.siteNotes),
    isPrimarySite: primary
  };
}

function contactCreateData(
  clientId: string,
  contact: ClientContactInput,
  primary: boolean,
  siteId?: string | null
) {
  return {
    ownerType: CLIENT_OWNER_TYPE,
    ownerId: clientId,
    clientId,
    siteId: siteId || null,
    role: contact.role || "Primary",
    name: contact.name || fullName(contact.firstName, contact.lastName),
    firstName: contact.firstName || "Unknown",
    lastName: contact.lastName || "",
    title: toNullable(contact.title),
    department: toNullable(contact.department),
    email: toNullable(contact.email),
    phone: toNullable(contact.phone),
    mobile: toNullable(contact.mobile),
    preferredContactMethod: contact.preferredContactMethod || "Email",
    isPrimary: primary,
    isBilling: contact.isBilling || contact.isBillingContact,
    isPrimaryContact: primary,
    isBillingContact: contact.isBilling || contact.isBillingContact,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker,
    notes: toNullable(contact.notes)
  };
}

export async function listClients() {
  const clients = await prisma.client.findMany({
    where: {
      archivedAt: null
    },
    include: clientInclude,
    orderBy: [
      {
        updatedAt: "desc"
      }
    ]
  });

  return clients.map(toClientRecord);
}

export async function getClientById(id: string) {
  return toClientRecord(await getClientOrThrow(id));
}

export async function createClient(input: CreateClientInput, user?: AuthenticatedUser) {
  const client = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const clientNumber = await generateClientNumber(tx);
    const createdClient = await tx.client.create({
      data: {
        clientNumber,
        legalName: input.legalName || null,
        displayName: input.displayName,
        industry: toNullable(input.industry),
        website: toNullable(input.website),
        status: input.status,
        accountOwner: input.accountOwner || "Unassigned",
        taxId: toNullable(input.taxId),
        paymentTerms: toNullable(input.paymentTerms),
        preferredCurrency: input.preferredCurrency || "USD",
        preferredLanguage: input.preferredLanguage || "English",
        brandPreferences: toNullable(input.brandPreferences),
        technologyPreferences: toNullable(input.technologyPreferences),
        generalNotes: toNullable(input.generalNotes),
        preferredVendors: toNullable(input.preferredVendors),
        preferredCameraBrand: toNullable(input.preferredCameraBrand),
        preferredAccessControlBrand: toNullable(input.preferredAccessControlBrand),
        preferredNetworkBrand: toNullable(input.preferredNetworkBrand),
        preferredCablingBrand: toNullable(input.preferredCablingBrand),
        standardTechnologies: toNullable(input.standardTechnologies),
        documentationRequirements: toNullable(input.documentationRequirements),
        invoiceRequirements: toNullable(input.invoiceRequirements),
        insuranceRequirements: toNullable(input.insuranceRequirements),
        purchaseOrderRequired: input.purchaseOrderRequired,
        lastActivityAt: now
      }
    });

    const siteIdByLocalId = new Map<string, string>();
    const hasPrimarySite = input.sites.some((site) => site.isPrimarySite);

    for (const [index, site] of input.sites.entries()) {
      const createdSite = await tx.clientSite.create({
        data: siteCreateData(
          createdClient.id,
          site,
          site.isPrimarySite || (!hasPrimarySite && index === 0)
        )
      });

      if (site.localId) {
        siteIdByLocalId.set(site.localId, createdSite.id);
      }
      siteIdByLocalId.set(site.siteName, createdSite.id);
    }

    const hasPrimaryContact = input.contacts.some(
      (contact) => contact.isPrimary || contact.isPrimaryContact
    );

    for (const [index, contact] of input.contacts.entries()) {
      const siteId =
        contact.siteId ||
        (contact.siteLocalId
          ? siteIdByLocalId.get(contact.siteLocalId)
          : undefined);

      await tx.pointOfContact.create({
        data: contactCreateData(
          createdClient.id,
          contact,
          contact.isPrimary || contact.isPrimaryContact || (!hasPrimaryContact && index === 0),
          siteId
        )
      });
    }

    const services = Array.from(new Set(input.serviceProfile));
    for (const serviceName of services) {
      await tx.clientService.create({
        data: {
          clientId: createdClient.id,
          serviceName
        }
      });
    }

    await tx.clientActivity.create({
      data: {
        clientId: createdClient.id,
        type: "Client",
        title: "Client created",
        detail: "Client account, sites, contacts, and preferences were created in Pulse.",
        actor: user?.name ?? "Pulse System",
        createdAt: now
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id: createdClient.id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Created",
    title: `${client.displayName} created`,
    detail: "Client account, sites, contacts, and preferences were created in Pulse.",
    metadata: { clientNumber: client.clientNumber, status: client.status }
  });

  return toClientRecord(client);
}

export async function updateClient(id: string, input: UpdateClientInput, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(input.legalName !== undefined
        ? { legalName: input.legalName || null }
        : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.industry !== undefined ? { industry: input.industry || null } : {}),
      ...(input.website !== undefined ? { website: input.website || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.accountOwner !== undefined
        ? { accountOwner: input.accountOwner || "Unassigned" }
        : {}),
      ...(input.source !== undefined ? { source: input.source || null } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId || null } : {}),
      ...(input.paymentTerms !== undefined
        ? { paymentTerms: input.paymentTerms || null }
        : {}),
      ...(input.preferredCurrency !== undefined
        ? { preferredCurrency: input.preferredCurrency || "USD" }
        : {}),
      ...(input.preferredLanguage !== undefined
        ? { preferredLanguage: input.preferredLanguage || "English" }
        : {}),
      ...(input.brandPreferences !== undefined
        ? { brandPreferences: input.brandPreferences || null }
        : {}),
      ...(input.technologyPreferences !== undefined
        ? { technologyPreferences: input.technologyPreferences || null }
        : {}),
      ...(input.generalNotes !== undefined
        ? { generalNotes: input.generalNotes || null }
        : {}),
      ...(input.preferredVendors !== undefined
        ? { preferredVendors: input.preferredVendors || null }
        : {}),
      ...(input.preferredCameraBrand !== undefined
        ? { preferredCameraBrand: input.preferredCameraBrand || null }
        : {}),
      ...(input.preferredAccessControlBrand !== undefined
        ? {
            preferredAccessControlBrand:
              input.preferredAccessControlBrand || null
          }
        : {}),
      ...(input.preferredNetworkBrand !== undefined
        ? { preferredNetworkBrand: input.preferredNetworkBrand || null }
        : {}),
      ...(input.preferredCablingBrand !== undefined
        ? { preferredCablingBrand: input.preferredCablingBrand || null }
        : {}),
      ...(input.standardTechnologies !== undefined
        ? { standardTechnologies: input.standardTechnologies || null }
        : {}),
      ...(input.documentationRequirements !== undefined
        ? { documentationRequirements: input.documentationRequirements || null }
        : {}),
      ...(input.invoiceRequirements !== undefined
        ? { invoiceRequirements: input.invoiceRequirements || null }
        : {}),
      ...(input.insuranceRequirements !== undefined
        ? { insuranceRequirements: input.insuranceRequirements || null }
        : {}),
      ...(input.purchaseOrderRequired !== undefined
        ? { purchaseOrderRequired: input.purchaseOrderRequired }
        : {}),
      lastActivityAt: now,
      activities: {
        create: {
          type: "Client",
          title: "Client updated",
          detail: "Client account fields were updated.",
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: clientInclude
  });

  if (input.aliases !== undefined) {
    const aliases = Array.from(
      new Map(
        input.aliases
          .map((name) => ({ name: name.trim(), normalizedName: normalizeClientIdentity(name) }))
          .filter((alias) => alias.normalizedName && alias.normalizedName !== normalizeClientIdentity(client.displayName))
          .map((alias) => [alias.normalizedName, alias])
      ).values()
    );
    await prisma.$transaction([
      prisma.clientAlias.deleteMany({ where: { clientId: id } }),
      prisma.clientAlias.createMany({
        data: aliases.map((alias) => ({ clientId: id, ...alias, source: "Manual" })),
        skipDuplicates: true
      })
    ]);
  }

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `${client.displayName} updated`,
    detail: "Client account fields were updated.",
    metadata: { clientNumber: client.clientNumber, status: client.status }
  });

  return getClientById(client.id);
}

const mergeClientInclude = {
  aliases: true,
  contacts: { include: { site: true }, orderBy: { createdAt: "asc" } },
  sites: { orderBy: { createdAt: "asc" } },
  services: true,
  _count: {
    select: {
      requests: true,
      quotes: true,
      projects: true,
      invoices: true,
      activities: true
    }
  }
} satisfies Prisma.ClientInclude;

type MergeClient = Prisma.ClientGetPayload<{ include: typeof mergeClientInclude }>;

function duplicateWarnings(clients: MergeClient[]): ClientMergeDuplicateWarning[] {
  const warnings: ClientMergeDuplicateWarning[] = [];
  const contactGroups = new Map<string, MergeClient["contacts"]>();
  const siteGroups = new Map<string, MergeClient["sites"]>();

  for (const client of clients) {
    for (const contact of client.contacts) {
      const email = normalizeClientIdentity(contact.email);
      const name = normalizeClientIdentity(
        contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ")
      );
      const key = email ? `email:${email}` : name ? `name:${name}` : "";
      if (key) contactGroups.set(key, [...(contactGroups.get(key) ?? []), contact]);
    }
    for (const site of client.sites) {
      const address = normalizeClientIdentity(
        [site.addressLine1, site.addressLine2, site.city, site.state, site.postalCode]
          .filter(Boolean)
          .join(" ")
      );
      const name = normalizeClientIdentity(site.siteName);
      const key = address ? `address:${address}` : name ? `name:${name}` : "";
      if (key) siteGroups.set(key, [...(siteGroups.get(key) ?? []), site]);
    }
  }

  for (const [key, contacts] of contactGroups) {
    if (contacts.length < 2) continue;
    warnings.push({
      kind: "contact",
      recordIds: contacts.map((contact) => contact.id),
      label: contacts[0].name || fullName(contacts[0].firstName, contacts[0].lastName),
      reason: key.startsWith("email:") ? "Matching email address" : "Matching contact name"
    });
  }
  for (const [key, sites] of siteGroups) {
    if (sites.length < 2) continue;
    warnings.push({
      kind: "site",
      recordIds: sites.map((site) => site.id),
      label: sites[0].siteName,
      reason: key.startsWith("address:") ? "Matching site address" : "Matching site name"
    });
  }
  return warnings;
}

async function loadMergeClients(input: PreviewClientMergeInput | MergeClientsInput) {
  const clients = await prisma.client.findMany({
    where: { id: { in: input.clientIds } },
    include: mergeClientInclude,
    orderBy: { createdAt: "asc" }
  });
  if (clients.length !== input.clientIds.length) throw new Error("CLIENT_MERGE_SELECTION_INVALID");
  if (clients.some((client) => client.archivedAt || client.mergedIntoId)) {
    throw new Error("CLIENT_MERGE_SELECTION_INVALID");
  }
  if (!clients.some((client) => client.id === input.masterId)) {
    throw new Error("CLIENT_MERGE_MASTER_INVALID");
  }
  if (
    clients.some(
      (client) =>
        !input.expectedUpdatedAt[client.id] ||
        client.updatedAt.toISOString() !== input.expectedUpdatedAt[client.id]
    )
  ) {
    throw new Error("CLIENT_MERGE_STALE");
  }
  return clients;
}

function mergeAliases(clients: MergeClient[], globalDisplayName: string) {
  const globalName = normalizeClientIdentity(globalDisplayName);
  const aliases = new Map<string, { name: string; originalClientId?: string; source: string }>();
  for (const client of clients) {
    for (const [name, source] of [
      [client.displayName, "Merged display name"],
      [client.legalName, "Merged legal name"],
      [client.companyName, "Merged company name"]
    ] as const) {
      const normalized = normalizeClientIdentity(name);
      if (name && normalized && normalized !== globalName) {
        aliases.set(normalized, { name, originalClientId: client.id, source });
      }
    }
    for (const alias of client.aliases) {
      if (alias.normalizedName && alias.normalizedName !== globalName) {
        aliases.set(alias.normalizedName, {
          name: alias.name,
          originalClientId: alias.originalClientId ?? client.id,
          source: alias.source
        });
      }
    }
  }
  return aliases;
}

export async function previewClientMerge(input: PreviewClientMergeInput): Promise<ClientMergePreview> {
  const clients = await loadMergeClients(input);
  const aliases = mergeAliases(clients, input.globalDisplayName);
  return {
    masterId: input.masterId,
    globalDisplayName: input.globalDisplayName,
    clients: clients.map((client) => ({
      id: client.id,
      clientNumber: client.clientNumber,
      displayName: client.displayName,
      updatedAt: client.updatedAt.toISOString()
    })),
    aliases: Array.from(aliases.values(), (alias) => alias.name).sort((a, b) => a.localeCompare(b)),
    contacts: clients.flatMap((client) => client.contacts.map(mapContact)),
    sites: clients.flatMap((client) => client.sites.map(mapSite)),
    counts: {
      requests: clients.reduce((total, client) => total + client._count.requests, 0),
      quotes: clients.reduce((total, client) => total + client._count.quotes, 0),
      projects: clients.reduce((total, client) => total + client._count.projects, 0),
      invoices: clients.reduce((total, client) => total + client._count.invoices, 0),
      contacts: clients.reduce((total, client) => total + client.contacts.length, 0),
      sites: clients.reduce((total, client) => total + client.sites.length, 0),
      activities: clients.reduce((total, client) => total + client._count.activities, 0),
      services: new Set(clients.flatMap((client) => client.services.map((service) => service.serviceName))).size
    },
    duplicateWarnings: duplicateWarnings(clients)
  };
}

export async function mergeClients(input: MergeClientsInput, user: AuthenticatedUser) {
  const clients = await loadMergeClients(input);
  const contactIds = new Set(clients.flatMap((client) => client.contacts.map((contact) => contact.id)));
  const siteIds = new Set(clients.flatMap((client) => client.sites.map((site) => site.id)));
  if (contactIds.size && (!input.primaryContactId || !contactIds.has(input.primaryContactId))) {
    throw new Error("CLIENT_MERGE_PRIMARY_CONTACT_INVALID");
  }
  if (siteIds.size && (!input.primarySiteId || !siteIds.has(input.primarySiteId))) {
    throw new Error("CLIENT_MERGE_PRIMARY_SITE_INVALID");
  }

  const sourceIds = input.clientIds.filter((id) => id !== input.masterId);
  const aliases = mergeAliases(clients, input.globalDisplayName);
  const serviceNames = Array.from(
    new Set(clients.flatMap((client) => client.services.map((service) => service.serviceName)))
  );
  const now = new Date();
  const openOpportunities = clients.reduce((total, client) => total + client.openOpportunities, 0);
  const lifetimeValue = clients.reduce(
    (total, client) => total.add(client.lifetimeValue),
    new Prisma.Decimal(0)
  );
  const outstandingBalance = clients.reduce(
    (total, client) => total.add(client.outstandingBalance),
    new Prisma.Decimal(0)
  );

  await prisma.$transaction(async (tx) => {
    const current = await tx.client.findMany({
      where: { id: { in: input.clientIds } },
      select: { id: true, updatedAt: true, archivedAt: true, mergedIntoId: true }
    });
    if (
      current.length !== clients.length ||
      current.some(
        (client) =>
          client.archivedAt ||
          client.mergedIntoId ||
          client.updatedAt.toISOString() !== input.expectedUpdatedAt[client.id]
      )
    ) {
      throw new Error("CLIENT_MERGE_STALE");
    }

    await Promise.all([
      tx.request.updateMany({ where: { clientId: { in: sourceIds } }, data: { clientId: input.masterId } }),
      tx.quote.updateMany({ where: { clientId: { in: sourceIds } }, data: { clientId: input.masterId } }),
      tx.project.updateMany({ where: { clientId: { in: sourceIds } }, data: { clientId: input.masterId } }),
      tx.invoice.updateMany({ where: { clientId: { in: sourceIds } }, data: { clientId: input.masterId } }),
      tx.clientSite.updateMany({ where: { clientId: { in: input.clientIds } }, data: { clientId: input.masterId, isPrimarySite: false } }),
      tx.pointOfContact.updateMany({
        where: { clientId: { in: input.clientIds } },
        data: {
          clientId: input.masterId,
          ownerType: CLIENT_OWNER_TYPE,
          ownerId: input.masterId,
          isPrimary: false,
          isPrimaryContact: false
        }
      }),
      tx.clientActivity.updateMany({ where: { clientId: { in: sourceIds } }, data: { clientId: input.masterId } })
    ]);

    if (input.primaryContactId) {
      await tx.pointOfContact.update({
        where: { id: input.primaryContactId },
        data: { isPrimary: true, isPrimaryContact: true }
      });
    }
    if (input.primarySiteId) {
      await tx.clientSite.update({ where: { id: input.primarySiteId }, data: { isPrimarySite: true } });
    }

    await tx.clientService.deleteMany({ where: { clientId: { in: input.clientIds } } });
    if (serviceNames.length) {
      await tx.clientService.createMany({
        data: serviceNames.map((serviceName) => ({ clientId: input.masterId, serviceName })),
        skipDuplicates: true
      });
    }
    await tx.clientAlias.deleteMany({ where: { clientId: { in: input.clientIds } } });
    if (aliases.size) {
      await tx.clientAlias.createMany({
        data: Array.from(aliases, ([normalizedName, alias]) => ({
          clientId: input.masterId,
          normalizedName,
          ...alias
        })),
        skipDuplicates: true
      });
    }

    await tx.client.update({
      where: { id: input.masterId },
      data: {
        displayName: input.globalDisplayName,
        openOpportunities,
        lifetimeValue,
        outstandingBalance,
        lastActivityAt: now,
        activities: {
          create: {
            type: "Merge",
            title: "Client records combined",
            detail: `${sourceIds.length} client record${sourceIds.length === 1 ? "" : "s"} consolidated.`,
            actor: user.name,
            createdAt: now
          }
        }
      }
    });
    await tx.client.updateMany({
      where: { mergedIntoId: { in: sourceIds } },
      data: { mergedIntoId: input.masterId }
    });
    await tx.client.updateMany({
      where: { id: { in: sourceIds } },
      data: {
        archivedAt: now,
        mergedIntoId: input.masterId,
        mergedAt: now,
        mergedById: user.id,
        mergedByName: user.name,
        lastActivityAt: now
      }
    });
    await tx.activity.create({
      data: {
        relatedEntityType: "Client",
        relatedEntityId: input.masterId,
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.roleLabel,
        type: "Merged",
        title: `${input.globalDisplayName} consolidated`,
        detail: `${clients.map((client) => client.clientNumber).join(", ")} were combined.`,
        metadata: {
          masterId: input.masterId,
          sourceIds,
          aliases: Array.from(aliases.values(), (alias) => alias.name)
        }
      }
    });
    await tx.activity.createMany({
      data: clients
        .filter((client) => sourceIds.includes(client.id))
        .map((source) => ({
          relatedEntityType: "Client",
          relatedEntityId: source.id,
          actorUserId: user.id,
          actorName: user.name,
          actorRole: user.roleLabel,
          type: "Merged",
          title: `${source.displayName} combined into ${input.globalDisplayName}`,
          detail: `${source.clientNumber} now redirects to the master client.`,
          metadata: {
            masterId: input.masterId,
            masterDisplayName: input.globalDisplayName
          }
        }))
    });
  });

  return {
    client: await getClientById(input.masterId),
    mergedClientIds: sourceIds
  };
}

export async function archiveClient(id: string, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.client.update({
    where: { id },
    data: {
      archivedAt: now,
      lastActivityAt: now,
      activities: {
        create: {
          type: "Client",
          title: "Client archived",
          actor: user?.name ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: clientInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Status Changed",
    title: `${client.displayName} archived`,
    detail: client.clientNumber
  });

  return toClientRecord(client);
}

export async function addClientSite(id: string, input: ClientSiteInput, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    if (input.isPrimarySite) {
      await tx.clientSite.updateMany({
        where: { clientId: id },
        data: { isPrimarySite: false }
      });
    }

    await tx.clientSite.create({
      data: siteCreateData(id, input, input.isPrimarySite)
    });

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Site",
            title: "Client site added",
            detail: input.siteName,
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Site added to ${client.displayName}`,
    detail: input.siteName
  });

  return toClientRecord(client);
}

export async function updateClientSite(
  id: string,
  siteId: string,
  input: UpdateClientSiteInput,
  user?: AuthenticatedUser
) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    if (input.isPrimarySite) {
      await tx.clientSite.updateMany({
        where: { clientId: id, NOT: { id: siteId } },
        data: { isPrimarySite: false }
      });
    }

    const result = await tx.clientSite.updateMany({
      where: { id: siteId, clientId: id },
      data: {
        ...(input.siteName !== undefined ? { siteName: input.siteName } : {}),
        ...(input.siteType !== undefined ? { siteType: input.siteType } : {}),
        ...(input.addressLine1 !== undefined
          ? { addressLine1: input.addressLine1 || null }
          : {}),
        ...(input.addressLine2 !== undefined
          ? { addressLine2: input.addressLine2 || null }
          : {}),
        ...(input.city !== undefined ? { city: input.city || null } : {}),
        ...(input.state !== undefined ? { state: input.state || null } : {}),
        ...(input.postalCode !== undefined
          ? { postalCode: input.postalCode || null }
          : {}),
        ...(input.country !== undefined
          ? { country: input.country || "Puerto Rico" }
          : {}),
        ...(input.googleMapsUrl !== undefined
          ? { googleMapsUrl: input.googleMapsUrl || null }
          : {}),
        ...(input.latitude !== undefined ? { latitude: toDecimal(input.latitude) } : {}),
        ...(input.longitude !== undefined
          ? { longitude: toDecimal(input.longitude) }
          : {}),
        ...(input.operationalHours !== undefined
          ? { operationalHours: input.operationalHours || null }
          : {}),
        ...(input.accessInstructions !== undefined
          ? { accessInstructions: input.accessInstructions || null }
          : {}),
        ...(input.parkingInstructions !== undefined
          ? { parkingInstructions: input.parkingInstructions || null }
          : {}),
        ...(input.securityRequirements !== undefined
          ? { securityRequirements: input.securityRequirements || null }
          : {}),
        ...(input.siteNotes !== undefined
          ? { siteNotes: input.siteNotes || null }
          : {}),
        ...(input.isPrimarySite !== undefined
          ? { isPrimarySite: input.isPrimarySite }
          : {})
      }
    });

    if (result.count === 0) {
      throw new Error("CLIENT_NOT_FOUND");
    }

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Site",
            title: "Client site updated",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Site updated for ${client.displayName}`,
    detail: input.siteName || "Client site fields were updated."
  });

  return toClientRecord(client);
}

export async function removeClientSite(id: string, siteId: string, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    await tx.pointOfContact.updateMany({
      where: { ownerType: CLIENT_OWNER_TYPE, ownerId: id, siteId },
      data: { siteId: null }
    });

    const result = await tx.clientSite.deleteMany({
      where: { id: siteId, clientId: id }
    });

    if (result.count === 0) {
      throw new Error("CLIENT_NOT_FOUND");
    }

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Site",
            title: "Client site removed",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Site removed from ${client.displayName}`,
    detail: siteId
  });

  return toClientRecord(client);
}

export async function addClientContact(id: string, input: ClientContactInput, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    const shouldBePrimary = input.isPrimary || input.isPrimaryContact;

    if (shouldBePrimary) {
      await tx.pointOfContact.updateMany({
        where: { ownerType: CLIENT_OWNER_TYPE, ownerId: id },
        data: { isPrimary: false, isPrimaryContact: false }
      });
    }

    await tx.pointOfContact.create({
      data: contactCreateData(id, input, shouldBePrimary, input.siteId)
    });

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Contact",
            title: "Client contact added",
            detail: fullName(input.firstName, input.lastName),
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Contact added to ${client.displayName}`,
    detail: fullName(input.firstName, input.lastName)
  });

  return toClientRecord(client);
}

export async function updateClientContact(
  id: string,
  contactId: string,
  input: UpdateClientContactInput,
  user?: AuthenticatedUser
) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    const shouldBePrimary = input.isPrimary || input.isPrimaryContact;

    if (shouldBePrimary) {
      await tx.pointOfContact.updateMany({
        where: { ownerType: CLIENT_OWNER_TYPE, ownerId: id, NOT: { id: contactId } },
        data: { isPrimary: false, isPrimaryContact: false }
      });
    }

    const result = await tx.pointOfContact.updateMany({
      where: { id: contactId, ownerType: CLIENT_OWNER_TYPE, ownerId: id },
      data: {
        ...(input.siteId !== undefined ? { siteId: input.siteId || null } : {}),
        ...(input.name !== undefined ? { name: input.name || null } : {}),
        ...(input.role !== undefined ? { role: input.role || "Primary" } : {}),
        ...(input.firstName !== undefined
          ? { firstName: input.firstName || "Unknown" }
          : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.department !== undefined
          ? { department: input.department || null }
          : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile || null } : {}),
        ...(input.preferredContactMethod !== undefined
          ? { preferredContactMethod: input.preferredContactMethod || null }
          : {}),
        ...(input.isPrimary !== undefined || input.isPrimaryContact !== undefined
          ? { isPrimary: shouldBePrimary, isPrimaryContact: shouldBePrimary }
          : {}),
        ...(input.isBilling !== undefined || input.isBillingContact !== undefined
          ? {
              isBilling: input.isBilling || input.isBillingContact,
              isBillingContact: input.isBilling || input.isBillingContact
            }
          : {}),
        ...(input.isTechnicalContact !== undefined
          ? { isTechnicalContact: input.isTechnicalContact }
          : {}),
        ...(input.isDecisionMaker !== undefined
          ? { isDecisionMaker: input.isDecisionMaker }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {})
      }
    });

    if (result.count === 0) {
      throw new Error("CONTACT_NOT_FOUND");
    }

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Contact",
            title: "Client contact updated",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Contact updated for ${client.displayName}`,
    detail: contactId
  });

  return toClientRecord(client);
}

export async function removeClientContact(id: string, contactId: string, user?: AuthenticatedUser) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.$transaction(async (tx) => {
    const result = await tx.pointOfContact.deleteMany({
      where: { id: contactId, ownerType: CLIENT_OWNER_TYPE, ownerId: id }
    });

    if (result.count === 0) {
      throw new Error("CONTACT_NOT_FOUND");
    }

    await tx.client.update({
      where: { id },
      data: {
        lastActivityAt: now,
        activities: {
          create: {
            type: "Contact",
            title: "Client contact removed",
            actor: user?.name ?? "Pulse System",
            createdAt: now
          }
        }
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `Contact removed from ${client.displayName}`,
    detail: contactId
  });

  return toClientRecord(client);
}

export async function addClientActivity(
  id: string,
  input: CreateClientActivityInput,
  user?: AuthenticatedUser
) {
  await getClientOrThrow(id);

  const now = new Date();
  const client = await prisma.client.update({
    where: { id },
    data: {
      lastActivityAt: now,
      activities: {
        create: {
          type: input.type || "Note",
          title: input.title,
          detail: input.detail || null,
          actor: user?.name ?? input.actor ?? "Pulse System",
          createdAt: now
        }
      }
    },
    include: clientInclude
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: input.type === "Note" ? "Note Added" : input.type || "Updated",
    title: input.title,
    detail: input.detail,
    metadata: { clientNumber: client.clientNumber }
  });

  return toClientRecord(client);
}

export async function importClientInfo(
  id: string,
  input: ImportClientInfoInput,
  user?: AuthenticatedUser
) {
  return addClientActivity(id, {
    type: "Import",
    title: "Client info imported",
    detail: `${input.source || "Manual import"} applied to the client profile.`,
    actor: user?.name ?? input.actor ?? "Pulse System"
  }, user);
}
