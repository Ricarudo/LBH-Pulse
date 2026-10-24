"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowDownWideNarrow, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { ListPopup } from "./ListPopup";
import { dateError, filterCount, listSortChoices, type FilterDefinition, type ListState, type DatePreset, widenStatusView } from "@/lib/listState";
import type { DashboardListController } from "@/lib/useDashboardList";
import styles from "./ListControls.module.css";

export function ListFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`dashboard-list ${className}`}>{children}</div>;
}
type FilterField = Pick<FilterDefinition, "key" | "label" | "options" | "single">;
const presetLabels: Record<DatePreset, string> = { any: "Any time", today: "Today", last7: "Last 7 days", next7: "Next 7 days", custom: "Custom range", missing: "No date", "30": "Last 30 days", "90": "Last 90 days", "12m": "Last 12 months", ytd: "Year to date", all: "All recorded history" };

function FilterSection({ label, summary, expanded, onToggle, children }: { label: string; summary: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return <section className={styles.section}>
    <h3><button type="button" className={styles.sectionToggle} aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
      <span><strong>{label}</strong><small>{summary}</small></span><ChevronDown size={17} aria-hidden="true" />
    </button></h3>
    <div id={id} hidden={!expanded} className={styles.sectionContent}>{expanded ? children : null}</div>
  </section>;
}
function selectionSummary(field: FilterField, selected: string[]) {
  if (!selected.length) return "Any";
  const labels = selected.map(value => field.options.find(option => option.value === value)?.label ?? value);
  return labels.slice(0, 2).join(", ") + (labels.length > 2 ? ` +${labels.length - 2} more` : "");
}
function FilterChoices({ field, selected, onChange }: { field: FilterField; selected: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState("");
  const name = useId();
  const matches = field.options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <fieldset className={styles.field}>
    <legend className="sr-only">{field.label}</legend>
    {field.options.length > 8 ? <input type="search" aria-label={`Search ${field.label.toLowerCase()} options`} placeholder={`Find ${field.label.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} /> : null}
    <div className={styles.options}>
      {field.single ? <label className={styles.choice}><input type="radio" name={name} checked={!selected.length} onChange={() => onChange([])} /><span>Any</span></label> : null}
      {matches.map(option => <label key={option.value} className={styles.choice}>
        <input type={field.single ? "radio" : "checkbox"} name={field.single ? name : undefined} checked={selected.includes(option.value)} onChange={event => onChange(event.target.checked ? field.single ? [option.value] : [...selected, option.value] : selected.filter(value => value !== option.value))} />
        <span>{option.label}</span>
      </label>)}
      {!matches.length ? <p className={styles.noOptions}>No matching options.</p> : null}
    </div>
  </fieldset>;
}
export function ListFilterButton({ state, fields, dates = [], defaults, onApply, getApplyState = value => value, label = "list", datePresets = ["any", "today", "last7", "next7", "custom", "missing"], requireDateBounds = false }: {
  datePresets?: DatePreset[]; requireDateBounds?: boolean;
  state: ListState; fields: Pick<FilterDefinition, "key" | "label" | "options" | "single">[]; dates?: { key: string; label: string }[];
  defaults: ListState; onApply: (state: ListState) => void; getApplyState?: (state: ListState) => ListState; label?: string;
}) {
  const [draft, setDraft] = useState<ListState | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const errorId = useId(); const count = filterCount(state);
  const [expanded, setExpanded] = useState<string | null>(null);
  const opened = draft !== null;
  const toggle = (key: string) => setExpanded(current => current === key ? null : key);
  const error = draft ? dateError(draft) || (requireDateBounds && draft.datePreset === "custom" && (!draft.from || !draft.to) ? "This report requires both date boundaries." : "") : "";
  const applied = draft ? getApplyState(draft) : null;
  return <>
    <button ref={trigger} type="button" className={`${styles.filterButton} ${count ? styles.active : ""}`} title={count ? `Filters (${count} active)` : "Filters"} aria-label={`Filter ${label}${count ? `, ${count} active filters` : ""}`} aria-haspopup="dialog" aria-expanded={opened} onClick={() => { setDraft(structuredClone(state)); setExpanded(fields.find(field => field.key === "status")?.key ?? fields[0]?.key ?? "__date"); }}>
      <SlidersHorizontal size={19} aria-hidden="true" />{count ? <span className={styles.badge} aria-hidden="true">{count}</span> : null}
    </button>
    {draft ? <ListPopup title={`Filter ${label}`} trigger={trigger} kind="filter" onDismiss={() => setDraft(null)} applyDisabled={Boolean(error)} onApply={() => { onApply(applied!); setDraft(null); }}>
          {fields.map(field => <FilterSection key={field.key} label={field.label} summary={selectionSummary(field, draft.filters[field.key] ?? [])} expanded={expanded === field.key} onToggle={() => toggle(field.key)}>
            <FilterChoices field={field} selected={draft.filters[field.key] ?? []} onChange={values => setDraft({ ...draft, filters: { ...draft.filters, [field.key]: values } })} />
          </FilterSection>)}
          {dates.length ? <FilterSection label="Date" summary={draft.datePreset === "any" ? "Any time" : `${dates.find(date => date.key === draft.dateField)?.label ?? "Date"} · ${presetLabels[draft.datePreset]}${draft.datePreset === "custom" ? ` · ${draft.from || "Any start"} – ${draft.to || "Any end"}` : ""}`} expanded={expanded === "__date"} onToggle={() => toggle("__date")}><fieldset className={styles.field}><legend className="sr-only">Date</legend>
            <label>Date field<select aria-label="Date field" value={draft.dateField} onChange={event => setDraft({ ...draft, dateField: event.target.value })}>{dates.map(date => <option key={date.key} value={date.key}>{date.label}</option>)}</select></label>
            <label>Range<select aria-label="Range" value={draft.datePreset} onChange={event => setDraft({ ...draft, datePreset: event.target.value as ListState["datePreset"] })}>
              {datePresets.map(preset => <option key={preset} value={preset}>{presetLabels[preset]}</option>)}
            </select></label>
            {draft.datePreset === "custom" ? <div className={styles.dates}>
              <label>From<input type="date" value={draft.from} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
              <label>Through<input type="date" value={draft.to} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
            </div> : null}
            {error ? <p id={errorId} role="alert" className={styles.error}>{error}</p> : null}
          </fieldset></FilterSection> : null}
          {error && expanded !== "__date" ? <p role="alert" className={styles.error}>{error}</p> : null}
          {applied?.view !== draft.view ? <p className={styles.notice}>Applying these statuses will switch the view to All so matching records can appear.</p> : null}
          <div className={styles.reset}><button type="button" onClick={() => setDraft({ ...draft, filters: {}, datePreset: defaults.datePreset, from: "", to: "" })}>Clear filters</button><button type="button" onClick={() => setDraft(structuredClone(defaults))}>Reset view</button></div>
          {draft.view === defaults.view && draft.q === "" && state.q !== "" ? <p className={styles.notice}>Apply will also clear the search.</p> : null}
    </ListPopup> : null}
  </>;
}
export function ListToolbar<T>({ list, count, placeholder, children }: { list: DashboardListController<T>; count?: number | string; placeholder?: string; children?: ReactNode }) {
  const { definition, state } = list;
  return <div className={styles.toolbar}>
    <label className={styles.search}><Search size={18} aria-hidden="true" /><input type="search" aria-label={`Search ${definition.label}`} placeholder={placeholder ?? `Search ${definition.label}…`} value={state.q} onChange={event => list.setSearch(event.target.value)} /></label>
    <ListFilterButton state={state} fields={definition.filters} dates={definition.dates} defaults={list.defaults} datePresets={definition.datePresets} requireDateBounds={definition.requireDateBounds} onApply={list.commit} getApplyState={draft => widenStatusView(draft, definition)} label={definition.label} />
    <ListSortControl definition={definition} sort={state.sort} direction={state.direction} onChange={list.setSort} />
    {count !== undefined ? <span className={styles.count} role="status">{typeof count === "number" ? `${count} results` : count}</span> : null}{children}
  </div>;
}
export function ListFeedback({ loading, error, empty, filtered = false, onRetry, onReset }: { loading?: boolean; error?: string; empty?: boolean; filtered?: boolean; onRetry?: () => void; onReset?: () => void }) {
  if (!loading && !error && !empty) return null;
  return <div className={styles.feedback} role={error ? "alert" : "status"}>
    <p>{loading ? "Loading records…" : error || (filtered ? "No records match this selection." : "No records yet.")}</p>
    {error && onRetry ? <button type="button" onClick={onRetry}>Retry</button> : empty && filtered && onReset ? <button type="button" onClick={onReset}>Reset view</button> : null}
  </div>;
}

/** Screens retain their columns and record actions; the shared shell owns overflow and geometry. */
export function ListTable({ children, className = "", report = false }: { children: ReactNode; className?: string; report?: boolean }) {
  return <div className={`list-table-overflow${report ? " list-report" : ""}`}><table className={`list-table ${className}`}>{children}</table></div>;
}
export function ListViews<T>({ list }: { list: DashboardListController<T> }) {
  return <nav className={styles.views} aria-label={`${list.definition.label} views`}>
    {list.definition.views?.map(view => <button key={view.key} type="button" aria-pressed={list.state.view === view.key} onClick={() => list.setView(view.key)}>{view.label}</button>)}
  </nav>;
}

export function ListSortControl<T>({ definition, sort, direction, onChange }: {
  definition: Pick<import("@/lib/listState").ListDefinition<T>, "label" | "sorts"> & Partial<Pick<import("@/lib/listState").ListDefinition<T>, "defaultSort" | "defaultDirection">>;
  sort: string; direction: "asc" | "desc"; onChange: (sort: string, direction: "asc" | "desc") => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<{ sort: string; direction: "asc" | "desc" } | null>(null);
  const fieldName = useId(); const directionName = useId();
  const groups = listSortChoices(definition);
  const selected = groups.flatMap(group => group.choices).find(choice => choice.value === `${sort}:${direction}`);
  const draftGroup = groups.find(group => group.key === draft?.sort);
  const draftChoice = draftGroup?.choices.find(choice => choice.direction === draft?.direction);
  function reset() {
    const defaultSort = definition.defaultSort ?? definition.sorts[0]?.key;
    const field = definition.sorts.find(field => field.key === defaultSort);
    if (field) setDraft({ sort: field.key, direction: definition.defaultDirection ?? field.direction ?? "asc" });
  }
  return <>
    <button ref={trigger} className={styles.sort} type="button" title={selected?.label} aria-label={`Sort ${definition.label}`} aria-haspopup="dialog" aria-expanded={Boolean(draft)} onClick={() => setDraft({ sort, direction })}>
      <ArrowDownWideNarrow size={17} aria-hidden="true" /><span>Sort</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {draft ? <ListPopup title={`Sort ${definition.label}`} trigger={trigger} kind="sort" initialFocus="selection" onDismiss={() => setDraft(null)} onApply={() => { onChange(draft.sort, draft.direction); setDraft(null); }}
      summary={<><fieldset className={`${styles.field} ${styles.directionChoices}`}><legend>Direction</legend>
        {draftGroup?.choices.map(choice => <label className={styles.choice} key={choice.direction}><input type="radio" name={directionName} checked={draft.direction === choice.direction} onChange={() => setDraft({ ...draft, direction: choice.direction })} /><span>{choice.label.slice(draftGroup.label.length + 3)}</span></label>)}
      </fieldset><p className={styles.sortSummary}>{draftChoice?.label}</p></>}>
      <fieldset className={styles.field}><legend>Sort by</legend>
        {definition.sorts.map(field => <label className={styles.choice} key={field.key}>
          <input data-initial-focus type="radio" name={fieldName} checked={draft.sort === field.key} onChange={() => setDraft({ sort: field.key, direction: field.direction ?? "asc" })} /><span>{field.label}</span>
        </label>)}
      </fieldset>
      <button type="button" className={styles.resetSort} onClick={reset}>Reset sorting</button>
    </ListPopup> : null}
  </>;
}
