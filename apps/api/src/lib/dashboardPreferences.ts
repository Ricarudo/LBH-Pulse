import type { LocalRole } from "@/lib/auth/permissions";
import { dashboardPreferencesSchema } from "@/lib/validations/dashboard";
import {
  dashboardWidgetIds,
  type DashboardPreferencesRecord,
  type DashboardWidgetId,
  type DashboardWidgetPlacement
} from "@/types/dashboard";

const defaultPlacements: DashboardWidgetPlacement[] = [
  { id: "attention-summary", visible: true, width: "full" },
  { id: "work-queue", visible: true, width: "full" },
  { id: "upcoming-dates", visible: true, width: "half" },
  { id: "recent-activity", visible: true, width: "half" },
  { id: "module-health", visible: true, width: "full" }
];

export function defaultDashboardPreferences(role: LocalRole): DashboardPreferencesRecord {
  return {
    version: 1,
    defaultScope: role === "Admin" ? "all" : "mine",
    widgets: defaultPlacements.map((widget) => ({ ...widget }))
  };
}

export function normalizeDashboardPreferences(
  value: unknown,
  role: LocalRole
): DashboardPreferencesRecord {
  const parsed = dashboardPreferencesSchema.safeParse(value);
  if (!parsed.success) return defaultDashboardPreferences(role);

  const known = new Map<DashboardWidgetId, DashboardWidgetPlacement>(
    parsed.data.widgets.map((widget) => [widget.id, widget])
  );
  const widgets = parsed.data.widgets.map((widget) => ({ ...widget }));

  for (const id of dashboardWidgetIds) {
    if (!known.has(id)) {
      widgets.push({
        id,
        visible: false,
        width: defaultPlacements.find((widget) => widget.id === id)?.width ?? "half"
      });
    }
  }

  return {
    version: 1,
    defaultScope: parsed.data.defaultScope,
    widgets
  };
}
