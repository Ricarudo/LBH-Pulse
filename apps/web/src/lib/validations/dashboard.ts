import { z } from "zod";
import {
  dashboardScopes,
  dashboardWidgetIds
} from "@/types/dashboard";

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
