import { z } from "zod";

export const userPreferencesSchema = z.object({
  themeMode: z.enum(["system", "light", "dark"]),
  accentTheme: z.enum(["blue", "violet", "teal", "orange"]),
  motionMode: z.enum(["luxurious", "subtle"])
});

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required.").max(80),
  timeZone: z.string().trim().min(1).refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Select a valid time zone."),
  locale: z.enum(["en-US", "es-PR"]),
  dateFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
  weekStartsOn: z.union([z.literal(0), z.literal(1)])
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
