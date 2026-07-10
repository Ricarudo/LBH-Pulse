import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { recordActivity } from "@/lib/services/activityService";
import type {
  UserPreferencesInput,
  WorkspaceSettingsInput
} from "@pulse/contracts/settings";
import type {
  AccentTheme,
  MotionMode,
  ThemeMode,
  UserPreferencesRecord,
  WorkspaceSettingsRecord
} from "@pulse/contracts/settings";

const defaultWorkspaceSettings = {
  id: "default",
  name: "R2 Communications",
  timeZone: "America/Puerto_Rico",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
  weekStartsOn: 0
} as const;

export async function getUserPreferences(userId: string): Promise<UserPreferencesRecord> {
  const user = await prisma.localUser.findUniqueOrThrow({
    where: { id: userId },
    select: { themeMode: true, accentTheme: true, motionMode: true }
  });

  return {
    themeMode: user.themeMode as ThemeMode,
    accentTheme: user.accentTheme as AccentTheme,
    motionMode: user.motionMode as MotionMode
  };
}

export async function updateUserPreferences(
  userId: string,
  input: UserPreferencesInput
): Promise<UserPreferencesRecord> {
  const user = await prisma.localUser.update({
    where: { id: userId },
    data: input,
    select: { themeMode: true, accentTheme: true, motionMode: true }
  });

  return {
    themeMode: user.themeMode as ThemeMode,
    accentTheme: user.accentTheme as AccentTheme,
    motionMode: user.motionMode as MotionMode
  };
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettingsRecord> {
  const settings = await prisma.workspaceSettings.upsert({
    where: { id: "default" },
    create: defaultWorkspaceSettings,
    update: {}
  });

  return {
    name: settings.name,
    timeZone: settings.timeZone,
    locale: settings.locale as WorkspaceSettingsRecord["locale"],
    dateFormat: settings.dateFormat as WorkspaceSettingsRecord["dateFormat"],
    weekStartsOn: settings.weekStartsOn as 0 | 1,
    updatedAt: settings.updatedAt.toISOString()
  };
}

export async function updateWorkspaceSettings(
  input: WorkspaceSettingsInput,
  actor: AuthenticatedUser
): Promise<WorkspaceSettingsRecord> {
  const settings = await prisma.workspaceSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input
  });

  await recordActivity({
    user: actor,
    relatedEntityType: "WorkspaceSettings",
    relatedEntityId: settings.id,
    type: "Updated",
    title: "Workspace settings updated",
    detail: `${settings.name} regional and identity settings were updated.`
  });

  return {
    name: settings.name,
    timeZone: settings.timeZone,
    locale: settings.locale as WorkspaceSettingsRecord["locale"],
    dateFormat: settings.dateFormat as WorkspaceSettingsRecord["dateFormat"],
    weekStartsOn: settings.weekStartsOn as 0 | 1,
    updatedAt: settings.updatedAt.toISOString()
  };
}
