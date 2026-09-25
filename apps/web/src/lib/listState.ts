/** Shared list behavior. Domain definitions supply values; this module owns no API calls. */
export type ListOption = { value: string; label: string; statuses?: readonly string[] };
export type ListFilters = Record<string, string[]>;
export type DatePreset = "any" | "today" | "last7" | "next7" | "custom" | "missing" | "30" | "90" | "12m" | "ytd" | "all";
export type ListState = {
  view: string; q: string; sort: string; direction: "asc" | "desc";
  filters: ListFilters;
  dateField: string; datePreset: DatePreset; from: string; to: string;
};
export type FilterDefinition<T = unknown> = {
  key: string; label: string; options: ListOption[];
  values?: (row: T) => string | string[] | null | undefined;
  single?: boolean;
};
export type ListDefinition<T> = {
  id: string; label: string; prefix?: string;
  defaultView: string; defaultSort: string; defaultDirection?: "asc" | "desc";
  views?: { key: string; label: string; matches: (row: T, userId: string) => boolean; statuses?: readonly string[] }[];
  filters: FilterDefinition<T>[];
  datePresets?: DatePreset[]; defaultDatePreset?: DatePreset; requireDateBounds?: boolean;
  dates?: { key: string; label: string; value: (row: T) => string | null | undefined }[];
  sorts: { key: string; label: string; value: (row: T) => string | number | null | undefined; direction?: "asc" | "desc"; date?: boolean; numeric?: boolean; orderLabels?: { asc: string; desc: string } }[];
  search: (row: T) => string;
  rowId: (row: T) => string;
};
export function listDefaults<T>(definition: ListDefinition<T>): ListState {
  return { view: definition.defaultView, q: "", sort: definition.defaultSort,
    direction: definition.defaultDirection ?? "desc", filters: {},
    dateField: definition.dates?.[0]?.key ?? "", datePreset: definition.defaultDatePreset ?? "any", from: "", to: "" };
}
export function options(values: readonly string[]): ListOption[] {
  return Array.from(new Set(values.filter(Boolean))).map(value => ({ value, label: value }));
}
// Reuse ICU objects: constructing them inside O(n log n) sort comparisons is expensive.
const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export function uniqueOptions(values: ListOption[]): ListOption[] {
  return Array.from(new Map(values.filter(v => v.value).map(v => [v.value, v])).values())
    .sort((a, b) => textCollator.compare(a.label, b.label));
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function businessDate(value: string | Date, timeZone: string): string {
  if (typeof value === "string" && validDate(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
function offsetDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function dateRange(state: Pick<ListState, "datePreset" | "from" | "to">, today: string) {
  if (state.datePreset === "today") return { from: today, to: today };
  if (state.datePreset === "last7") return { from: offsetDate(today, -6), to: today };
  if (state.datePreset === "next7") return { from: today, to: offsetDate(today, 6) };
  if (["30", "90", "12m"].includes(state.datePreset)) return { from: offsetDate(today, state.datePreset === "30" ? -29 : state.datePreset === "90" ? -89 : -364), to: today };
  if (state.datePreset === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (state.datePreset === "all") return { from: "1970-01-01", to: today };
  return { from: state.from, to: state.to };
}
export function dateError(state: ListState) {
  if (state.datePreset !== "custom") return "";
  if ((state.from && !validDate(state.from)) || (state.to && !validDate(state.to))) return "Enter valid dates.";
  if (state.from && state.to && state.from > state.to) return "Start date must be on or before end date.";
  return "";
}
export function matchesDate(value: string | null | undefined, state: ListState, timeZone: string, today: string): boolean {
  if (state.datePreset === "any") return true;
  const date = value ? businessDate(value, timeZone) : "";
  if (state.datePreset === "missing") return !date;
  if (!date || dateError(state)) return false;
  const range = dateRange(state, today);
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
export function filterCount(state: ListState) {
  return Object.values(state.filters).filter(values => values.length).length + (state.datePreset !== "any" ? 1 : 0);
}
export function widenStatusView<T>(state: ListState, definition: ListDefinition<T>): ListState {
  const selected = [
    ...(state.filters.status ?? []),
    ...definition.filters.flatMap(filter => filter.options
      .filter(option => state.filters[filter.key]?.includes(option.value))
      .flatMap(option => option.statuses ?? []))
  ];
  const view = definition.views?.find(view => view.key === state.view);
  // An explicit status selection must not be silently hidden by a saved status view.
  return selected.length && view?.statuses && selected.some(status => !view.statuses!.includes(status))
    ? { ...state, view: "all" } : state;
}
export function parseListState<T>(params: URLSearchParams, definition: ListDefinition<T>, remembered?: Partial<ListState>): ListState {
  const defaults = listDefaults(definition);
  const key = (name: string) => `${definition.prefix ?? ""}${name}`;
  const state = { ...defaults };
  const view = params.get(key("view")) ?? remembered?.view ?? defaults.view;
  state.view = definition.views?.some(v => v.key === view) ? view : defaults.view;
  const sort = params.get(key("sort")) ?? remembered?.sort ?? defaults.sort;
  state.sort = definition.sorts.some(s => s.key === sort) ? sort : defaults.sort;
  const direction = params.get(key("dir")) ?? (params.has(key("sort")) ? undefined : remembered?.direction) ?? definition.sorts.find(s => s.key === state.sort)?.direction ?? defaults.direction;
  state.direction = direction === "asc" || direction === "desc" ? direction : defaults.direction;
  state.q = (params.get(key("q")) ?? "").slice(0, 500);
  state.filters = {};
  for (const field of definition.filters) {
    const values = params.getAll(key(field.key)).map(value => field.key === "owner" && value === "Unassigned" && field.options.some(option => option.value === "__unassigned") ? "__unassigned" : value).filter(value => value && value !== "All");
    const allowed = new Set(field.options.map(option => option.value));
    state.filters[field.key] = Array.from(new Set(values.filter(value => allowed.size === 0 ? value.length <= 200 : allowed.has(value)))).slice(0, field.single ? 1 : 100);
  }
  const dateField = params.get(key("dateField"));
  state.dateField = definition.dates?.some(d => d.key === dateField) ? dateField! : defaults.dateField;
  const preset = params.get(key("datePreset")) ?? (params.has(key("from")) ? "custom" : defaults.datePreset);
  state.datePreset = state.dateField && (definition.datePresets ?? ["any", "today", "last7", "next7", "custom", "missing"]).includes(preset as DatePreset) ? preset as DatePreset : defaults.datePreset;
  for (const field of ["from", "to"] as const) {
    const value = params.get(key(field)) ?? ""; state[field] = validDate(value) ? value : "";
  }
  return widenStatusView(state, definition);
}
export function serializeListState<T>(params: URLSearchParams, state: ListState, definition: ListDefinition<T>) {
  const next = new URLSearchParams(params);
  const key = (name: string) => `${definition.prefix ?? ""}${name}`;
  for (const name of ["view", "q", "sort", "dir", "dateField", "datePreset", "from", "to", ...definition.filters.map(f => f.key)]) next.delete(key(name));
  // Explicit effective view/sort make shared URLs independent of the recipient's preferences.
  next.set(key("view"), state.view); next.set(key("sort"), state.sort); next.set(key("dir"), state.direction);
  if (state.q) next.set(key("q"), state.q);
  for (const [name, values] of Object.entries(state.filters)) for (const value of values) next.append(key(name), value);
  if (state.datePreset !== "any") {
    next.set(key("dateField"), state.dateField); next.set(key("datePreset"), state.datePreset);
    if (state.datePreset === "custom") {
      if (state.from) next.set(key("from"), state.from);
      if (state.to) next.set(key("to"), state.to);
    }
  }
  return next;
}
export function applyList<T>(rows: T[], definition: ListDefinition<T>, state: ListState, userId: string, timeZone: string, now = new Date()) {
  const query = state.q.trim().toLowerCase();
  const today = businessDate(now, timeZone);
  const view = definition.views?.find(v => v.key === state.view);
  const date = definition.dates?.find(d => d.key === state.dateField);
  const sort = definition.sorts.find(s => s.key === state.sort);
  return rows.filter(row => (!view || view.matches(row, userId)) && (!query || definition.search(row).toLowerCase().includes(query)) &&
    definition.filters.every(field => {
      const selected = state.filters[field.key] ?? [];
      if (!selected.length || !field.values) return true;
      const raw = field.values(row); const values = Array.isArray(raw) ? raw : [raw || "__unassigned"];
      return selected.some(value => value === "__me" ? Boolean(userId) && values.includes(userId) : values.includes(value));
    }) && (!date || matchesDate(date.value(row), state, timeZone, today)))
    .sort((a, b) => {
      const left = sort?.value(a); const right = sort?.value(b);
      const absent = (value: typeof left) => value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));
      if (absent(left) !== absent(right)) return absent(left) ? 1 : -1;
      let difference = 0;
      if (!absent(left) && !absent(right)) difference = typeof left === "number" && typeof right === "number" ? left - right : textCollator.compare(String(left), String(right));
      return (state.direction === "asc" ? difference : -difference) || textCollator.compare(definition.rowId(a), definition.rowId(b));
    });
}

/** Both field and direction are one selection and one URL update. */
export function listSortChoices<T>(definition: Pick<ListDefinition<T>, "sorts">) {
  return definition.sorts.map(sort => ({ key: sort.key, label: sort.label, choices: ([sort.direction ?? "asc", sort.direction === "desc" ? "asc" : "desc"] as const).map(direction => {
    const order = sort.orderLabels?.[direction] ?? (sort.date ? direction === "asc" ? "Earliest first" : "Latest first" : sort.numeric ? direction === "asc" ? "Lowest first" : "Highest first" : direction === "asc" ? "A–Z" : "Z–A");
    return { value: `${sort.key}:${direction}`, sort: sort.key, direction, label: `${sort.label} · ${order}` };
  }) }));
}
