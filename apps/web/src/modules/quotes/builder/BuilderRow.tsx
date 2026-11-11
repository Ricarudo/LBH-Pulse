"use client";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Package, RotateCcw, Trash2 } from "lucide-react";
import type { ItemRecord } from "@pulse/contracts/items";
import type { BuilderLine, BuilderMode, BuilderWorkspace, CalculationConfiguration, CalculationDiagnostic, CalculationResult } from "@pulse/contracts/quote-builder";
import { fetchItem } from "@/lib/api/items";
import { itemIdentityText, modeLabels, reapplyItemEstimatingDefaults } from "@/lib/quoteBuilder";
import { DecimalField, money, numberText } from "./BuilderFields";
import { BuilderConfigurationNotice } from "./BuilderConfigurationNotice";

export function ItemThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  // Copied reference only: never fetch the current Item image to repair an old line.
  const safe = src && (/^https?:\/\//i.test(src) || /^\/(?!\/)/.test(src));
  return <span className="qb-thumbnail">{safe && failed !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} /> : <Package size={19} aria-hidden="true" />}</span>;
}

export function BuilderRow({ line, result, configuration, groups, canEdit, unavailable, diagnostics, quoteDiagnostics = [], selected, onSelect, expanded, onExpand, patch, onMove, onRemove }: {
  line: BuilderLine; result: CalculationResult["lines"][number]; configuration: CalculationConfiguration; groups: BuilderWorkspace["groups"]; canEdit: boolean; unavailable: boolean; diagnostics: CalculationDiagnostic[]; selected: boolean; onSelect: () => void; expanded: boolean; onExpand: () => void; patch: (patch: Partial<BuilderLine>) => void; onMove: (direction: number) => void; onRemove: () => void;
  quoteDiagnostics?: CalculationDiagnostic[];
}) {
  const [refreshItem, setRefreshItem] = useState<ItemRecord | null>(null);
  const [refreshing, setRefreshing] = useState(false); const [refreshError, setRefreshError] = useState("");
  const materialFields = [["baseUnitCost", "Base unit cost", false], ["contingency", "Contingency", true], ["freight", "Freight", true], ["margin", "Target margin", true], ["materialIvuRate", "Material IVU rate", true]] as const;
  const laborFields = [["productionRate", `Production rate (${line.unit || "units"} / crew-hour)`], ["crewSize", "Crew size"], ["overtimeMultiplier", "Overtime multiplier"]] as const;
  const origin = (key: string) => ({ company: "Company default", item: "Item default", manual: "Manual override", bulk: "Bulk override" })[line.origins[key]] ?? "Working value";
  const issue = (field: string) => diagnostics.find(diagnostic => diagnostic.path.endsWith(`.${field}`));
  const classIssue = issue("labor.laborClassId") ?? diagnostics.find(diagnostic => diagnostic.path.endsWith(".hourlyRate"));
  const severity = diagnostics.some(diagnostic => diagnostic.category === "invalid") ? "invalid" : "incomplete";
  const identity = itemIdentityText(line.itemFacts);
  const laborPending = result.labor?.customerUnit === null;
  // Labor is allocated across the quote. Shared settings (or another line's
  // unresolved labor rate) can block this line even when its own inputs are valid.
  const laborConfigurationIssues = laborPending ? quoteDiagnostics.filter(issue => issue.path.startsWith("configuration.") && issue.path !== "configuration.b2bServiceTaxRate") : [];
  const mode = <select aria-label={`Mode for ${line.name}`} value={line.mode} disabled={!canEdit} onChange={event => patch({ mode: event.target.value as BuilderMode })}>{Object.entries(modeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  async function previewItemDefaults() {
    if (!line.itemId) return;
    setRefreshing(true); setRefreshError("");
    try {
      const { item } = await fetchItem(line.itemId, { cache: "no-store" });
      if (item.status !== "ACTIVE") throw new Error("This Item is inactive. Its copied values are retained.");
      setRefreshItem(item);
    } catch (error) { setRefreshError(error instanceof Error ? error.message : "Unable to load Item defaults."); }
    finally { setRefreshing(false); }
  }
  return <div role="rowgroup" className={`qb-line${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`} data-builder-line={line.id}>
    <div role="row" className="qb-grid-row qb-line-main">
      <div role="cell"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${line.name}`} /></div>
      <div role="cell" className="qb-identity"><ItemThumbnail src={line.imageUrl} /><div className="qb-identity-text">
        <input className="qb-line-name" aria-label={`Name for ${line.name}`} value={line.name} disabled={!canEdit} onChange={event => patch({ name: event.target.value, origins: { ...line.origins, name: "manual" } })} maxLength={200} />
        <div className="qb-identity-meta">{!line.itemId ? <span className="qb-custom-label">Custom</span> : null}{identity ? <span title={identity}>{identity}</span> : line.itemFacts?.itemType ? <span>{line.itemFacts.itemType.toLowerCase()}</span> : null}{unavailable ? <span className="qb-warning" title="The catalog Item is inactive or unavailable. Copied values are retained."><AlertTriangle size={12} /> Unavailable Item</span> : null}</div>
        {line.proposalDescription ? <p className="qb-description" title={line.proposalDescription}>{line.proposalDescription}</p> : null}
        <div className="qb-mobile-mode">{mode}</div>
        {diagnostics.length ? <button type="button" className={`qb-row-diagnostic ${severity}`} onClick={() => { if (!expanded) onExpand(); }}><AlertTriangle size={12} />{diagnostics.length} {severity === "invalid" ? "invalid" : "missing / unresolved"} input{diagnostics.length === 1 ? "" : "s"}</button> : null}
      </div></div>
      <div role="cell" className="qb-quantity" data-quantity><DecimalField compact label={`Quantity for ${line.name}`} value={line.quantity} disabled={!canEdit} maxDecimalPlaces={3} diagnostic={issue("quantity")} onChange={quantity => patch({ quantity })} /><input className="qb-unit" aria-label={`Unit for ${line.name}`} value={line.unit} disabled={!canEdit} onChange={event => patch({ unit: event.target.value, origins: { ...line.origins, unit: "manual" } })} maxLength={40} /></div>
      <div role="cell" className="qb-mode-cell">{mode}</div>
      <div role="cell" className="qb-unit-sell qb-numeric">{money(result.customerUnit)}{laborPending && result.material?.customerUnit != null ? <small className="qb-partial-price">Material {money(result.material.customerUnit)}</small> : null}</div>
      <div role="cell" className="qb-numeric qb-extension"><strong>{money(result.customerTotal, 5)}</strong>{result.customerTotal === null ? <button type="button" className="qb-price-pending" onClick={() => { if (!expanded) onExpand(); }}>{laborPending ? "Labor pending" : "Price pending"}</button> : null}</div>
      <div role="cell" className="qb-row-actions"><button type="button" className="icon-button" aria-label={`Estimating details for ${line.name}`} aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button><button type="button" className="icon-button qb-remove" aria-label={`Remove ${line.name}`} disabled={!canEdit} onClick={onRemove}><Trash2 size={15} /></button></div>
    </div>
    {expanded ? <div role="row" className="qb-expanded"><div role="cell" aria-colspan={7} className="qb-line-details">
      <fieldset disabled={!canEdit} className="qb-line-description"><legend>Customer description &amp; organization</legend><div className="qb-fields"><label className="qb-field qb-description-field"><span>Proposal description</span><textarea aria-label={`Proposal description for ${line.name}`} value={line.proposalDescription} onChange={event => patch({ proposalDescription: event.target.value, origins: { ...line.origins, proposalDescription: "manual" } })} rows={2} maxLength={2000} placeholder="Describe this line for the customer" /></label><label className="qb-field"><span>Group</span><select value={line.groupId ?? ""} onChange={event => patch({ groupId: event.target.value || null })}><option value="">Ungrouped</option>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label></div>
        <div className="qb-row-tools"><button className="toolbar-button compact" type="button" onClick={() => onMove(-1)}>Move up</button><button className="toolbar-button compact" type="button" onClick={() => onMove(1)}>Move down</button><button className="toolbar-button compact" type="button" onClick={onRemove}>Remove line</button></div>
      </fieldset>
      <div className="qb-estimating-grid">
      {line.mode !== "LABOR_ONLY" ? <fieldset disabled={!canEdit}><legend>Material <span>{money(result.material?.customerUnit ?? null)} / unit</span></legend><div className="qb-detail-fields">{materialFields.map(([key, label, percentage]) => <DecimalField key={key} label={label} percentage={percentage} value={line.material[key]} hint={origin(`material.${key}`)} diagnostic={issue(`material.${key}`)} onChange={value => patch({ material: { ...line.material, [key]: value }, origins: { ...line.origins, [`material.${key}`]: "manual" } })} />)}<label className="qb-tax-check"><input type="checkbox" checked={line.material.materialIvuEnabled} onChange={event => patch({ material: { ...line.material, materialIvuEnabled: event.target.checked }, origins: { ...line.origins, "material.materialIvuEnabled": "manual" } })} /> Material IVU applies</label></div><button className="toolbar-button compact" type="button" title="Overwrite contingency, freight, margin and IVU rate with this session's loaded company defaults" onClick={() => patch({ material: { ...line.material, contingency: configuration.materialContingency, freight: configuration.materialFreight, margin: configuration.materialMargin, materialIvuRate: configuration.materialIvuRate }, origins: { ...line.origins, "material.contingency": "company", "material.freight": "company", "material.margin": "company", "material.materialIvuRate": "company" } })}><RotateCcw size={13} /> Reapply loaded material defaults</button></fieldset> : null}
      {line.mode !== "MATERIAL_ONLY" ? <fieldset disabled={!canEdit}><legend>Labor <span>{money(result.labor?.customerUnit ?? null)} / unit</span></legend><p>Production is this crew’s output per ideal working hour.</p><div className="qb-detail-fields">
        <label className="qb-field"><span>Labor class</span><select aria-invalid={classIssue?.category === "invalid"} value={line.labor.laborClassId ?? ""} onChange={event => patch({ labor: { ...line.labor, laborClassId: event.target.value || null }, origins: { ...line.origins, "labor.laborClassId": "manual" } })}><option value="">Choose an active class</option>{line.labor.laborClassId && !configuration.laborClasses.some(role => role.id === line.labor.laborClassId) ? <option value={line.labor.laborClassId}>Unavailable class</option> : null}{configuration.laborClasses.map(role => <option key={role.id} value={role.id} disabled={!role.enabled}>{role.name}{role.enabled ? role.hourlyRate === null ? " — rate not set" : ` — $${role.hourlyRate}/hr` : " (disabled)"}</option>)}</select><small className={classIssue ? "qb-warning" : undefined}>{classIssue?.message ?? origin("labor.laborClassId")}</small></label>
        {laborFields.map(([key, label]) => <DecimalField key={key} label={label} value={line.labor[key]} hint={origin(`labor.${key}`)} diagnostic={issue(`labor.${key}`)} onChange={value => patch({ labor: { ...line.labor, [key]: value }, origins: { ...line.origins, [`labor.${key}`]: "manual" } })} />)}
      </div><p className="qb-direct-results">Installation: {numberText(result.labor?.installationHours ?? null)} h · Direct labor: {numberText(result.labor?.directHours ?? null)} h / {money(result.labor?.directCost ?? null)}</p>
        {laborConfigurationIssues.length ? <BuilderConfigurationNotice diagnostics={laborConfigurationIssues} configuration={configuration} compact /> : laborPending ? <p className="qb-warning qb-labor-pending">Labor pricing is pending. Resolve the labor inputs and project costs listed in the quote’s calculation issues to calculate the allocated selling price.</p> : null}
      </fieldset> : null}
      </div>
      {line.itemId ? <div className="qb-source"><span>Copied catalog values · edits affect this estimate only.</span><button className="toolbar-button compact" type="button" disabled={!canEdit || unavailable || refreshing} onClick={() => void previewItemDefaults()}><RotateCcw size={13} />{refreshing ? "Loading…" : "Review current Item defaults"}</button><button className="toolbar-button compact" type="button" disabled={!canEdit} onClick={() => patch({ itemId: null })}>Convert to Custom</button>
        {refreshError ? <p role="alert" className="qb-warning">{refreshError}</p> : null}
        {refreshItem ? <div className="qb-refresh-preview"><p>Overwrite cost ({money(String(refreshItem.cost))}), IVU applicability ({refreshItem.taxable ? "applies" : "exempt"}), production ({refreshItem.defaultProductionRate ?? "not set"}), crew ({refreshItem.defaultCrewSize ?? "not set"}) and labor class ({configuration.laborClasses.find(role => role.id === refreshItem.defaultLaborClassId)?.name ?? "not available"})? Quantity, mode and copied presentation stay as entered.</p><button type="button" className="primary-button compact" disabled={!canEdit} onClick={() => { patch(reapplyItemEstimatingDefaults(line, refreshItem)); setRefreshItem(null); }}>Overwrite Item estimating defaults</button><button type="button" className="toolbar-button compact" onClick={() => setRefreshItem(null)}>Cancel</button></div> : null}
      </div> : null}
    </div></div> : null}
  </div>;
}
