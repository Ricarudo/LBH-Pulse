"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Search, Trash2, Layers3, SlidersHorizontal } from "lucide-react";
import type { ItemRecord } from "@pulse/contracts/items";
import type { BuilderLine, BuilderMode, BuilderWorkspace, CalculationConfiguration, CalculationResult, Metric } from "@pulse/contracts/quote-builder";
import { searchItems } from "@/lib/api/items";
import { applyBuilderBulk, builderPresentation, bulkFields, createBuilderLine, modeLabels, type BulkField } from "@/lib/quoteBuilder";
import { BuilderRow, ItemThumbnail } from "./BuilderRow";
import { DecimalField, money, numberText } from "./BuilderFields";

type Props = { unavailableItemIds?: string[]; state: BuilderWorkspace; configuration: CalculationConfiguration; result: CalculationResult; canEdit: boolean; onChange: (state: BuilderWorkspace) => void; expanded: Set<string>; setExpanded: (ids: Set<string>) => void };
export function BuilderEditor({ state, configuration, result, canEdit, onChange, expanded, setExpanded, unavailableItemIds = [] }: Props) {
  const [selected, setSelected] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string | null>());
  const [picker, setPicker] = useState(false); const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemRecord[]>([]); const [searchError, setSearchError] = useState(""); const [searching, setSearching] = useState(false);
  const [addGroup, setAddGroup] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false); const [bulkField, setBulkField] = useState<BulkField>("material.margin"); const [bulkValue, setBulkValue] = useState<Metric>(null); const [bulkScope, setBulkScope] = useState<"selected" | "all">("selected"); const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController(); setSearching(true); setSearchError("");
    const timer = window.setTimeout(() => {
      void searchItems({ q: query }, { signal: controller.signal, cache: "no-store" }).then(data => setItems(data.items)).catch(error => { if (!controller.signal.aborted) setSearchError(error.message); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 160);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, picker]);
  function patchLine(id: string, patch: Partial<BuilderLine>) { onChange({ ...state, lines: state.lines.map(line => line.id === id ? { ...line, ...patch } : line) }); }
  function addLine(item?: ItemRecord) {
    const line = createBuilderLine(crypto.randomUUID(), configuration, Math.max(-1, ...state.lines.map(row => row.order)) + 1, item, addGroup);
    onChange({ ...state, lines: [...state.lines, line] }); setPicker(false);
    if (!item) setExpanded(new Set([...expanded, line.id]));
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-builder-line="${line.id}"] [data-quantity] input`)?.focus());
  }
  function moveLine(id: string, direction: number) {
    const line = state.lines.find(line => line.id === id)!;
    const rows = state.lines.filter(row => row.groupId === line.groupId).sort((a, b) => a.order - b.order);
    const index = rows.findIndex(row => row.id === id); const target = rows[index + direction];
    if (!target) return;
    [rows[index], rows[index + direction]] = [rows[index + direction], rows[index]];
    const order = new Map(rows.map((row, i) => [row.id, i]));
    onChange({ ...state, lines: state.lines.map(row => order.has(row.id) ? { ...row, order: order.get(row.id)! } : row) });
  }
  function moveGroup(id: string, direction: number) {
    const groups = state.groups.slice().sort((a, b) => a.order - b.order); const index = groups.findIndex(group => group.id === id);
    if (!groups[index + direction]) return;
    [groups[index], groups[index + direction]] = [groups[index + direction], groups[index]];
    onChange({ ...state, groups: groups.map((group, order) => ({ ...group, order })) });
  }
  const targetIds = bulkScope === "all" ? null : selected;
  const preview = applyBuilderBulk(state, targetIds, bulkField, bulkValue);
  const groups = builderPresentation(state, result);
  return <div className="qb-editor">
    <div className="qb-toolbar">
      <div className="qb-toolbar-title"><Layers3 size={19} /><div><strong>Estimate / BOM</strong><small>{state.lines.length} lines · PULSE</small></div></div>
      <div className="qb-creation-actions">
      <button type="button" className="primary-button compact" disabled={!canEdit} onClick={() => setPicker(!picker)}><Search size={16} /> Add Item</button>
      <button type="button" className="toolbar-button compact" disabled={!canEdit} onClick={() => addLine()}><Plus size={16} /> Custom Line</button>
      <button type="button" className="toolbar-button compact" disabled={!canEdit} onClick={() => onChange({ ...state, groups: [...state.groups, { id: crypto.randomUUID(), title: "New group", accent: null, order: state.groups.length }] })}><Plus size={16} /> Group</button>
      <button type="button" className="toolbar-button compact" disabled={!canEdit || !state.lines.length} onClick={() => setBulkOpen(!bulkOpen)}><SlidersHorizontal size={15} /> Bulk Edit{selected.size ? ` (${selected.size})` : ""}</button>
      <label className="qb-field"><span className="sr-only">Add new lines to group</span><select disabled={!canEdit} value={addGroup ?? ""} onChange={event => setAddGroup(event.target.value || null)}><option value="">Add to Ungrouped</option>{state.groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label>
      </div>
    </div>
    {notice ? <p role="status" className="qb-notice">{notice}</p> : null}
    {picker ? <section className="qb-picker" aria-label="Add an Item"><label className="qb-field"><span>Search active Items</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, SKU, or part number…" /></label>
      {searching ? <p role="status">Searching…</p> : searchError ? <p role="alert">{searchError}</p> : <ul>{items.map(item => <li key={item.id}><ItemThumbnail src={item.primaryImageUrl} /><div><strong>{item.name}</strong><small>{[item.manufacturer || item.brand, item.partNumber || item.sku, item.itemType].filter(Boolean).join(" · ")}</small><small>{money(String(item.cost))} cost / {item.unitOfMeasure || "each"}{item.relations?.length ? " · Related items available in catalog; added individually" : ""}</small></div><button className="toolbar-button compact" type="button" disabled={!canEdit || item.status !== "ACTIVE"} onClick={() => addLine(item)}>Add</button></li>)}{!items.length ? <li>No matching Items.</li> : null}</ul>}
      <button className="toolbar-button compact" type="button" onClick={() => setPicker(false)}>Close search</button>
    </section> : null}
    {bulkOpen ? <section className="qb-bulk" aria-label="Bulk edit"><div className="qb-fields">
      <label className="qb-field"><span>Apply to</span><select value={bulkScope} onChange={event => setBulkScope(event.target.value as "all" | "selected")}><option value="selected">Selected rows</option><option value="all">All applicable lines</option></select></label>
      <label className="qb-field"><span>Overwrite field</span><select value={bulkField} onChange={event => { setBulkField(event.target.value as BulkField); setBulkValue(null); }}>{Object.entries(bulkFields).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {bulkField === "labor.laborClassId" ? <label className="qb-field"><span>Labor class</span><select value={bulkValue ?? ""} onChange={event => setBulkValue(event.target.value || null)}><option value="">Choose class</option>{configuration.laborClasses.filter(role => role.enabled).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label> : <DecimalField label="New value" value={bulkValue} onChange={setBulkValue} percentage={["material.margin", "material.freight", "material.contingency"].includes(bulkField)} />}
    </div><p>{preview.affected} applicable rows · {preview.skipped} skipped. This explicitly replaces the selected field, including on zero-quantity rows.</p><button className="primary-button compact" type="button" disabled={!canEdit || bulkValue === null || preview.affected === 0} onClick={() => { onChange(preview.state); setNotice(`Updated ${preview.affected} rows; skipped ${preview.skipped} inapplicable rows.`); }}>Apply overwrite</button></section> : null}
    {!state.lines.length ? <div className="qb-empty"><h3>Start building your quote</h3><p>Add an Item, enter its quantity, and continue. Use Custom Line for work without a catalog Item.</p></div> : null}
    {groups.filter(group => group.id !== null || group.lines.length || !state.groups.length).map(group => <section className="qb-group" key={group.id ?? "ungrouped"} style={group.accent ? { borderLeftColor: group.accent } : undefined}>
      <div className="qb-group-header">
        <button type="button" className="icon-button" aria-label={`${collapsed.has(group.id) ? "Expand" : "Collapse"} ${group.title}`} aria-expanded={!collapsed.has(group.id)} onClick={() => { const next = new Set(collapsed); next.has(group.id) ? next.delete(group.id) : next.add(group.id); setCollapsed(next); }}>{collapsed.has(group.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
        {group.id ? <input aria-label="Group title" className="qb-group-title" value={group.title} maxLength={120} disabled={!canEdit} onChange={event => onChange({ ...state, groups: state.groups.map(row => row.id === group.id ? { ...row, title: event.target.value } : row) })} /> : <h3>Ungrouped</h3>}
        <span>{group.lines.length} lines</span><strong>{money(group.total)}</strong>
        {group.id ? <><input type="color" aria-label={`Accent for ${group.title}`} disabled={!canEdit} value={group.accent ?? "#3b82f6"} onChange={event => onChange({ ...state, groups: state.groups.map(row => row.id === group.id ? { ...row, accent: event.target.value } : row) })} /><button type="button" className="icon-button" aria-label={`Move ${group.title} up`} disabled={!canEdit} onClick={() => moveGroup(group.id!, -1)}><ArrowUp size={14} /></button><button type="button" className="icon-button" aria-label={`Move ${group.title} down`} disabled={!canEdit} onClick={() => moveGroup(group.id!, 1)}><ArrowDown size={14} /></button><button type="button" className="icon-button" title="Remove group; keep lines in Ungrouped" aria-label={`Remove ${group.title} and keep its lines`} disabled={!canEdit} onClick={() => { onChange({ ...state, groups: state.groups.filter(row => row.id !== group.id), lines: state.lines.map(line => line.groupId === group.id ? { ...line, groupId: null } : line) }); if (addGroup === group.id) setAddGroup(null); }}><Trash2 size={14} /></button></> : null}
      </div>
      {!collapsed.has(group.id) ? <div className="qb-grid" role="table" aria-label={`${group.title} estimate lines`}>
        <div className="qb-grid-row qb-grid-heading" role="row">
          <div role="columnheader"><input type="checkbox" aria-label={`Select all lines in ${group.title}`} checked={group.lines.length > 0 && group.lines.every(line => selected.has(line.id))} onChange={event => { const next = new Set(selected); group.lines.forEach(line => event.target.checked ? next.add(line.id) : next.delete(line.id)); setSelected(next); }} /></div>
          <div role="columnheader">Item / Description</div><div role="columnheader">Quantity / Unit</div><div role="columnheader" className="qb-mode-cell">Mode</div><div role="columnheader" className="qb-unit-sell qb-numeric">Unit sell</div><div role="columnheader" className="qb-numeric">Extension</div><div role="columnheader"><span className="sr-only">Actions</span></div>
        </div>
        {group.lines.map(line => <BuilderRow key={line.id} line={line} result={line.calculation} configuration={configuration} groups={state.groups} canEdit={canEdit} unavailable={Boolean(line.itemId && unavailableItemIds.includes(line.itemId))} diagnostics={result.diagnostics.filter(issue => issue.lineId === line.id)} quoteDiagnostics={result.diagnostics} selected={selected.has(line.id)} onSelect={() => { const next = new Set(selected); next.has(line.id) ? next.delete(line.id) : next.add(line.id); setSelected(next); }} expanded={expanded.has(line.id)} onExpand={() => { const next = new Set(expanded); next.has(line.id) ? next.delete(line.id) : next.add(line.id); setExpanded(next); }} patch={patch => patchLine(line.id, patch)} onMove={direction => moveLine(line.id, direction)} onRemove={() => { onChange({ ...state, lines: state.lines.filter(row => row.id !== line.id) }); setSelected(new Set([...selected].filter(id => id !== line.id))); }} />)}
        {!group.lines.length ? <p className="qb-group-empty">No lines yet. Choose this group in the toolbar to add Items.</p> : null}
      </div> : null}
    </section>)}
    <details className="qb-costs"><summary>Project costs <span>Travel, equipment &amp; lodging</span></summary><p>Equipment rental is a total before labor margin. Travel and lodging are added after margin.</p><div className="qb-fields">
      <DecimalField label="Travel — total expected cost" value={state.projectCosts.travelTotal} disabled={!canEdit} onChange={value => onChange({ ...state, projectCosts: { ...state.projectCosts, travelTotal: value } })} />
      <DecimalField label="Equipment rental — total expected cost" value={state.projectCosts.equipmentRentalTotal} disabled={!canEdit} onChange={value => onChange({ ...state, projectCosts: { ...state.projectCosts, equipmentRentalTotal: value } })} />
      <DecimalField label="Nightly lodging rate / person" value={state.projectCosts.lodgingNightlyRate} disabled={!canEdit} onChange={value => onChange({ ...state, projectCosts: { ...state.projectCosts, lodgingNightlyRate: value } })} />
      <DecimalField label="Lodging headcount override" value={state.projectCosts.lodgingHeadcountOverride} hint={`Leave blank for calculated crew headcount. Current: ${numberText(result.labor.lodgingHeadcount)}; nights: ${numberText(result.labor.lodgingNights)}.`} disabled={!canEdit} onChange={value => onChange({ ...state, projectCosts: { ...state.projectCosts, lodgingHeadcountOverride: value } })} />
    </div></details>
  </div>;
}
