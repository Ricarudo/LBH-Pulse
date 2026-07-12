import { prisma } from "@/lib/db";
import type {
  GlobalSearchKind,
  GlobalSearchResponse,
  GlobalSearchResult
} from "@pulse/contracts/search";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";

const candidateLimit = 12;
const resultLimitPerKind = 5;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function rankCandidate(candidate: GlobalSearchResult, query: string) {
  const number = normalize(candidate.number);
  const title = normalize(candidate.title);
  const context = normalize(candidate.context);

  if (number === query) return 0;
  if (number.startsWith(query)) return 1;
  if (title.startsWith(query)) return 2;
  if (context.startsWith(query)) return 3;
  if (number.includes(query)) return 4;
  if (title.includes(query)) return 5;
  if (context.includes(query)) return 6;
  return 7;
}

export function rankSearchResults(
  candidates: GlobalSearchResult[],
  rawQuery: string,
  limit = resultLimitPerKind
): GlobalSearchResult[] {
  const query = normalize(rawQuery);
  return candidates
    .sort((left, right) => {
      const rankDifference =
        rankCandidate(left, query) - rankCandidate(right, query);
      return rankDifference ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    })
    .slice(0, limit);
}

function toCandidate(
  kind: GlobalSearchKind,
  record: {
    id: string;
    number: string;
    title: string;
    context: string;
    status: string;
    updatedAt: Date;
  }
): GlobalSearchResult {
  return {
    kind,
    id: record.id,
    number: record.number,
    title: record.title,
    context: record.context,
    status: record.status,
    updatedAt: record.updatedAt.toISOString()
  };
}

export async function searchPulse(
  rawQuery: string,
  user: AuthenticatedUser
): Promise<GlobalSearchResponse> {
  const query = rawQuery.trim();
  const normalizedQuery = normalize(query);
  const contains = { contains: query, mode: "insensitive" as const };

  const [requests, clients, quotes, projects, invoices, items] = await Promise.all([
    canUser(user, "requests:read") ? prisma.request.findMany({
      where: {
        archivedAt: null,
        OR: [
          { requestNumber: contains },
          { title: contains },
          { companyName: contains },
          { contactName: contains },
          { siteName: contains }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        requestNumber: true,
        title: true,
        companyName: true,
        contactName: true,
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([]),
    canUser(user, "clients:read") ? prisma.client.findMany({
      where: {
        archivedAt: null,
        OR: [
          { clientNumber: contains },
          { displayName: contains },
          { companyName: contains },
          { legalName: contains }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        clientNumber: true,
        displayName: true,
        companyName: true,
        industry: true,
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([]),
    canUser(user, "quotes:read") ? prisma.quote.findMany({
      where: {
        archivedAt: null,
        OR: [
          { quoteNumber: contains },
          { title: contains },
          { clientName: contains },
          { client: { displayName: contains } }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        quoteNumber: true,
        title: true,
        clientName: true,
        client: { select: { displayName: true } },
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([]),
    canUser(user, "projects:read") ? prisma.project.findMany({
      where: {
        archivedAt: null,
        OR: [
          { projectNumber: contains },
          { title: contains },
          { client: { displayName: contains } }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        projectNumber: true,
        title: true,
        client: { select: { displayName: true } },
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([]),
    canUser(user, "billing:read") ? prisma.invoice.findMany({
      where: {
        archivedAt: null,
        OR: [
          { invoiceNumber: contains },
          { title: contains },
          { client: { displayName: contains } }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        invoiceNumber: true,
        title: true,
        client: { select: { displayName: true } },
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([]),
    canUser(user, "items:read") ? prisma.item.findMany({
      where: {
        OR: [
          { name: contains },
          { sku: contains },
          { partNumber: contains },
          { manufacturer: contains },
          { brand: contains },
          { category: contains },
          { subcategory: contains },
          { description: contains }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: candidateLimit,
      select: {
        id: true,
        name: true,
        sku: true,
        partNumber: true,
        manufacturer: true,
        brand: true,
        category: true,
        subcategory: true,
        status: true,
        updatedAt: true
      }
    }) : Promise.resolve([])
  ]);

  const results = [
    ...rankSearchResults(
      requests.map((record) =>
        toCandidate("request", {
          id: record.id,
          number: record.requestNumber,
          title: record.title,
          context:
            record.companyName ||
            record.contactName ||
            "Request intake",
          status: record.status,
          updatedAt: record.updatedAt
        })
      ),
      normalizedQuery
    ),
    ...rankSearchResults(
      clients.map((record) =>
        toCandidate("client", {
          id: record.id,
          number: record.clientNumber,
          title: record.displayName,
          context:
            record.companyName ||
            record.industry ||
            "Client account",
          status: record.status,
          updatedAt: record.updatedAt
        })
      ),
      normalizedQuery
    ),
    ...rankSearchResults(
      quotes.map((record) =>
        toCandidate("quote", {
          id: record.id,
          number: record.quoteNumber,
          title: record.title,
          context:
            record.client?.displayName ||
            record.clientName ||
            "Quote",
          status: record.status,
          updatedAt: record.updatedAt
        })
      ),
      normalizedQuery
    ),
    ...rankSearchResults(
      projects.map((record) =>
        toCandidate("project", {
          id: record.id,
          number: record.projectNumber,
          title: record.title,
          context: record.client.displayName,
          status: record.status,
          updatedAt: record.updatedAt
        })
      ),
      normalizedQuery
    ),
    ...rankSearchResults(
      invoices.map((record) =>
        toCandidate("invoice", {
          id: record.id,
          number: record.invoiceNumber,
          title: record.title,
          context: record.client.displayName,
          status: record.status,
          updatedAt: record.updatedAt
        })
      ),
      normalizedQuery
    ),
    ...rankSearchResults(
      items.map((record) => {
        const number = record.sku || record.partNumber || "";
        const context = [
          record.partNumber,
          record.manufacturer,
          record.brand,
          record.category,
          record.subcategory
        ].filter(Boolean).join(" · ") || "Catalog item";

        return toCandidate("item", {
          id: record.id,
          number,
          title: record.name,
          context,
          status: record.status,
          updatedAt: record.updatedAt
        });
      }),
      normalizedQuery
    )
  ];

  return {
    query,
    results,
    total: results.length
  };
}
