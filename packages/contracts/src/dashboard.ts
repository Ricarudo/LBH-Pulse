
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
  dueDate?: string;
  timing: DashboardTiming;
  attentionReasons: string[];
  href: string;
  canComplete: boolean;
  suggested?: boolean;
};

export type DashboardScheduleItem = {
  id: string;
  kind: DashboardWorkKind | "follow-up";
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
  "work-queue": { items: DashboardWorkItem[]; total: number };
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
