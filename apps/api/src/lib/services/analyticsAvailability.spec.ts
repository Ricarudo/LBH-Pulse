import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { analyticsDetailsQuerySchema, analyticsQuerySchema, type AnalyticsResponse } from "@pulse/contracts/analytics";
import { LifecycleEntityType, Prisma } from "@/generated/prisma/client";

const date = new Date("2026-11-17T12:00:00Z");
const client = { id: "client-1", displayName: "Example client" };
const record = { client, createdAt: date, updatedAt: date, archivedAt: null, assignedTo: null };
const request = {
  ...record,
  id: "request-1",
  requestNumber: "R-1",
  title: "Request fixture",
  receivedDate: date,
  trades: [{ serviceCategory: "Electrical" }],
  relatedQuote: { createdAt: date }
};
const quote = {
  ...record,
  id: "quote-1",
  quoteNumber: "Q-1",
  title: "Quote fixture",
  owner: "Estimator",
  status: "Draft",
  calculationMode: "PULSE",
  items: [],
  requests: [request],
  serviceCategorySnapshot: null,
  revisions: []
};
const project = {
  ...record,
  id: "project-1",
  projectNumber: "P-1",
  title: "Project fixture",
  status: "Ready",
  dueDate: null,
  budget: new Prisma.Decimal(125),
  quote
};
const invoice = {
  ...record,
  id: "invoice-1",
  invoiceNumber: "I-1",
  title: "Invoice fixture",
  status: "Sent",
  amount: new Prisma.Decimal(375),
  issuedDate: date,
  dueDate: date,
  project
};
const invoiceIssued = {
  id: "invoice-event-1",
  entityType: LifecycleEntityType.INVOICE,
  entityId: invoice.id,
  changedAt: date,
  fromStatus: "Draft",
  toStatus: "Sent",
  valueSnapshot: invoice.amount,
  precision: "EXACT",
  metadata: null
};
const database = {
  workspaceSettings: { findUnique: async () => ({ timeZone: "America/Puerto_Rico" }) },
  request: { findMany: async () => [request] },
  quote: { findMany: async () => [quote] },
  project: { findMany: async () => [project] },
  invoice: { findMany: async () => [invoice] },
  client: { findMany: async () => [client] },
  lifecycleStatusEvent: {
    findMany: async ({ where }: { where: { entityType: { in: LifecycleEntityType[] } } }) =>
      where.entityType.in.includes(LifecycleEntityType.INVOICE) ? [invoiceIssued] : []
  }
};
Object.assign(globalThis, { prisma: database });
const analytics = import("@/lib/services/analyticsService");

function reader(...permissions: AuthenticatedUser["permissions"]): AuthenticatedUser {
  return {
    id: "analytics-user",
    name: "Analytics User",
    email: "analytics@example.test",
    role: "Sales",
    roleLabel: "Sales",
    accessRole: { id: "Sales", name: "Sales", color: "#2563EB" },
    permissions: ["analytics:read", ...permissions],
    isSystemAdmin: false,
    mustChangePassword: false,
    authProvider: "LOCAL"
  };
}

const fullAccess = reader("requests:read", "quotes:read", "projects:read", "billing:read", "clients:read");
const range = { from: "2026-11-01", to: "2099-11-17" };
const overview = analyticsQuerySchema.parse(range);
const kpi = (response: AnalyticsResponse, id: string) => {
  const item = response.kpis.find(entry => entry.id === id);
  assert.ok(item, id);
  return item;
};

test("an eligible zero-valued Quote produces an exact zero with a drilldown", async () => {
  const { getAnalytics, getAnalyticsDetails } = await analytics;
  const summary = await getAnalytics(fullAccess, overview);
  const pipeline = kpi(summary, "open-pipeline");
  assert.equal(pipeline.value, 0);
  assert.equal(pipeline.quality.status, "exact");
  assert.equal(pipeline.quality.availabilityReason, undefined);
  assert.equal(pipeline.calculation.components[0].value, 1);
  assert.deepEqual(summary.availableViews, ["overview", "sales", "operations", "billing"]);
  assert.equal(kpi(summary, "active-project-value").value, 125);
  assert.equal(kpi(summary, "invoiced").value, 375);
  const details = await getAnalyticsDetails(fullAccess, analyticsDetailsQuerySchema.parse({ ...range, metric: pipeline.metric }));
  assert.equal(details.total, 1);
  assert.equal(details.rows[0].reference, quote.quoteNumber);
  assert.equal(details.rows[0].value, 0);
  assert.deepEqual(details.calculation, pipeline.calculation);
});

