import { Prisma } from "@/generated/prisma/client";
import {
  canUser,
  type AuthenticatedUser
} from "@pulse/contracts/auth";
import { canAccessActivity } from "@/lib/services/activityService";
import {
  defaultDashboardPreferences,
  normalizeDashboardPreferences
} from "@/lib/dashboardPreferences";
import { prisma } from "@/lib/db";
import type { DashboardPreferencesInput } from "@pulse/contracts/dashboard";
import {
  dashboardWidgetIds,
  type DashboardActivityItem,
  type DashboardAttentionSummary,
  type DashboardDataResponse,
  type DashboardModuleHealthItem,
  type DashboardPreferencesRecord,
  type DashboardScheduleItem,
  type DashboardScope,
  type DashboardTiming,
  type DashboardWidgetId,
  type DashboardWidgetPayloadMap,
  type DashboardWorkItem
} from "@pulse/contracts/dashboard";

const terminalRequestStatuses = new Set([
  "Converted to Quote",
  "No Bid",
  "Cancelled",
  "Duplicate"
]);
const terminalQuoteStatuses = new Set(["Rejected", "Expired", "Cancelled"]);
const terminalProjectStatuses = new Set(["Completed", "Cancelled"]);
const terminalInvoiceStatuses = new Set(["Paid", "Void"]);
const operationalActivityEntities = new Set([
  "Request",
  "Client",
  "Opportunity",
  "Quote",
  "Project",
  "Invoice"
]);
const priorityRank: Record<string, number> = {
  Urgent: 4,
  High: 3,
  Normal: 2,
  Low: 1
};
const timingRank: Record<DashboardTiming, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  later: 3,
  none: 4
};

export function normalizeDashboardOwner(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function workspaceBusinessDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function dateDifference(date: string, businessDate: string) {
  return Math.round(
    (Date.parse(`${date}T12:00:00.000Z`) - Date.parse(`${businessDate}T12:00:00.000Z`)) /
      86_400_000
  );
}

export function classifyDashboardDate(
  date: string | undefined,
  businessDate: string
): DashboardTiming {
  if (!date) return "none";
  const difference = dateDifference(date, businessDate);
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  if (difference <= 7) return "upcoming";
  return "later";
}

function dateOutput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function isUnassigned(value?: string | null) {
  const owner = normalizeDashboardOwner(value);
  return !owner || owner === "unassigned";
}

function recordMatchesScope(
  scope: DashboardScope,
  user: AuthenticatedUser,
  owner: string | null | undefined,
  teamNames: Set<string>
) {
  if (scope === "all") return true;
  const normalizedOwner = normalizeDashboardOwner(owner);
  if (scope === "mine") return normalizedOwner === normalizeDashboardOwner(user.name);
  return teamNames.has(normalizedOwner);
}

function requestMatchesScope(
  scope: DashboardScope,
  user: AuthenticatedUser,
  request: {
    assignedToId: string | null;
    assignedTo: { name: string; role: string } | null;
    collaborators: Array<{ user: { id: string; name: string; role: string } }>;
    updates: Array<{ assigneeId: string | null; assignee: { name: string; role: string } | null }>;
  },
  teamNames: Set<string>
) {
  if (scope === "all") return true;
  if (scope === "mine") {
    return request.assignedToId === user.id ||
      request.updates.some((update) => update.assigneeId === user.id) ||
      request.collaborators.some((collaborator) => collaborator.user.id === user.id) ||
      normalizeDashboardOwner(request.assignedTo?.name) === normalizeDashboardOwner(user.name);
  }
  return request.assignedTo?.role === user.role ||
    request.updates.some((update) => update.assignee?.role === user.role) ||
    request.collaborators.some((collaborator) => collaborator.user.role === user.role) ||
    teamNames.has(normalizeDashboardOwner(request.assignedTo?.name));
}

function workHref(kind: DashboardWorkItem["kind"], entityId: string, updateId?: string) {
  if (kind === "request") {
    return updateId
      ? `/requests/${entityId}?tab=updates&update=${encodeURIComponent(updateId)}`
      : `/requests/${entityId}`;
  }
  if (kind === "quote") return `/quotes?record=${encodeURIComponent(entityId)}`;
  if (kind === "project") return `/projects?record=${encodeURIComponent(entityId)}`;
  return `/billing?record=${encodeURIComponent(entityId)}`;
}

function activityHref(entityType: string, entityId: string) {
  if (entityType === "Request") return `/requests/${entityId}`;
  if (entityType === "Client") return `/clients/${entityId}`;
  if (entityType === "Quote") return `/quotes?record=${encodeURIComponent(entityId)}`;
  if (entityType === "Project") return `/projects?record=${encodeURIComponent(entityId)}`;
  if (entityType === "Invoice") return `/billing?record=${encodeURIComponent(entityId)}`;
  return undefined;
}

function requestAttentionReasons(request: {
  status: string;
  priority: string;
  assignedToId: string | null;
  currentStep: { assigneeId: string | null; targetDate: Date | null } | null;
}) {
  const reasons: string[] = [];
  if (!request.assignedToId) reasons.push("Needs an owner");
  if (request.currentStep && !request.currentStep.assigneeId) reasons.push("Needs a step assignee");
  if (request.priority === "Urgent") reasons.push("Urgent priority");
  if (request.status === "Missing Info") reasons.push("Missing information");
  if (request.status === "Site Visit Required") reasons.push("Site visit required");
  if (request.status === "Ready for Quote") reasons.push("Ready for quote");
  return reasons;
}

function sortWorkItems(left: DashboardWorkItem, right: DashboardWorkItem) {
  const timing = timingRank[left.timing] - timingRank[right.timing];
  if (timing !== 0) return timing;
  if (left.timing === "none" && right.timing === "none") {
    const attention = Number(right.attentionReasons.length > 0) - Number(left.attentionReasons.length > 0);
    if (attention !== 0) return attention;
  }
  if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }
  const priority = (priorityRank[right.priority ?? ""] ?? 0) -
    (priorityRank[left.priority ?? ""] ?? 0);
  if (priority !== 0) return priority;
  return left.reference.localeCompare(right.reference);
}

