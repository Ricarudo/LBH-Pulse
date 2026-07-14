import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  LifecycleEntityType,
  PrismaClient
} from "../src/generated/prisma/client";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: "pulse" }
);
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.lifecycleStatusEvent.findMany({
    select: { entityType: true, entityId: true }
  });
  const initialized = new Set(existing.map((event) => `${event.entityType}:${event.entityId}`));
  const [requests, quotes, projects, invoices] = await Promise.all([
    prisma.request.findMany({ select: { id: true, status: true, updatedAt: true, receivedDate: true, dueDate: true } }),
    prisma.quote.findMany({ select: { id: true, status: true, updatedAt: true, total: true } }),
    prisma.project.findMany({ select: { id: true, status: true, updatedAt: true, budget: true, startDate: true, dueDate: true } }),
    prisma.invoice.findMany({ select: { id: true, status: true, updatedAt: true, amount: true, issuedDate: true, dueDate: true } })
  ]);

  const rows = [
    ...requests.filter((record) => !initialized.has(`${LifecycleEntityType.REQUEST}:${record.id}`)).map((record) => ({
      entityType: LifecycleEntityType.REQUEST,
      entityId: record.id,
      toStatus: record.status,
      changedAt: record.updatedAt,
      actorNameSnapshot: "Pulse migration",
      metadata: { receivedDate: record.receivedDate.toISOString(), dueDate: record.dueDate?.toISOString() ?? null },
      source: "MIGRATION",
      precision: "ESTIMATED" as const
    })),
    ...quotes.filter((record) => !initialized.has(`${LifecycleEntityType.QUOTE}:${record.id}`)).map((record) => ({
      entityType: LifecycleEntityType.QUOTE,
      entityId: record.id,
      toStatus: record.status,
      changedAt: record.updatedAt,
      actorNameSnapshot: "Pulse migration",
      valueSnapshot: record.total,
      source: "MIGRATION",
      precision: "ESTIMATED" as const
    })),
    ...projects.filter((record) => !initialized.has(`${LifecycleEntityType.PROJECT}:${record.id}`)).map((record) => ({
      entityType: LifecycleEntityType.PROJECT,
      entityId: record.id,
      toStatus: record.status,
      changedAt: record.updatedAt,
      actorNameSnapshot: "Pulse migration",
      valueSnapshot: record.budget,
      metadata: { startDate: record.startDate?.toISOString() ?? null, dueDate: record.dueDate?.toISOString() ?? null },
      source: "MIGRATION",
      precision: "ESTIMATED" as const
    })),
    ...invoices.filter((record) => !initialized.has(`${LifecycleEntityType.INVOICE}:${record.id}`)).map((record) => ({
      entityType: LifecycleEntityType.INVOICE,
      entityId: record.id,
      toStatus: record.status,
      changedAt: record.updatedAt,
      actorNameSnapshot: "Pulse migration",
      valueSnapshot: record.amount,
      metadata: { issuedDate: record.issuedDate?.toISOString() ?? null, dueDate: record.dueDate?.toISOString() ?? null },
      source: "MIGRATION",
      precision: "ESTIMATED" as const
    }))
  ];

  if (!rows.length) {
    console.log("Lifecycle analytics history is already initialized.");
    return;
  }
  const result = await prisma.lifecycleStatusEvent.createMany({ data: rows });
  console.log(`Initialized lifecycle analytics history for ${result.count} records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
