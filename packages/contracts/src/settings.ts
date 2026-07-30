export type ThemeMode = "system" | "light" | "dark";
export type AccentTheme = "blue" | "violet" | "teal" | "orange";
export type MotionMode = "luxurious" | "subtle";
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
export const recordNumberKinds = ["request", "quote", "project"] as const;
export type RecordNumberKind = (typeof recordNumberKinds)[number];

export type UserPreferencesRecord = {
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  motionMode: MotionMode;
};

export type WorkspaceSettingsRecord = {
  name: string;
  timeZone: string;
  locale: "en-US" | "es-PR";
  dateFormat: DateFormat;
  weekStartsOn: 0 | 1;
  updatedAt: string;
};

export type RecordNumberSequenceRecord = {
  kind: RecordNumberKind;
  prefix: "RM" | "QM" | "PM";
  year: number;
  currentNumber: string;
  nextNumber: string | null;
  exhausted: boolean;
  updatedAt: string | null;
};

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

export const recordNumberKindSchema = z.enum(recordNumberKinds);

export const recordNumberSequenceUpdateSchema = z.object({
  currentNumber: z.string().trim().regex(
    /^(RM|QM|PM)\d{6}$/i,
    "Enter a record number with a two-letter prefix, two-digit year, and four-digit sequence."
  ),
  expectedUpdatedAt: z.iso.datetime().nullable()
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
export type RecordNumberSequenceUpdateInput = z.infer<
  typeof recordNumberSequenceUpdateSchema
>;
