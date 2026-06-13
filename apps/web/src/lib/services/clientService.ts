import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/services/activityService";
import type { ClientContact, ClientRecord, ClientSite } from "@/types/client";
import type {
  ClientContactInput,
  ClientSiteInput,
  CreateClientActivityInput,
  CreateClientInput,
  ImportClientInfoInput,
  UpdateClientContactInput,
  UpdateClientInput,
  UpdateClientSiteInput
} from "@/lib/validations/client";

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

function hasPrimarySiteContent(site?: UpdateClientInput["primarySite"]) {
  if (!site) {
    return false;
  }

  return [
    site.siteName,
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.state,
    site.postalCode,
    site.country,
    site.googleMapsUrl,
    site.operationalHours,
    site.accessInstructions,
    site.parkingInstructions,
    site.securityRequirements,
    site.siteNotes
  ].some(Boolean);
}

function hasPrimaryContactContent(contact?: UpdateClientInput["primaryContact"]) {
  if (!contact) {
    return false;
  }

  return [
    contact.name,
    contact.role,
    contact.firstName,
    contact.lastName,
    contact.title,
    contact.department,
    contact.email,
    contact.phone,
    contact.mobile,
    contact.notes
  ].some(Boolean);
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
  const existing = await getClientOrThrow(id);
  const now = new Date();
  const expectedUpdatedAt = input.updatedAt ? new Date(input.updatedAt) : undefined;

  const client = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.client.updateMany({
      where: {
        id: existing.id,
        archivedAt: null,
        ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {})
      },
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
        lastActivityAt: now
      }
    });

    if (updateResult.count === 0) {
      throw new Error("CLIENT_VERSION_CONFLICT");
    }

    if (input.serviceProfile !== undefined) {
      await tx.clientService.deleteMany({ where: { clientId: existing.id } });

      for (const serviceName of Array.from(new Set(input.serviceProfile))) {
        await tx.clientService.create({
          data: {
            clientId: existing.id,
            serviceName
          }
        });
      }
    }

    if (input.primarySite?.id) {
      await tx.clientSite.updateMany({
        where: { clientId: existing.id, NOT: { id: input.primarySite.id } },
        data: { isPrimarySite: false }
      });

      const siteResult = await tx.clientSite.updateMany({
        where: { id: input.primarySite.id, clientId: existing.id },
        data: {
          ...(input.primarySite.siteName !== undefined
            ? { siteName: input.primarySite.siteName }
            : {}),
          ...(input.primarySite.siteType !== undefined
            ? { siteType: input.primarySite.siteType || "Main Office" }
            : {}),
          ...(input.primarySite.addressLine1 !== undefined
            ? { addressLine1: input.primarySite.addressLine1 || null }
            : {}),
          ...(input.primarySite.addressLine2 !== undefined
            ? { addressLine2: input.primarySite.addressLine2 || null }
            : {}),
          ...(input.primarySite.city !== undefined
            ? { city: input.primarySite.city || null }
            : {}),
          ...(input.primarySite.state !== undefined
            ? { state: input.primarySite.state || null }
            : {}),
          ...(input.primarySite.postalCode !== undefined
            ? { postalCode: input.primarySite.postalCode || null }
            : {}),
          ...(input.primarySite.country !== undefined
            ? { country: input.primarySite.country || "Puerto Rico" }
            : {}),
          ...(input.primarySite.googleMapsUrl !== undefined
            ? { googleMapsUrl: input.primarySite.googleMapsUrl || null }
            : {}),
          ...(input.primarySite.latitude !== undefined
            ? { latitude: toDecimal(input.primarySite.latitude) }
            : {}),
          ...(input.primarySite.longitude !== undefined
            ? { longitude: toDecimal(input.primarySite.longitude) }
            : {}),
          ...(input.primarySite.operationalHours !== undefined
            ? { operationalHours: input.primarySite.operationalHours || null }
            : {}),
          ...(input.primarySite.accessInstructions !== undefined
            ? { accessInstructions: input.primarySite.accessInstructions || null }
            : {}),
          ...(input.primarySite.parkingInstructions !== undefined
            ? { parkingInstructions: input.primarySite.parkingInstructions || null }
            : {}),
          ...(input.primarySite.securityRequirements !== undefined
            ? { securityRequirements: input.primarySite.securityRequirements || null }
            : {}),
          ...(input.primarySite.siteNotes !== undefined
            ? { siteNotes: input.primarySite.siteNotes || null }
            : {}),
          isPrimarySite: true
        }
      });

      if (siteResult.count === 0) {
        throw new Error("CLIENT_NOT_FOUND");
      }
    } else if (hasPrimarySiteContent(input.primarySite)) {
      await tx.clientSite.updateMany({
        where: { clientId: existing.id },
        data: { isPrimarySite: false }
      });
      await tx.clientSite.create({
        data: siteCreateData(
          existing.id,
          {
            localId: "",
            siteName: input.primarySite?.siteName ?? "",
            siteType: input.primarySite?.siteType ?? "Main Office",
            addressLine1: input.primarySite?.addressLine1 ?? "",
            addressLine2: input.primarySite?.addressLine2 ?? "",
            city: input.primarySite?.city ?? "",
            state: input.primarySite?.state ?? "PR",
            postalCode: input.primarySite?.postalCode ?? "",
            country: input.primarySite?.country ?? "Puerto Rico",
            googleMapsUrl: input.primarySite?.googleMapsUrl ?? "",
            latitude: input.primarySite?.latitude,
            longitude: input.primarySite?.longitude,
            operationalHours: input.primarySite?.operationalHours ?? "",
            accessInstructions: input.primarySite?.accessInstructions ?? "",
            parkingInstructions: input.primarySite?.parkingInstructions ?? "",
            securityRequirements: input.primarySite?.securityRequirements ?? "",
            siteNotes: input.primarySite?.siteNotes ?? "",
            isPrimarySite: true
          },
          true
        )
      });
    }

    if (input.primaryContact?.id) {
      await tx.pointOfContact.updateMany({
        where: { ownerType: CLIENT_OWNER_TYPE, ownerId: existing.id, NOT: { id: input.primaryContact.id } },
        data: { isPrimary: false, isPrimaryContact: false }
      });

      const contactResult = await tx.pointOfContact.updateMany({
        where: { id: input.primaryContact.id, ownerType: CLIENT_OWNER_TYPE, ownerId: existing.id },
        data: {
          ...(input.primaryContact.siteId !== undefined
            ? { siteId: input.primaryContact.siteId || null }
            : {}),
          ...(input.primaryContact.name !== undefined
            ? { name: input.primaryContact.name || null }
            : {}),
          ...(input.primaryContact.role !== undefined
            ? { role: input.primaryContact.role || "Primary" }
            : {}),
          ...(input.primaryContact.firstName !== undefined
            ? { firstName: input.primaryContact.firstName || "Unknown" }
            : {}),
          ...(input.primaryContact.lastName !== undefined
            ? { lastName: input.primaryContact.lastName }
            : {}),
          ...(input.primaryContact.title !== undefined
            ? { title: input.primaryContact.title || null }
            : {}),
          ...(input.primaryContact.department !== undefined
            ? { department: input.primaryContact.department || null }
            : {}),
          ...(input.primaryContact.email !== undefined
            ? { email: input.primaryContact.email || null }
            : {}),
          ...(input.primaryContact.phone !== undefined
            ? { phone: input.primaryContact.phone || null }
            : {}),
          ...(input.primaryContact.mobile !== undefined
            ? { mobile: input.primaryContact.mobile || null }
            : {}),
          ...(input.primaryContact.preferredContactMethod !== undefined
            ? { preferredContactMethod: input.primaryContact.preferredContactMethod || null }
            : {}),
          ...(input.primaryContact.isBilling !== undefined ||
          input.primaryContact.isBillingContact !== undefined
            ? {
                isBilling: input.primaryContact.isBilling || input.primaryContact.isBillingContact,
                isBillingContact:
                  input.primaryContact.isBilling || input.primaryContact.isBillingContact
              }
            : {}),
          ...(input.primaryContact.isTechnicalContact !== undefined
            ? { isTechnicalContact: input.primaryContact.isTechnicalContact }
            : {}),
          ...(input.primaryContact.isDecisionMaker !== undefined
            ? { isDecisionMaker: input.primaryContact.isDecisionMaker }
            : {}),
          ...(input.primaryContact.notes !== undefined
            ? { notes: input.primaryContact.notes || null }
            : {}),
          isPrimary: true,
          isPrimaryContact: true
        }
      });

      if (contactResult.count === 0) {
        throw new Error("CLIENT_NOT_FOUND");
      }
    } else if (hasPrimaryContactContent(input.primaryContact)) {
      await tx.pointOfContact.updateMany({
        where: { ownerType: CLIENT_OWNER_TYPE, ownerId: existing.id },
        data: { isPrimary: false, isPrimaryContact: false }
      });
      await tx.pointOfContact.create({
        data: contactCreateData(
          existing.id,
          {
            siteId: input.primaryContact?.siteId || "",
            siteLocalId: "",
            name: input.primaryContact?.name ?? "",
            role: input.primaryContact?.role ?? "Primary",
            firstName: input.primaryContact?.firstName ?? "",
            lastName: input.primaryContact?.lastName ?? "",
            title: input.primaryContact?.title ?? "",
            department: input.primaryContact?.department ?? "",
            email: input.primaryContact?.email ?? "",
            phone: input.primaryContact?.phone ?? "",
            mobile: input.primaryContact?.mobile ?? "",
            preferredContactMethod: input.primaryContact?.preferredContactMethod ?? "Email",
            isPrimary: true,
            isBilling: input.primaryContact?.isBilling ?? false,
            isPrimaryContact: true,
            isBillingContact:
              input.primaryContact?.isBilling || input.primaryContact?.isBillingContact || false,
            isTechnicalContact: input.primaryContact?.isTechnicalContact ?? false,
            isDecisionMaker: input.primaryContact?.isDecisionMaker ?? false,
            notes: input.primaryContact?.notes ?? ""
          },
          true,
          input.primaryContact?.siteId
        )
      });
    }

    await tx.clientActivity.create({
      data: {
        clientId: existing.id,
        type: "Client",
        title: "Client updated",
        detail: "Client account fields were updated.",
        actor: user?.name ?? "Pulse System",
        createdAt: now
      }
    });

    return tx.client.findUniqueOrThrow({
      where: { id: existing.id },
      include: clientInclude
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "Client",
    relatedEntityId: client.id,
    type: "Updated",
    title: `${client.displayName} updated`,
    detail: "Client account fields were updated.",
    metadata: { clientNumber: client.clientNumber, status: client.status }
  });

  return toClientRecord(client);
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

