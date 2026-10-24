
export const dashboardScopes = ["mine", "team", "all"] as const;
export type DashboardScope = (typeof dashboardScopes)[number];

export const dashboardWidgetIds = [
  "attention-summary",
  "work-queue",
  "upcoming-dates",
  "recent-activity",
  "module-health"
] as const;
export type DashboardWidgetId = (typeof dashboardWidgetIds)[number];
export type DashboardWidgetWidth = "half" | "full";

export type DashboardWidgetPlacement = {
  id: DashboardWidgetId;
  visible: boolean;
  width: DashboardWidgetWidth;
};

export type DashboardPreferencesRecord = {
  version: 1;
  defaultScope: DashboardScope;
  widgets: DashboardWidgetPlacement[];
};

export type DashboardTiming = "overdue" | "today" | "upcoming" | "later" | "none";
export type DashboardWorkKind = "request" | "quote" | "project" | "invoice";
export type DashboardDateKind = "due-date" | "current-step";

export type DashboardWorkItem = {
  id: string;
  kind: DashboardWorkKind;
  entityId: string;
  requestId?: string;
  stepId?: string;
  reference: string;
  title: string;
  context: string;
  owner: string;
  status: string;
  priority?: string;
  recordDueDate?: string;
  stepTargetDate?: string;
  timingDate?: string;
  timing: DashboardTiming;
  attentionReasons: string[];
  href: string;
  canComplete: boolean;
  suggested?: boolean;
};

export type DashboardScheduleItem = {
  id: string;
  kind: DashboardWorkKind;
  dateKind: DashboardDateKind;
  stepId?: string;
  reference: string;
  title: string;
  context: string;
  date: string;
  timing: DashboardTiming;
  href: string;
};

export type DashboardActivityItem = {
  id: string;
  entityType: string;
  type: string;
  title: string;
  detail: string;
  actorName: string;
  createdAt: string;
  href?: string;
};

export type DashboardAttentionSummary = {
  overdue: number;
  dueToday: number;
  dueNextSevenDays: number;
  needsAttention: number;
  unassigned: number;
};

export type DashboardModuleHealthItem = {
  id: "requests" | "quotes" | "projects" | "billing";
  label: string;
  count: number;
  detail: string;
  href: string;
};

export type DashboardWidgetPayloadMap = {
  "attention-summary": DashboardAttentionSummary;
  "work-queue": { items: DashboardWorkItem[]; total: number; options?: { statuses: string[]; owners: string[] } };
  "upcoming-dates": { items: DashboardScheduleItem[]; total: number };
  "recent-activity": { items: DashboardActivityItem[] };
  "module-health": { items: DashboardModuleHealthItem[] };
};

export type DashboardDataResponse = {
  generatedAt: string;
  businessDate: string;
  scope: DashboardScope;
  scopeLabel: string;
  viewer: {
    id: string;
    name: string;
    role: string;
    roleName: string;
  };
  widgets: Partial<DashboardWidgetPayloadMap>;
};

import { z } from "zod";
export const dashboardScopeSchema = z.enum(dashboardScopes);
export const dashboardWidgetIdSchema = z.enum(dashboardWidgetIds);

export const dashboardPreferencesSchema = z.object({
  version: z.literal(1),
  defaultScope: dashboardScopeSchema,
  widgets: z.array(
    z.object({
      id: dashboardWidgetIdSchema,
      visible: z.boolean(),
      width: z.enum(["half", "full"])
    })
  ).max(dashboardWidgetIds.length)
}).superRefine((value, context) => {
  const ids = value.widgets.map((widget) => widget.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["widgets"],
      message: "Dashboard widgets cannot be duplicated."
    });
  }
});

export type DashboardPreferencesInput = z.infer<typeof dashboardPreferencesSchema>;

const dashboardMulti = z.union([z.string(), z.array(z.string()).max(100)]).optional().transform(value => value ? typeof value === "string" ? [value] : value : []);
export const dashboardWorkQuerySchema = z.object({
  q: z.string().trim().max(500).optional(),
  kind: dashboardMulti.pipe(z.array(z.enum(["request", "quote", "project", "invoice"]))),
  status: dashboardMulti.pipe(z.array(z.string().max(100))),
  owner: dashboardMulti.pipe(z.array(z.string().max(160))),
  attention: dashboardMulti.pipe(z.array(z.enum(["overdue", "today", "upcoming", "attention", "unassigned"]))),
  sort: z.enum(["priority", "reference", "date"]).default("priority"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  dateField: z.enum(["timingDate", "recordDueDate", "stepTargetDate"]).optional(),
  dateFrom: z.iso.date().optional(), dateTo: z.iso.date().optional(),
  dateMode: z.literal("missing").optional()
}).refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, { message: "Invalid date range" });
export type DashboardWorkQuery = z.infer<typeof dashboardWorkQuerySchema>;

/** Run against the complete authorized scope, before the Home widget cap. */
export function filterDashboardWork(items: DashboardWorkItem[], input: DashboardWorkQuery) {
  return items.filter(item =>
    (!input.q || [item.reference, item.title, item.context, item.owner, item.status].join(" ").toLowerCase().includes(input.q.toLowerCase())) &&
    (!input.kind.length || input.kind.includes(item.kind)) &&
    (!input.status.length || input.status.includes(item.status)) &&
    (!input.owner.length || input.owner.includes(item.owner || "Unassigned")) &&
    (!input.attention.length || input.attention.some(filter => filter === "attention" ? item.attentionReasons.length > 0 : filter === "unassigned" ? !item.owner || item.owner === "Unassigned" : item.timing === filter)) &&
    (!input.dateField || (!input.dateFrom && !input.dateTo && !input.dateMode) || (() => {
      const date = item[input.dateField!];
      return input.dateMode === "missing" ? !date : Boolean(date && (!input.dateFrom || date >= input.dateFrom) && (!input.dateTo || date <= input.dateTo));
    })())
  ).map((item, index) => ({ item, index })).sort((a, b) => {
    const left = input.sort === "date" ? a.item.timingDate : a.item.reference;
    const right = input.sort === "date" ? b.item.timingDate : b.item.reference;
    if (input.sort !== "priority" && Boolean(left) !== Boolean(right)) return left ? -1 : 1;
    const result = input.sort === "priority" ? a.index - b.index : (left ?? "").localeCompare(right ?? "", undefined, { numeric: true });
    return (input.dir === "asc" ? result : -result) || a.item.id.localeCompare(b.item.id);
  }).map(({ item }) => item);
}