test("an accessible selection with no records is identified separately from a genuine zero", async () => {
  const { getAnalytics, getAnalyticsDetails } = await analytics;
  const filters = { ...range, owner: "No matching owner" };
  const summary = await getAnalytics(fullAccess, analyticsQuerySchema.parse(filters));
  for (const item of summary.kpis) {
    assert.equal(item.quality.availabilityReason, "no_records", item.id);
    assert.equal(item.quality.eligibleCount, 0);
  }
  assert.equal(kpi(summary, "open-pipeline").value, 0);
  assert.equal(kpi(summary, "win-rate").value, null);
  const details = await getAnalyticsDetails(fullAccess, analyticsDetailsQuerySchema.parse({ ...filters, metric: "quotes.pipeline" }));
  assert.equal(details.summary, "0 records match this selection");
  assert.ok(details.calculation);
  assert.deepEqual(details.rows, []);
});

test("without billing permission Overview masks invoice amounts, evidence, charts, and drilldowns", async (t) => {
  const { getAnalytics, getAnalyticsDetails } = await analytics;
  const permitted = await getAnalytics(fullAccess, overview);
  const invoices = t.mock.method(database.invoice, "findMany", async () => assert.fail("Restricted invoices were queried"));
  const role = reader("requests:read", "quotes:read", "projects:read", "clients:read");
  const summary = await getAnalytics(role, overview);
  assert.deepEqual(summary.kpis.filter(item => !item.metric.startsWith("invoices.")), permitted.kpis.filter(item => !item.metric.startsWith("invoices.")));
  assert.deepEqual(summary.availableViews, ["overview", "sales", "operations"]);
  assert.equal(summary.dataQuality.exactLifecycleEvents, 0);
  for (const id of ["invoiced", "overdue-ar"]) {
    const item = kpi(summary, id);
    assert.equal(item.quality.availabilityReason, "restricted");
    assert.equal(item.quality.status, "unavailable");
    assert.equal(item.value, null);
    assert.equal(item.comparisonValue, null);
    assert.equal(item.deltaPercent, null);
    assert.deepEqual(item.calculation.components, []);
    assert.equal(item.quality.exactCount, undefined);
    const details = await getAnalyticsDetails(role, analyticsDetailsQuerySchema.parse({ ...range, metric: item.metric }));
    assert.deepEqual(details.rows, []);
    assert.equal(details.calculation, undefined);
    assert.match(details.summary, /permission/);
  }
  assert.equal(summary.charts.find(chart => chart.id === "value-movement")?.series.some(series => series.key === "invoiced"), false);
  assert.ok(!JSON.stringify(summary).includes(invoice.title));
  assert.equal(invoices.mock.callCount(), 0);
});

test("multiple missing sources do not expose restricted evidence through alternate views or cross-domain drilldowns", async () => {
  const { getAnalytics, getAnalyticsDetails } = await analytics;
  const role = reader("quotes:read");
  const summary = await getAnalytics(role, overview);
  assert.deepEqual(summary.availableViews, ["overview", "sales"]);
  assert.deepEqual(summary.filters.clients, []);
  assert.deepEqual(
    summary.kpis.filter(item => item.quality.availabilityReason === "restricted").map(item => item.id),
    ["active-project-value", "on-time", "invoiced", "overdue-ar"]
  );
  assert.deepEqual(summary.charts.find(chart => chart.id === "period-activity")?.points.map(point => point.key), ["quotes", "approved"]);
  assert.equal(summary.charts.find(chart => chart.id === "demand-by-trade")?.points.length, 0);
  const sales = await getAnalytics(role, { ...overview, view: "sales" });
  assert.equal(kpi(sales, "request-to-quote").quality.availabilityReason, "restricted");
  assert.equal(kpi(sales, "active-quote-value").value, 0);
  const billing = await getAnalytics(role, { ...overview, view: "billing" });
  assert.ok(billing.kpis.every(item => item.value === null && item.quality.availabilityReason === "restricted"));
  for (const metric of ["quotes.turnaround", "projects.end_to_end", "requests.source_converted"]) {
    const details = await getAnalyticsDetails(role, analyticsDetailsQuerySchema.parse({ ...range, metric }));
    assert.equal(details.total, 0);
    assert.deepEqual(details.rows, []);
    assert.equal(details.calculation, undefined);
    assert.match(details.summary, /permission/);
  }
});
