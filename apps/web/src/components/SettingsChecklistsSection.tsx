"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Plus,
  RotateCcw,
  Search
} from "lucide-react";
import { requestTypes, serviceCategories } from "@/types/request";
import type {
  RequestChecklistTemplateItemRecord,
  RequestChecklistTemplateRecord
} from "@/types/requestChecklistTemplate";

type TemplatesResponse = { templates: RequestChecklistTemplateRecord[] };
type TemplateResponse = { template: RequestChecklistTemplateRecord };

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Checklist request failed.");
  return data as T;
}

function copyTemplate(template: RequestChecklistTemplateRecord) {
  return { ...template, items: template.items.map((item) => ({ ...item })) };
}

function ordered(items: RequestChecklistTemplateItemRecord[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function SettingsChecklistsSection() {
  const [templates, setTemplates] = useState<RequestChecklistTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<RequestChecklistTemplateRecord | null>(null);
  const [baseline, setBaseline] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"current" | "archived">("current");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => templates.filter((template) => {
    const archived = Boolean(template.archivedAt);
    return (status === "archived" ? archived : !archived) &&
      `${template.name} ${template.serviceCategory} ${template.requestType}`.toLowerCase().includes(query.toLowerCase());
  }), [templates, query, status]);
  const dirty = draft ? JSON.stringify(draft) !== baseline : false;
  const coreLabels = useMemo(() => new Set(
    templates.find((template) => template.key === "general")?.items
      .filter((item) => item.active)
      .map((item) => item.label.trim().toLowerCase()) ?? []
  ), [templates]);
  const duplicateCoreLabels = draft?.key !== "general"
    ? draft?.items.filter((item) => item.active && coreLabels.has(item.label.trim().toLowerCase())).map((item) => item.label) ?? []
    : [];

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function load(preferredId?: string) {
    try {
      setBusy(true);
      const data = await json<TemplatesResponse>("/api/settings/request-checklists", { cache: "no-store" });
      const next = data.templates.find((template) => template.id === preferredId) ??
        data.templates.find((template) => template.id === selectedId) ??
        data.templates.find((template) => !template.archivedAt) ?? null;
      setTemplates(data.templates);
      setSelectedId(next?.id ?? "");
      setDraft(next ? copyTemplate(next) : null);
      setBaseline(next ? JSON.stringify(copyTemplate(next)) : "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load templates.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function select(template: RequestChecklistTemplateRecord) {
    if (dirty && !window.confirm("Discard unsaved template changes?")) return;
    setSelectedId(template.id);
    setDraft(copyTemplate(template));
    setBaseline(JSON.stringify(copyTemplate(template)));
    setMessage("");
  }

  function updateItem(index: number, updates: Partial<RequestChecklistTemplateItemRecord>) {
    setDraft((current) => current ? {
      ...current,
      items: ordered(current.items).map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item)
    } : current);
  }

  function moveItem(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const items = ordered(current.items);
      const target = index + direction;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items: items.map((item, order) => ({ ...item, sortOrder: order + 1 })) };
    });
  }

  function addItem() {
    setDraft((current) => current ? {
      ...current,
      items: [...ordered(current.items), {
        id: "",
        label: "New checklist item",
        description: "",
        required: true,
        appliesWhen: "",
        sortOrder: current.items.length + 1,
        group: "Intake",
        active: true
      }]
    } : current);
  }

  async function createTemplate() {
    try {
      setBusy(true);
      const data = await json<TemplateResponse>("/api/settings/request-checklists", {
        method: "POST",
        body: JSON.stringify({
          name: "Untitled trade checklist",
          requestType: "",
          serviceCategory: "Other",
          active: false,
          items: [{ id: "", label: "First checklist item", description: "", required: true, appliesWhen: "", sortOrder: 1, group: "Intake", active: true }]
        })
      });
      await load(data.template.id);
      setMessage("New inactive template created. Review its rule and items before activation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create template.");
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    try {
      setBusy(true);
      const data = await json<TemplateResponse>(`/api/settings/request-checklists/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          requestType: draft.requestType,
          serviceCategory: draft.serviceCategory,
          active: draft.active,
          items: ordered(draft.items).map((item, index) => ({ ...item, sortOrder: index + 1 }))
        })
      });
      await load(data.template.id);
      setMessage(`${data.template.name} saved. New assignments will use this version.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save template.");
      setBusy(false);
    }
  }

  async function action(name: "duplicate" | "archive" | "restore") {
    if (!draft) return;
    if (name === "archive" && !window.confirm(`Archive “${draft.name}”? Existing Requests keep their snapshots.`)) return;
    try {
      setBusy(true);
      const data = await json<TemplateResponse>(`/api/settings/request-checklists/${draft.id}/${name}`, { method: "POST" });
      setStatus(name === "archive" ? "current" : status);
      await load(name === "archive" ? undefined : data.template.id);
      setMessage(name === "duplicate" ? "Inactive copy created." : name === "archive" ? "Template archived." : "Template restored as inactive.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to ${name} template.`);
      setBusy(false);
    }
  }

  return (
    <div className="checklist-library">
      <aside className="checklist-library-sidebar">
        <div className="settings-section-title"><div><h2>Template library</h2><p>{templates.filter((template) => !template.archivedAt).length} current templates</p></div><button className="icon-button" aria-label="Refresh templates" onClick={() => void load(selectedId)} disabled={busy}><RotateCcw size={17} /></button></div>
        <button className="primary-button full-width" onClick={() => void createTemplate()} disabled={busy}><Plus size={17} />New template</button>
        <label className="settings-search"><Search size={16} /><input aria-label="Search templates" placeholder="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="settings-filter-toggle"><button className={status === "current" ? "active" : ""} onClick={() => setStatus("current")}>Current</button><button className={status === "archived" ? "active" : ""} onClick={() => setStatus("archived")}>Archived</button></div>
        <div className="checklist-template-list">
          {filtered.map((template) => <button key={template.id} className={selectedId === template.id ? "checklist-template-card active" : "checklist-template-card"} onClick={() => select(template)}><span><strong>{template.name}</strong><small>{template.matchType === "CORE" ? "Core · Every request" : template.serviceCategory || template.requestType}</small></span><span className={template.active ? "status-dot active" : "status-dot"} aria-label={template.active ? "Active" : "Inactive"} /></button>)}
          {!filtered.length ? <p className="settings-empty compact">No matching templates.</p> : null}
        </div>
      </aside>
      <section className="checklist-editor settings-card">
        {draft ? (
          <>
            <div className="checklist-editor-header">
              <div><p className="settings-eyebrow">{draft.matchType === "CORE" ? "Protected core" : draft.archivedAt ? "Archived template" : draft.active ? "Active template" : "Inactive template"}</p><h2>{draft.name}</h2><p>Changes apply only when a checklist is attached to a Request in the future.</p></div>
              <div className="workspace-actions">
                {!draft.archivedAt ? <button className="toolbar-button compact" onClick={() => void action("duplicate")}><Copy size={16} />Duplicate</button> : null}
                {draft.archivedAt ? <button className="toolbar-button compact" onClick={() => void action("restore")}>Restore</button> : draft.key !== "general" ? <button className="toolbar-button compact danger-button" onClick={() => void action("archive")}><Archive size={16} />Archive</button> : null}
              </div>
            </div>
            {duplicateCoreLabels.length ? <div className="settings-warning"><strong>Possible Core duplicates</strong><p>{Array.from(new Set(duplicateCoreLabels)).join(", ")}. These remain valid until an admin removes them.</p></div> : null}
            <div className="settings-form checklist-metadata-form">
              <label className="wide"><span>Template name</span><input value={draft.name} disabled={Boolean(draft.archivedAt)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label><span>Assignment rule</span><select disabled={draft.key === "general" || Boolean(draft.archivedAt)} value={draft.matchType === "TRADE" ? "TRADE" : draft.matchType === "CORE" ? "CORE" : "REQUEST_TYPE"} onChange={(event) => setDraft({ ...draft, matchType: event.target.value as RequestChecklistTemplateRecord["matchType"], serviceCategory: event.target.value === "TRADE" ? "Other" : "", requestType: event.target.value === "REQUEST_TYPE" ? "Quote Request" : "" })}><option value="CORE">Every Request (Core)</option><option value="TRADE">Trade</option><option value="REQUEST_TYPE">Request type</option></select></label>
              {draft.matchType === "TRADE" ? <label><span>Trade</span><select disabled={Boolean(draft.archivedAt)} value={draft.serviceCategory} onChange={(event) => setDraft({ ...draft, serviceCategory: event.target.value as RequestChecklistTemplateRecord["serviceCategory"], requestType: "" })}>{serviceCategories.map((category) => <option key={category}>{category}</option>)}</select></label> : null}
              {draft.matchType === "REQUEST_TYPE" ? <label><span>Request type</span><select disabled={Boolean(draft.archivedAt)} value={draft.requestType} onChange={(event) => setDraft({ ...draft, requestType: event.target.value as RequestChecklistTemplateRecord["requestType"], serviceCategory: "" })}>{requestTypes.map((type) => <option key={type}>{type}</option>)}</select></label> : null}
              <label className="settings-switch-row"><input type="checkbox" checked={draft.active} disabled={draft.key === "general" || Boolean(draft.archivedAt)} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span><strong>Active</strong><small>Available for new Request assignments</small></span></label>
            </div>
            <div className="settings-section-title checklist-items-heading"><div><h3>Checklist items</h3><p>Reorder with the arrow controls; required active items contribute to Ready for Quote.</p></div><button className="toolbar-button compact" onClick={addItem} disabled={Boolean(draft.archivedAt)}><Plus size={16} />Add item</button></div>
            <div className="checklist-item-editor-list">
              {ordered(draft.items).map((item, index) => <article className={item.active ? "checklist-item-editor" : "checklist-item-editor inactive"} key={item.id || `new-${index}`}>
                <div className="checklist-reorder"><button aria-label={`Move ${item.label} up`} disabled={index === 0 || Boolean(draft.archivedAt)} onClick={() => moveItem(index, -1)}><ArrowUp size={15} /></button><button aria-label={`Move ${item.label} down`} disabled={index === draft.items.length - 1 || Boolean(draft.archivedAt)} onClick={() => moveItem(index, 1)}><ArrowDown size={15} /></button></div>
                <div className="settings-form checklist-item-fields">
                  <label className="wide"><span>Item label</span><input value={item.label} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { label: event.target.value })} /></label>
                  <label><span>Group</span><input value={item.group} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { group: event.target.value })} /></label>
                  <label className="wide"><span>Description</span><input value={item.description} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { description: event.target.value })} /></label>
                  <label><span>Condition</span><select value={item.appliesWhen} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { appliesWhen: event.target.value })}><option value="">Always</option><option value="siteVisitRequired">Site visit required</option></select></label>
                </div>
                <div className="checklist-item-toggles"><label><input type="checkbox" checked={item.required} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { required: event.target.checked })} />Required</label><label><input type="checkbox" checked={item.active} disabled={Boolean(draft.archivedAt)} onChange={(event) => updateItem(index, { active: event.target.checked })} />Active</label></div>
              </article>)}
            </div>
            <div className="sticky-save-bar"><p className="settings-inline-message" aria-live="polite">{message || (dirty ? "Unsaved changes" : "All changes saved")}</p>{!draft.archivedAt ? <button className="primary-button" disabled={!dirty || busy} onClick={() => void save()}><CheckCircle2 size={17} />{busy ? "Saving…" : "Save template"}</button> : null}</div>
          </>
        ) : <p className="settings-empty">Select or create a template.</p>}
      </section>
    </div>
  );
}
