export type ThemeMode = "system" | "light" | "dark";
export type AccentTheme = "blue" | "violet" | "teal" | "orange";
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export type UserPreferencesRecord = {
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
};

export type WorkspaceSettingsRecord = {
  name: string;
  timeZone: string;
  locale: "en-US" | "es-PR";
  dateFormat: DateFormat;
  weekStartsOn: 0 | 1;
  updatedAt: string;
};
