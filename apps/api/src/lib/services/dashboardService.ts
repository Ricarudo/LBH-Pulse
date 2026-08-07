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

type DashboardScopeRecord = {
  assignedToId: string | null;
  assignedTo: { name: string; role: string } | null;
  lifecycleContext: {
    collaborators: Array<{ user: { id: string; name: string; role: string } }>;
  } | null;
};

type DashboardCurrentStep = {
  id: string;
  title: string | null;
  body: string | null;
  targetDate: Date | null;
  assigneeId: string | null;
  assignee: { name: string; role: string } | null;
};

export function dashboardRecordMatchesScope(
  scope: DashboardScope,
  user: AuthenticatedUser,
  record: DashboardScopeRecord,
  currentStep: DashboardCurrentStep | null,
  legacyOwner: string | null | undefined,
  teamNames: Set<string>
) {
  if (scope === "all") return true;
  const collaborators = record.lifecycleContext?.collaborators ?? [];
  if (scope === "mine") {
    return record.assignedToId === user.id ||
      currentStep?.assigneeId === user.id ||
      collaborators.some((collaborator) => collaborator.user.id === user.id) ||
      normalizeDashboardOwner(record.assignedTo?.name ?? legacyOwner) === normalizeDashboardOwner(user.name);
  }
  return record.assignedTo?.role === user.role ||
    currentStep?.assignee?.role === user.role ||
    collaborators.some((collaborator) => collaborator.user.role === user.role) ||
    teamNames.has(normalizeDashboardOwner(record.assignedTo?.name ?? legacyOwner));
}

function workHref(kind: DashboardWorkItem["kind"], entityId: string, updateId?: string) {
  if (kind === "request") {
    return updateId
      ? `/requests/${entityId}?tab=updates&update=${encodeURIComponent(updateId)}`
      : `/requests/${entityId}`;
  }
  const base = kind === "quote"
    ? `/quotes/${encodeURIComponent(entityId)}`
    : kind === "project"
      ? `/projects/${encodeURIComponent(entityId)}`
      : `/billing/${encodeURIComponent(entityId)}`;
  return updateId ? `${base}?tab=updates` : base;
}

