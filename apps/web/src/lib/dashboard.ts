import {
  dashboardWidgetIds,
  type DashboardPreferencesRecord,
  type DashboardWidgetId,
  type DashboardWidgetPlacement
} from "@pulse/contracts/dashboard";

export const dashboardWidgetCatalog: Array<{
  id: DashboardWidgetId;
  title: string;
  description: string;
}> = [
  {
    id: "attention-summary",
    title: "Attention summary",
    description: "Overdue, due soon, and unassigned work."
  },
  {
    id: "work-queue",
    title: "Work to do",
    description: "Your prioritized operational queue."
  },
  {
    id: "upcoming-dates",
    title: "Upcoming dates",
    description: "Deadlines, follow-ups, and scheduled work."
  },
  {
    id: "recent-activity",
    title: "Recent activity",
    description: "The latest changes across Pulse."
  },
  {
    id: "module-health",
    title: "Module health",
    description: "Current totals for core Pulse workflows."
  }
];

const defaultPlacements: DashboardWidgetPlacement[] = [
  { id: "attention-summary", visible: true, width: "full" },
  { id: "work-queue", visible: true, width: "full" },
  { id: "upcoming-dates", visible: true, width: "half" },
  { id: "recent-activity", visible: true, width: "half" },
  { id: "module-health", visible: true, width: "full" }
];

export function defaultDashboardPreferences(isSystemAdmin: boolean): DashboardPreferencesRecord {
  return {
    version: 1,
    defaultScope: isSystemAdmin ? "all" : "mine",
    widgets: defaultPlacements.map((widget) => ({ ...widget }))
  };
}

export function normalizeDashboardPreferences(
  value: DashboardPreferencesRecord,
  isSystemAdmin: boolean
) {
  const seen = new Set<DashboardWidgetId>();
  const widgets = value.widgets
    .filter((widget) => dashboardWidgetIds.includes(widget.id) && !seen.has(widget.id))
    .map((widget) => {
      seen.add(widget.id);
      return { ...widget };
    });

  for (const id of dashboardWidgetIds) {
    if (!seen.has(id)) {
      widgets.push({
        id,
        visible: false,
        width: defaultPlacements.find((widget) => widget.id === id)?.width ?? "half"
      });
    }
  }

  return {
    version: 1 as const,
    defaultScope: value.defaultScope ?? (isSystemAdmin ? "all" : "mine"),
    widgets
  };
}

export function dashboardGreeting(
  name: string,
  timeZone: string,
  now = new Date()
) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23"
    }).format(now)
  );
  const greeting = hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 17
      ? "Good afternoon"
      : "Good evening";
  const firstName = name.trim().split(/\s+/)[0] || name || "there";
  return `${greeting}, ${firstName}`;
}

export function dashboardRecordHref(kind: string, entityId: string) {
  if (kind === "Request") return `/requests/${entityId}`;
  if (kind === "Client") return `/clients/${entityId}`;
  if (kind === "Quote") return `/quotes?record=${encodeURIComponent(entityId)}`;
  if (kind === "Project") return `/projects?record=${encodeURIComponent(entityId)}`;
  if (kind === "Invoice") return `/billing?record=${encodeURIComponent(entityId)}`;
  return undefined;
}
