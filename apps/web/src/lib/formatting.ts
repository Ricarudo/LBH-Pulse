import type { WorkspaceSettingsRecord } from "@pulse/contracts/settings";

let settings: WorkspaceSettingsRecord = {
  name: "R2 Communications",
  timeZone: "America/Puerto_Rico",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
  weekStartsOn: 0,
  updatedAt: ""
};

export function setWorkspaceFormatting(next: WorkspaceSettingsRecord) {
  settings = next;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatWorkspaceDate(value?: string | Date | null, includeTime = false) {
  if (!value) return "";
  const source = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00.000Z`)
      : new Date(value);
  if (Number.isNaN(source.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).formatToParts(source);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const date = settings.dateFormat === "DD/MM/YYYY"
    ? `${part("day")}/${part("month")}/${part("year")}`
    : settings.dateFormat === "YYYY-MM-DD"
      ? `${part("year")}-${part("month")}-${part("day")}`
      : `${part("month")}/${part("day")}/${part("year")}`;
  if (!includeTime) return date;
  const dayPeriod = part("dayPeriod");
  return `${date} ${part("hour")}:${part("minute")}${dayPeriod ? ` ${dayPeriod}` : ""}`;
}