function activityHref(entityType: string, entityId: string) {
  if (entityType === "Request") return `/requests/${entityId}`;
  if (entityType === "Client") return `/clients/${entityId}`;
  if (entityType === "Quote") return `/quotes/${encodeURIComponent(entityId)}`;
  if (entityType === "Project") return `/projects/${encodeURIComponent(entityId)}`;
  if (entityType === "Invoice") return `/billing/${encodeURIComponent(entityId)}`;
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

export function earliestDashboardDate(...dates: Array<string | undefined>) {
  return dates.filter((date): date is string => Boolean(date)).sort()[0] ?? "";
}

export function effectiveDashboardDueDate(...dates: Array<Date | null | undefined>) {
  return dateOutput(dates.find((date): date is Date => Boolean(date)));
}

export function selectDownstreamDashboardSteps(
  candidates: Array<{
    kind: DashboardWorkItem["kind"];
    entityId: string;
    stepId?: string | null;
  }>
) {
  const stageRank: Record<DashboardWorkItem["kind"], number> = {
    request: 0,
    quote: 1,
    project: 2,
    invoice: 3
  };
  const selected = new Map<string, { kind: DashboardWorkItem["kind"]; entityId: string }>();
  for (const candidate of candidates) {
    if (!candidate.stepId) continue;
    const current = selected.get(candidate.stepId);
    if (!current || stageRank[candidate.kind] > stageRank[current.kind]) {
      selected.set(candidate.stepId, { kind: candidate.kind, entityId: candidate.entityId });
    }
  }
  return selected;
}

function sortWorkItems(left: DashboardWorkItem, right: DashboardWorkItem) {
  const timing = timingRank[left.timing] - timingRank[right.timing];
  if (timing !== 0) return timing;
  if (left.timing === "none" && right.timing === "none") {
    const attention = Number(right.attentionReasons.length > 0) - Number(left.attentionReasons.length > 0);
    if (attention !== 0) return attention;
  }
  if (left.timingDate && right.timingDate && left.timingDate !== right.timingDate) {
    return left.timingDate.localeCompare(right.timingDate);
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
  const needsOperationalData = requestedWidgets.some((id) => id !== "recent-activity") ||
    (widgetSet.has("recent-activity") && scope !== "all");
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
          select: {
            id: true,
            archivedAt: true,
            requestNumber: true,
            title: true,
            status: true,
            priority: true,
            companyName: true,
            dueDate: true,
            currentStepId: true,
            assignedToId: true,
            assignedTo: { select: { name: true, role: true } },
            client: { select: { displayName: true } },
            lifecycleContext: {
              select: {
                collaborators: {
                  select: { user: { select: { id: true, name: true, role: true } } }
                }
              }
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
            assignedToId: true,
            assignedTo: { select: { name: true, role: true } },
            owner: true,
            total: true,
            dueDate: true,
            currentStepId: true,
            sourceRequestIdSnapshot: true,
            clientName: true,
            client: { select: { displayName: true } },
            requests: {
              where: { archivedAt: null },
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { id: true, currentStepId: true, dueDate: true }
            },
            lifecycleContext: {
              select: {
                collaborators: {
                  select: { user: { select: { id: true, name: true, role: true } } }
                }
              }
            },
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
            assignedToId: true,
            assignedTo: { select: { name: true, role: true } },
            budget: true,
            dueDate: true,
            currentStepId: true,
            quoteId: true,
            lifecycleContext: {
              select: {
                collaborators: {
                  select: { user: { select: { id: true, name: true, role: true } } }
                }
              }
            },
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
            assignedToId: true,
            assignedTo: { select: { name: true, role: true } },
            amount: true,
            dueDate: true,
            currentStepId: true,
            projectId: true,
            lifecycleContext: {
              select: {
                collaborators: {
                  select: { user: { select: { id: true, name: true, role: true } } }
                }
              }
            },
            client: { select: { displayName: true } }
          }
        })
      ])
    : [[], [], [], []] as const;

  const requestsById = new Map(requests.map((request) => [request.id, request]));
  const dashboardRequests = requests.filter((request) => !request.archivedAt);
  const requestStepIds = new Map(requests.map((request) => [request.id, request.currentStepId]));
  const quoteStepIds = new Map(quotes.map((quote) => {
    const sourceRequest = quote.sourceRequestIdSnapshot
      ? requestsById.get(quote.sourceRequestIdSnapshot)
      : undefined;
    return [
      quote.id,
      quote.currentStepId ?? quote.requests[0]?.currentStepId ?? sourceRequest?.currentStepId ?? null
    ];
  }));
  const projectStepIds = new Map(projects.map((project) => [
    project.id,
    project.currentStepId ?? (project.quoteId ? quoteStepIds.get(project.quoteId) : null) ?? null
  ]));
  const invoiceStepIds = new Map(invoices.map((invoice) => [
    invoice.id,
    invoice.currentStepId ?? (invoice.projectId ? projectStepIds.get(invoice.projectId) : null) ?? null
  ]));
  const stepIds = Array.from(new Set([
    ...requestStepIds.values(),
    ...quoteStepIds.values(),
    ...projectStepIds.values(),
    ...invoiceStepIds.values()
  ].filter((id): id is string => Boolean(id))));
  const currentSteps = stepIds.length
    ? await prisma.requestUpdate.findMany({
        where: { id: { in: stepIds }, kind: "step", stepStatus: "open" },
        select: {
          id: true,
          title: true,
          body: true,
          targetDate: true,
          assigneeId: true,
          assignee: { select: { name: true, role: true } }
        }
      })
    : [];
  const currentStepsById = new Map(currentSteps.map((step) => [step.id, step]));
  const stepFor = (stepId?: string | null) => stepId ? currentStepsById.get(stepId) ?? null : null;

  const scopedRequests = canUser(user, "requests:read")
    ? dashboardRequests.filter((request) => dashboardRecordMatchesScope(
        scope, user, request, stepFor(requestStepIds.get(request.id)), null, teamNames
      ))
    : [];
  const scopedQuotes = canUser(user, "quotes:read")
    ? quotes.filter((quote) => dashboardRecordMatchesScope(
        scope, user, quote, stepFor(quoteStepIds.get(quote.id)), quote.owner, teamNames
      ))
    : [];
  const scopedProjects = canUser(user, "projects:read")
    ? projects.filter((project) => dashboardRecordMatchesScope(
        scope, user, project, stepFor(projectStepIds.get(project.id)), null, teamNames
      ))
    : [];
  const scopedInvoices = canUser(user, "billing:read")
    ? invoices.filter((invoice) => dashboardRecordMatchesScope(
        scope, user, invoice, stepFor(invoiceStepIds.get(invoice.id)), null, teamNames
      ))
    : [];

  const visibleStepAssignments = selectDownstreamDashboardSteps([
    ...scopedRequests
      .filter((record) => !terminalRequestStatuses.has(record.status))
      .map((record) => ({ kind: "request" as const, entityId: record.id, stepId: requestStepIds.get(record.id) })),
    ...scopedQuotes
      .filter((record) => !terminalQuoteStatuses.has(record.status))
      .map((record) => ({ kind: "quote" as const, entityId: record.id, stepId: quoteStepIds.get(record.id) })),
    ...scopedProjects
      .filter((record) => !terminalProjectStatuses.has(record.status))
      .map((record) => ({ kind: "project" as const, entityId: record.id, stepId: projectStepIds.get(record.id) })),
    ...scopedInvoices
      .filter((record) => !terminalInvoiceStatuses.has(record.status))
      .map((record) => ({ kind: "invoice" as const, entityId: record.id, stepId: invoiceStepIds.get(record.id) }))
  ]);
  const selectedStepFor = (
    kind: DashboardWorkItem["kind"],
    entityId: string,
    stepId?: string | null
  ) => {
    if (!stepId) return null;
    const assignment = visibleStepAssignments.get(stepId);
    return assignment?.kind === kind && assignment.entityId === entityId
      ? stepFor(stepId)
      : null;
  };

  const workItems: DashboardWorkItem[] = [];
  for (const request of scopedRequests) {
    if (terminalRequestStatuses.has(request.status)) continue;
    const recordDueDate = dateOutput(request.dueDate);
    const currentStep = selectedStepFor(
      "request", request.id, requestStepIds.get(request.id)
    );
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
    const stepTargetDate = dateOutput(currentStep?.targetDate);
    const timingDate = earliestDashboardDate(recordDueDate, stepTargetDate);
    const explicitStep = Boolean(currentStep);
    const stepOwner = currentStep?.assignee?.name || request.assignedTo?.name || "Unassigned";
    workItems.push({
      id: `request:${request.id}`,
      kind: "request",
      entityId: request.id,
      stepId: currentStep?.id,
      reference: request.requestNumber,
      title: stepTitle,
      context: request.client?.displayName || request.companyName || "Request",
      owner: stepOwner,
      status: explicitStep ? "Current step" : "Suggested",
      priority: request.priority,
      recordDueDate: recordDueDate || undefined,
      stepTargetDate: stepTargetDate || undefined,
      timingDate: timingDate || undefined,
      timing: classifyDashboardDate(timingDate, businessDate),
      attentionReasons: requestAttentionReasons({ ...request, currentStep }),
      href: workHref("request", request.id, currentStep?.id),
      canComplete: canComplete && explicitStep,
      suggested: !explicitStep
    });
  }

  for (const quote of scopedQuotes) {
    if (terminalQuoteStatuses.has(quote.status)) continue;
    const sourceRequest = quote.sourceRequestIdSnapshot
      ? requestsById.get(quote.sourceRequestIdSnapshot)
      : undefined;
    const recordDueDate = effectiveDashboardDueDate(
      quote.dueDate, quote.requests[0]?.dueDate, sourceRequest?.dueDate
    );
    const currentStep = selectedStepFor("quote", quote.id, quoteStepIds.get(quote.id));
    const stepTargetDate = dateOutput(currentStep?.targetDate);
    const timingDate = earliestDashboardDate(recordDueDate, stepTargetDate);
    const timing = classifyDashboardDate(timingDate, businessDate);
    const reasons: string[] = [];
    if (isUnassigned(quote.assignedTo?.name ?? quote.owner)) reasons.push("Needs an owner");
    if (quote.status === "Review") reasons.push("Awaiting review");
    if (quote.status === "Approved" && !quote.project) reasons.push("Ready for project handoff");
    if (timing === "later" && !currentStep && !reasons.length) continue;
    if (timing === "none" && !currentStep && !reasons.length) continue;
    workItems.push({
      id: `quote:${quote.id}`,
      kind: "quote",
      entityId: quote.id,
      reference: quote.quoteNumber,
      stepId: currentStep?.id,
      title: currentStep?.title || currentStep?.body || quote.title,
      context: quote.client?.displayName ?? quote.clientName ?? "Quote",
      owner: currentStep?.assignee?.name ?? quote.assignedTo?.name ?? quote.owner,
      status: currentStep ? "Current step" : quote.status,
      recordDueDate: recordDueDate || undefined,
      stepTargetDate: stepTargetDate || undefined,
      timingDate: timingDate || undefined,
      timing,
      attentionReasons: reasons,
      href: workHref("quote", quote.id, currentStep?.id),
      canComplete: canComplete && Boolean(currentStep)
    });
  }

  for (const project of scopedProjects) {
    if (terminalProjectStatuses.has(project.status)) continue;
    const recordDueDate = dateOutput(project.dueDate);
    const currentStep = selectedStepFor("project", project.id, projectStepIds.get(project.id));
    const stepTargetDate = dateOutput(currentStep?.targetDate);
    const timingDate = earliestDashboardDate(recordDueDate, stepTargetDate);
    const timing = classifyDashboardDate(timingDate, businessDate);
    const reasons: string[] = [];
    if (!project.assignedTo) reasons.push("Needs an assigned person");
    if (project.status === "On Hold") reasons.push("Project on hold");
    if (timing === "later" && !currentStep && !reasons.length) continue;
    if (timing === "none" && !currentStep && !reasons.length) continue;
    workItems.push({
      id: `project:${project.id}`,
      kind: "project",
      entityId: project.id,
      reference: project.projectNumber,
      stepId: currentStep?.id,
      title: currentStep?.title || currentStep?.body || project.title,
      context: project.client.displayName,
      owner: currentStep?.assignee?.name ?? project.assignedTo?.name ?? "Unassigned",
      status: currentStep ? "Current step" : project.status,
      recordDueDate: recordDueDate || undefined,
      stepTargetDate: stepTargetDate || undefined,
      timingDate: timingDate || undefined,
      timing,
      attentionReasons: reasons,
      href: workHref("project", project.id, currentStep?.id),
      canComplete: canComplete && Boolean(currentStep)
    });
  }

  for (const invoice of scopedInvoices) {
    if (terminalInvoiceStatuses.has(invoice.status)) continue;
    const recordDueDate = dateOutput(invoice.dueDate);
    const currentStep = selectedStepFor("invoice", invoice.id, invoiceStepIds.get(invoice.id));
    const stepTargetDate = dateOutput(currentStep?.targetDate);
    const timingDate = earliestDashboardDate(recordDueDate, stepTargetDate);
    const timing = classifyDashboardDate(timingDate, businessDate);
    const reasons: string[] = [];
    if (!invoice.assignedTo) reasons.push("Needs an assigned person");
    if (invoice.status === "Overdue" || timing === "overdue") reasons.push("Payment overdue");
    if (timing === "later" && !currentStep && !reasons.length) continue;
    if (timing === "none" && !currentStep && !reasons.length) continue;
    workItems.push({
      id: `invoice:${invoice.id}`,
      kind: "invoice",
      entityId: invoice.id,
      reference: invoice.invoiceNumber,
      stepId: currentStep?.id,
      title: currentStep?.title || currentStep?.body || invoice.title,
      context: invoice.client.displayName,
      owner: currentStep?.assignee?.name ?? invoice.assignedTo?.name ?? "Unassigned",
      status: currentStep ? "Current step" : invoice.status,
      recordDueDate: recordDueDate || undefined,
      stepTargetDate: stepTargetDate || undefined,
      timingDate: timingDate || undefined,
      timing,
      attentionReasons: Array.from(new Set(reasons)),
      href: workHref("invoice", invoice.id, currentStep?.id),
      canComplete: canComplete && Boolean(currentStep)
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
    const context = request.client?.displayName || request.companyName || request.title;
    const dueDate = dateOutput(request.dueDate);
    if (dueDate) addSchedule({
      id: `request-due:${request.id}`,
      kind: "request",
      dateKind: "due-date",
      reference: request.requestNumber,
      title: `${request.title} due`,
      context,
      date: dueDate,
      timing: classifyDashboardDate(dueDate, businessDate),
      href: workHref("request", request.id)
    });
    const currentStep = selectedStepFor("request", request.id, requestStepIds.get(request.id));
    const stepDate = dateOutput(currentStep?.targetDate);
    if (stepDate) addSchedule({
      id: `request-step:${currentStep!.id}`,
      kind: "request",
      dateKind: "current-step",
      stepId: currentStep!.id,
      reference: request.requestNumber,
      title: currentStep?.title || currentStep?.body || `Current step for ${request.title}`,
      context,
      date: stepDate,
      timing: classifyDashboardDate(stepDate, businessDate),
      href: workHref("request", request.id, currentStep?.id)
    });
  }
  for (const quote of scopedQuotes) {
    if (terminalQuoteStatuses.has(quote.status)) continue;
    const context = quote.client?.displayName ?? quote.clientName ?? "Quote";
    const sourceRequest = quote.sourceRequestIdSnapshot
      ? requestsById.get(quote.sourceRequestIdSnapshot)
      : undefined;
    const date = effectiveDashboardDueDate(
      quote.dueDate, quote.requests[0]?.dueDate, sourceRequest?.dueDate
    );
    if (date) addSchedule({
      id: `quote-due:${quote.id}`,
      kind: "quote",
      dateKind: "due-date",
      reference: quote.quoteNumber,
      title: `${quote.title} due`,
      context,
      date,
      timing: classifyDashboardDate(date, businessDate),
      href: workHref("quote", quote.id)
    });
    const currentStep = selectedStepFor("quote", quote.id, quoteStepIds.get(quote.id));
    const stepDate = dateOutput(currentStep?.targetDate);
    if (stepDate) addSchedule({
      id: `quote-step:${currentStep!.id}`,
      kind: "quote",
      dateKind: "current-step",
      stepId: currentStep!.id,
      reference: quote.quoteNumber,
      title: currentStep?.title || currentStep?.body || `Current step for ${quote.title}`,
      context,
      date: stepDate,
      timing: classifyDashboardDate(stepDate, businessDate),
      href: workHref("quote", quote.id, currentStep?.id)
    });
  }
  for (const project of scopedProjects) {
    if (terminalProjectStatuses.has(project.status)) continue;
    const date = dateOutput(project.dueDate);
    if (date) addSchedule({
      id: `project-due:${project.id}`,
      kind: "project",
      dateKind: "due-date",
      reference: project.projectNumber,
      title: `${project.title} due`,
      context: project.client.displayName,
      date,
      timing: classifyDashboardDate(date, businessDate),
      href: workHref("project", project.id)
    });
    const currentStep = selectedStepFor("project", project.id, projectStepIds.get(project.id));
    const stepDate = dateOutput(currentStep?.targetDate);
    if (stepDate) addSchedule({
      id: `project-step:${currentStep!.id}`,
      kind: "project",
      dateKind: "current-step",
      stepId: currentStep!.id,
      reference: project.projectNumber,
      title: currentStep?.title || currentStep?.body || `Current step for ${project.title}`,
      context: project.client.displayName,
      date: stepDate,
      timing: classifyDashboardDate(stepDate, businessDate),
      href: workHref("project", project.id, currentStep?.id)
    });
  }
  for (const invoice of scopedInvoices) {
    if (terminalInvoiceStatuses.has(invoice.status)) continue;
    const date = dateOutput(invoice.dueDate);
    if (date) addSchedule({
      id: `invoice-due:${invoice.id}`,
      kind: "invoice",
      dateKind: "due-date",
      reference: invoice.invoiceNumber,
      title: `${invoice.title} due`,
      context: invoice.client.displayName,
      date,
      timing: classifyDashboardDate(date, businessDate),
      href: workHref("invoice", invoice.id)
    });
    const currentStep = selectedStepFor("invoice", invoice.id, invoiceStepIds.get(invoice.id));
    const stepDate = dateOutput(currentStep?.targetDate);
    if (stepDate) addSchedule({
      id: `invoice-step:${currentStep!.id}`,
      kind: "invoice",
      dateKind: "current-step",
      stepId: currentStep!.id,
      reference: invoice.invoiceNumber,
      title: currentStep?.title || currentStep?.body || `Current step for ${invoice.title}`,
      context: invoice.client.displayName,
      date: stepDate,
      timing: classifyDashboardDate(stepDate, businessDate),
      href: workHref("invoice", invoice.id, currentStep?.id)
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
