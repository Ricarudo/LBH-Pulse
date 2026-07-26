import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });
const apply = process.argv.includes("--apply");
const createPlaceholderSites = process.argv.includes("--create-placeholder-sites");

async function context(details = "") {
  return prisma.lifecycleContext.create({ data: { details } });
}

async function ensureLegacyMainSites() {
  const clients = await prisma.client.findMany({
    where: { sites: { none: {} } },
    select: { id: true, createdAt: true }
  });

  for (const client of clients) {
    await prisma.clientSite.create({
      data: {
        clientId: client.id,
        name: "[Placeholder] Main Office",
        siteName: "[Placeholder] Main Office",
        siteType: "Legacy Placeholder",
        state: "PR",
        country: "Puerto Rico",
        status: "Active",
        isPrimarySite: true,
        isPlaceholder: true,
        createdAt: client.createdAt
      }
    });
  }

  return clients.length;
}

async function main() {
  const [clientsWithoutSites, requestsWithoutContexts, quotesWithoutContexts, quoteWithoutSiteCount, projectsWithoutContexts, invoicesWithoutContexts] = await Promise.all([
    prisma.client.findMany({ where: { sites: { none: {} } }, select: { id: true, clientNumber: true, displayName: true } }),
    prisma.request.count({ where: { lifecycleContextId: null } }),
    prisma.quote.count({ where: { lifecycleContextId: null } }),
    prisma.quote.count({ where: { siteId: null, clientId: { not: null } } }),
    prisma.project.count({ where: { lifecycleContextId: null } }),
    prisma.invoice.count({ where: { lifecycleContextId: null } })
  ]);
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PREVIEW",
    placeholderSiteCreationOptIn: createPlaceholderSites,
    clientsWithoutSites: clientsWithoutSites.map((client) => ({
      entityId: client.id,
      clientNumber: client.clientNumber,
      currentValue: "no site",
      proposedRepair: createPlaceholderSites ? "create a clearly marked placeholder site" : "human review and creation of a real site",
      confidence: createPlaceholderSites ? "low" : "not-applicable",
      automaticRepairSafe: false,
      humanReviewRequired: true
    })),
    lifecycleContexts: {
      requests: requestsWithoutContexts,
      quotes: quotesWithoutContexts,
      projects: projectsWithoutContexts,
      invoices: invoicesWithoutContexts
    },
    quotesWithoutSites: quoteWithoutSiteCount
  }, null, 2));
  if (!apply) {
    console.log("No changes made. Add --apply for deterministic context links; placeholder sites also require --create-placeholder-sites.");
    return;
  }
  let linked = 0;
  const sitesCreated = createPlaceholderSites ? await ensureLegacyMainSites() : 0;
  const requests = await prisma.request.findMany({
    where: { lifecycleContextId: null },
    select: { id: true, description: true }
  });
  for (const request of requests) {
    const created = await context(request.description ?? "");
    await prisma.request.update({
      where: { id: request.id },
      data: { lifecycleContextId: created.id }
    });
    linked += 1;
  }

  const quotes = await prisma.quote.findMany({
    where: { lifecycleContextId: null },
    select: { id: true, scopeDescriptionSnapshot: true }
  });
  for (const quote of quotes) {
    const source = await prisma.request.findFirst({
      where: { relatedQuoteId: quote.id, lifecycleContextId: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { lifecycleContextId: true, siteId: true, assignedToId: true }
    });
    const lifecycleContextId = source?.lifecycleContextId ??
      (await context(quote.scopeDescriptionSnapshot ?? "")).id;
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        lifecycleContextId,
        ...(source?.siteId ? { siteId: source.siteId } : {}),
        ...(source?.assignedToId ? { assignedToId: source.assignedToId } : {})
      }
    });
    linked += 1;
  }

  const quotesWithoutSites = await prisma.quote.findMany({
    where: { siteId: null, clientId: { not: null } },
    select: { id: true, clientId: true }
  });
  for (const quote of quotesWithoutSites) {
    const sites = await prisma.clientSite.findMany({
      where: { clientId: quote.clientId!, isPrimarySite: true },
      select: { id: true },
      take: 2
    });
    if (sites.length === 1) {
      await prisma.quote.update({
        where: { id: quote.id },
        data: { siteId: sites[0].id }
      });
      linked += 1;
    }
  }

  const projects = await prisma.project.findMany({
    where: { lifecycleContextId: null },
    select: { id: true, quoteId: true }
  });
  for (const project of projects) {
    const source = project.quoteId
      ? await prisma.quote.findUnique({
          where: { id: project.quoteId },
          select: { lifecycleContextId: true, contactId: true, siteId: true }
        })
      : null;
    const lifecycleContextId = source?.lifecycleContextId ?? (await context()).id;
    await prisma.project.update({
      where: { id: project.id },
      data: {
        lifecycleContextId,
        ...(source?.contactId ? { contactId: source.contactId } : {}),
        ...(source?.siteId ? { siteId: source.siteId } : {})
      }
    });
    linked += 1;
  }

  const invoices = await prisma.invoice.findMany({
    where: { lifecycleContextId: null },
    select: { id: true, projectId: true }
  });
  for (const invoice of invoices) {
    const source = invoice.projectId
      ? await prisma.project.findUnique({
          where: { id: invoice.projectId },
          select: { lifecycleContextId: true, contactId: true, siteId: true }
        })
      : null;
    const lifecycleContextId = source?.lifecycleContextId ?? (await context()).id;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        lifecycleContextId,
        ...(source?.contactId ? { contactId: source.contactId } : {}),
        ...(source?.siteId ? { siteId: source.siteId } : {})
      }
    });
    linked += 1;
  }

  const messages = [
    sitesCreated ? `Created ${sitesCreated} legacy client main sites.` : null,
    linked ? `Linked ${linked} lifecycle records.` : null
  ].filter(Boolean);
  console.log(messages.join(" ") || "Legacy lifecycle data is already initialized.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