export async function getDashboardPreferences(
  user: AuthenticatedUser
): Promise<DashboardPreferencesRecord> {
  const record = await prisma.localUser.findUniqueOrThrow({
    where: { id: user.id },
    select: { dashboardPreferences: true }
  });
  return normalizeDashboardPreferences(record.dashboardPreferences, user.isSystemAdmin);
}

export async function updateDashboardPreferences(
  user: AuthenticatedUser,
  input: DashboardPreferencesInput
): Promise<DashboardPreferencesRecord> {
  const normalized = normalizeDashboardPreferences(input, user.isSystemAdmin);
  await prisma.localUser.update({
    where: { id: user.id },
    data: {
      dashboardPreferences: normalized as unknown as Prisma.InputJsonValue
    }
  });
  return normalized;
}

export async function resetDashboardPreferences(user: AuthenticatedUser) {
  const preferences = defaultDashboardPreferences(user.isSystemAdmin);
  await prisma.localUser.update({
    where: { id: user.id },
    data: {
      dashboardPreferences: preferences as unknown as Prisma.InputJsonValue
    }
  });
  return preferences;
}

export async function getDashboardData(
  user: AuthenticatedUser,
  requestedScope?: DashboardScope,
  requestedWidgets: DashboardWidgetId[] = [...dashboardWidgetIds]
): Promise<DashboardDataResponse> {
  const preferences = await getDashboardPreferences(user);
  const scope = requestedScope ?? preferences.defaultScope;
  const widgetSet = new Set(requestedWidgets);
  const workspace = await prisma.workspaceSettings.findUnique({
    where: { id: "default" },
    select: { timeZone: true }
  });
  const businessDate = workspaceBusinessDate(
    workspace?.timeZone ?? "America/Puerto_Rico"
  );
  const canComplete = canUser(user, "activity:write");
  const needsOperationalData = requestedWidgets.some((id) => id !== "recent-activity");
  const activeUsers = await prisma.localUser.findMany({
    where: {
      active: true,
      ...(scope === "team" ? { role: user.role } : {})
    },
    select: { id: true, name: true, role: true }
  });
  const teamNames = new Set(
    activeUsers
      .filter((candidate) => scope !== "team" || candidate.role === user.role)
      .map((candidate) => normalizeDashboardOwner(candidate.name))
  );

  const [requests, quotes, projects, invoices] = needsOperationalData
    ? await Promise.all([
        prisma.request.findMany({
          where: { archivedAt: null },
          select: {
            id: true,
            requestNumber: true,
            title: true,
            status: true,
            priority: true,
            companyName: true,
            dueDate: true,
            assignedToId: true,
            assignedTo: { select: { name: true, role: true } },
            client: { select: { displayName: true } },
            updates: {
              where: { kind: "step", stepStatus: "open" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                id: true,
                title: true,
                body: true,
                targetDate: true,
                stepStatus: true,
                assigneeId: true,
                assignee: { select: { name: true, role: true } }
              }
            },
            collaborators: {
              select: { user: { select: { id: true, name: true, role: true } } }
            }
          }
        }),
        prisma.quote.findMany({
          where: { archivedAt: null },
          select: {
            id: true,
            quoteNumber: true,
            title: true,
            status: true,
            owner: true,
            total: true,
            clientName: true,
            client: { select: { displayName: true } },
            project: { select: { id: true } }
          }
        }),
        prisma.project.findMany({
          where: { archivedAt: null },
          select: {
            id: true,
            projectNumber: true,
            title: true,
            status: true,
            owner: true,
            budget: true,
            dueDate: true,
            client: { select: { displayName: true } }
          }
        }),
        prisma.invoice.findMany({
          where: { archivedAt: null },
          select: {
            id: true,
            invoiceNumber: true,
            title: true,
            status: true,
            owner: true,
            amount: true,
            dueDate: true,
            client: { select: { displayName: true } }
          }
        })
      ])
    : [[], [], [], []] as const;

  const scopedRequests = canUser(user, "requests:read")
    ? requests.filter((request) => requestMatchesScope(scope, user, request, teamNames))
    : [];
  const scopedQuotes = canUser(user, "quotes:read")
    ? quotes.filter((quote) => recordMatchesScope(scope, user, quote.owner, teamNames))
    : [];
  const scopedProjects = canUser(user, "projects:read")
    ? projects.filter((project) => recordMatchesScope(scope, user, project.owner, teamNames))
    : [];
  const scopedInvoices = canUser(user, "billing:read")
    ? invoices.filter((invoice) => recordMatchesScope(scope, user, invoice.owner, teamNames))
    : [];

  const workItems: DashboardWorkItem[] = [];
  for (const request of scopedRequests) {
    if (terminalRequestStatuses.has(request.status)) continue;
    const dueDate = dateOutput(request.dueDate);
    const currentStep = request.updates[0] ?? null;
    const suggestedTitle = !request.assignedToId
      ? "Assign an owner"
      : request.status === "Missing Info"
        ? "Resolve missing information"
        : request.status === "Site Visit Required"
          ? "Complete required site visit"
          : "Set a current step";
    const stepTitle = currentStep
      ? currentStep.title || currentStep.body || "Current step"
      : suggestedTitle;
    const stepDate = dateOutput(currentStep?.targetDate);
    const workDate = stepDate || dueDate;
    const explicitStep = Boolean(currentStep && currentStep.stepStatus === "open");
    const stepOwner = currentStep?.assignee?.name || request.assignedTo?.name || "Unassigned";
    workItems.push({
      id: `request:${request.id}`,
      kind: "request",
      entityId: request.id,
      stepId: currentStep?.id,
      reference: request.requestNumber,
      title: stepTitle,
      context: request.companyName || request.client?.displayName || "Request",
      owner: stepOwner,
      status: explicitStep ? "Current step" : "Suggested",
      priority: request.priority,
      dueDate: workDate || undefined,
      timing: classifyDashboardDate(workDate, businessDate),
      attentionReasons: requestAttentionReasons({ ...request, currentStep }),
      href: workHref("request", request.id, currentStep?.id),
      canComplete: canComplete && explicitStep,
      suggested: !explicitStep
    });
  }

  for (const quote of scopedQuotes) {
    if (terminalQuoteStatuses.has(quote.status)) continue;
    const reasons: string[] = [];
    if (isUnassigned(quote.owner)) reasons.push("Needs an owner");
    if (quote.status === "Review") reasons.push("Awaiting review");
    if (quote.status === "Approved" && !quote.project) reasons.push("Ready for project handoff");
    if (!reasons.length) continue;
    workItems.push({
      id: `quote:${quote.id}`,
      kind: "quote",
      entityId: quote.id,
      reference: quote.quoteNumber,
      title: quote.title,
      context: quote.client?.displayName ?? quote.clientName ?? "Quote",
      owner: quote.owner,
      status: quote.status,
      timing: "none",
      attentionReasons: reasons,
      href: workHref("quote", quote.id),
      canComplete: false
    });
  }

  for (const project of scopedProjects) {
    if (terminalProjectStatuses.has(project.status)) continue;
    const dueDate = dateOutput(project.dueDate);
    const timing = classifyDashboardDate(dueDate, businessDate);
    const reasons: string[] = [];
    if (isUnassigned(project.owner)) reasons.push("Needs an owner");
    if (project.status === "On Hold") reasons.push("Project on hold");
    if (timing === "later" && !reasons.length) continue;
    workItems.push({
      id: `project:${project.id}`,
      kind: "project",
      entityId: project.id,
      reference: project.projectNumber,
      title: project.title,
      context: project.client.displayName,
      owner: project.owner,
      status: project.status,
      dueDate: dueDate || undefined,
      timing,
      attentionReasons: reasons,
      href: workHref("project", project.id),
      canComplete: false
    });
  }

  for (const invoice of scopedInvoices) {
    if (terminalInvoiceStatuses.has(invoice.status)) continue;
    const dueDate = dateOutput(invoice.dueDate);
    const timing = classifyDashboardDate(dueDate, businessDate);
    const reasons: string[] = [];
    if (isUnassigned(invoice.owner)) reasons.push("Needs an owner");
    if (invoice.status === "Overdue" || timing === "overdue") reasons.push("Payment overdue");
    if (timing === "later" && !reasons.length) continue;
    workItems.push({
      id: `invoice:${invoice.id}`,
      kind: "invoice",
      entityId: invoice.id,
      reference: invoice.invoiceNumber,
      title: invoice.title,
      context: invoice.client.displayName,
      owner: invoice.owner,
      status: invoice.status,
      dueDate: dueDate || undefined,
      timing,
      attentionReasons: Array.from(new Set(reasons)),
      href: workHref("invoice", invoice.id),
      canComplete: false
    });
  }
  workItems.sort(sortWorkItems);

  const attentionSummary: DashboardAttentionSummary = {
    overdue: workItems.filter((item) => item.timing === "overdue").length,
    dueToday: workItems.filter((item) => item.timing === "today").length,
    dueNextSevenDays: workItems.filter((item) => item.timing === "upcoming").length,
    needsAttention: workItems.filter((item) => item.attentionReasons.length > 0).length,
    unassigned: workItems.filter((item) => isUnassigned(item.owner)).length
  };

  const scheduleItems: DashboardScheduleItem[] = [];
  const scheduleLimit = addDays(businessDate, 14);
  const addSchedule = (item: DashboardScheduleItem) => {
    if (item.date <= scheduleLimit) scheduleItems.push(item);
  };
  for (const request of scopedRequests) {
    if (terminalRequestStatuses.has(request.status)) continue;
    const context = request.companyName || request.client?.displayName || request.title;
    const dueDate = dateOutput(request.dueDate);
    if (dueDate) addSchedule({
      id: `request-due:${request.id}`,
      kind: "request",
      reference: request.requestNumber,
      title: `${request.title} due`,
      context,
      date: dueDate,
      timing: classifyDashboardDate(dueDate, businessDate),
      href: workHref("request", request.id)
    });
    const currentStep = request.updates[0] ?? null;
    const stepDate = dateOutput(currentStep?.targetDate);
    if (stepDate) addSchedule({
      id: `request-step:${request.id}`,
      kind: "follow-up",
      reference: request.requestNumber,
      title: currentStep?.title || currentStep?.body || `Current step for ${request.title}`,
      context,
      date: stepDate,
      timing: classifyDashboardDate(stepDate, businessDate),
      href: workHref("request", request.id, currentStep?.id)
    });
  }
  for (const project of scopedProjects) {
    if (terminalProjectStatuses.has(project.status)) continue;
    const date = dateOutput(project.dueDate);
    if (date) addSchedule({
      id: `project-due:${project.id}`,
      kind: "project",
      reference: project.projectNumber,
      title: `${project.title} due`,
      context: project.client.displayName,
      date,
      timing: classifyDashboardDate(date, businessDate),
      href: workHref("project", project.id)
    });
  }
  for (const invoice of scopedInvoices) {
    if (terminalInvoiceStatuses.has(invoice.status)) continue;
    const date = dateOutput(invoice.dueDate);
    if (date) addSchedule({
      id: `invoice-due:${invoice.id}`,
      kind: "invoice",
      reference: invoice.invoiceNumber,
      title: `${invoice.title} due`,
      context: invoice.client.displayName,
      date,
      timing: classifyDashboardDate(date, businessDate),
      href: workHref("invoice", invoice.id)
    });
  }
  scheduleItems.sort((left, right) =>
    left.date.localeCompare(right.date) || left.reference.localeCompare(right.reference)
  );

  const requestIds = new Set(scopedRequests.map((record) => record.id));
  const quoteIds = new Set(scopedQuotes.map((record) => record.id));
  const projectIds = new Set(scopedProjects.map((record) => record.id));
  const invoiceIds = new Set(scopedInvoices.map((record) => record.id));
  const scopedEntityIds: Record<string, Set<string>> = {
    Request: requestIds,
    Quote: quoteIds,
    Project: projectIds,
    Invoice: invoiceIds
  };
  let activityItems: DashboardActivityItem[] = [];
  if (widgetSet.has("recent-activity") && canUser(user, "activity:read")) {
    const activities = await prisma.activity.findMany({
      where: {
        relatedEntityType: { in: Array.from(operationalActivityEntities) }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const teamUserIds = new Set(
      activeUsers
        .filter((candidate) => candidate.role === user.role)
        .map((candidate) => candidate.id)
    );
    activityItems = activities
      .filter((activity) => canAccessActivity(user, activity))
      .filter((activity) => {
        if (scope === "all") return true;
        const actorMatches = scope === "mine"
          ? activity.actorUserId === user.id
          : Boolean(activity.actorUserId && teamUserIds.has(activity.actorUserId));
        const relatedMatches =
          scopedEntityIds[activity.relatedEntityType]?.has(activity.relatedEntityId) ?? false;
        return actorMatches || relatedMatches;
      })
      .slice(0, 30)
      .map((activity) => ({
        id: activity.id,
        entityType: activity.relatedEntityType,
        type: activity.type,
        title: activity.title,
        detail: activity.detail ?? "",
        actorName: activity.actorName,
        createdAt: activity.createdAt.toISOString(),
        href: activityHref(activity.relatedEntityType, activity.relatedEntityId)
      }));
  }

  const activeRequests = scopedRequests.filter(
    (request) => !terminalRequestStatuses.has(request.status)
  );
  const activeQuotes = scopedQuotes.filter(
    (quote) => !terminalQuoteStatuses.has(quote.status)
  );
  const activeProjects = scopedProjects.filter(
    (project) => !terminalProjectStatuses.has(project.status)
  );
  const activeInvoices = scopedInvoices.filter(
    (invoice) => !terminalInvoiceStatuses.has(invoice.status)
  );
  const moduleHealth: DashboardModuleHealthItem[] = [
    {
      id: "requests",
      label: "Requests",
      count: activeRequests.length,
      detail: `${activeRequests.filter((request) => !request.assignedToId).length} unassigned`,
      href: "/requests?view=open"
    },
    {
      id: "quotes",
      label: "Quotes",
      count: activeQuotes.length,
      detail: `${activeQuotes.filter((quote) => quote.status === "Review").length} in review`,
      href: "/quotes"
    },
    {
      id: "projects",
      label: "Projects",
      count: activeProjects.length,
      detail: `${activeProjects.filter((project) => project.status === "On Hold").length} on hold`,
      href: "/projects"
    },
    {
      id: "billing",
      label: "Billing",
      count: activeInvoices.length,
      detail: `${activeInvoices.filter((invoice) =>
        invoice.status === "Overdue" ||
        classifyDashboardDate(dateOutput(invoice.dueDate), businessDate) === "overdue"
      ).length} overdue`,
      href: "/billing"
    }
  ];

  const widgets: Partial<DashboardWidgetPayloadMap> = {};
  if (widgetSet.has("attention-summary")) widgets["attention-summary"] = attentionSummary;
  if (widgetSet.has("work-queue")) {
    widgets["work-queue"] = { items: workItems.slice(0, 50), total: workItems.length };
  }
  if (widgetSet.has("upcoming-dates")) {
    widgets["upcoming-dates"] = {
      items: scheduleItems.slice(0, 50),
      total: scheduleItems.length
    };
  }
  if (widgetSet.has("recent-activity")) {
    widgets["recent-activity"] = { items: activityItems };
  }
  if (widgetSet.has("module-health")) widgets["module-health"] = { items: moduleHealth };

  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    scope,
    scopeLabel: scope === "mine"
      ? "My work"
      : scope === "team"
        ? `${user.roleLabel} team`
        : "All Pulse",
    viewer: {
      id: user.id,
      name: user.name,
      role: user.role,
      roleName: user.roleLabel
    },
    widgets
  };
}
