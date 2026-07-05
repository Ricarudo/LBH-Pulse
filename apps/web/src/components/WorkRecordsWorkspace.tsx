"use client";

import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Plus, Save, SlidersHorizontal, X } from "lucide-react";
import { canRole } from "@/lib/auth/permissions";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { formatMoney, type ClientRecord } from "@/types/client";
import {
  invoiceStatuses,
  projectStatuses,
  quoteStatuses,
  type InvoiceRecord,
  type ProjectRecord,
  type QuoteRecord
} from "@/types/work";

type WorkKind = "quotes" | "projects" | "invoices";
type WorkRecord = QuoteRecord | ProjectRecord | InvoiceRecord;

type Props = {
  kind: WorkKind;
  title: string;
  valueLabel: string;
};

type FormState = {
  title: string;
  clientId: string;
  projectId: string;
  owner: string;
  value: string;
  dueDate: string;
};

const emptyForm: FormState = {
  title: "",
  clientId: "",
  projectId: "",
  owner: "Unassigned",
  value: "0",
  dueDate: ""
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  return data as T;
}

function recordStatus(record: WorkRecord) {
  return record.status;
}

function recordNumber(record: WorkRecord) {
  if ("invoiceNumber" in record) return record.invoiceNumber;
  if ("projectNumber" in record) return record.projectNumber;
  if ("quoteNumber" in record) return record.quoteNumber;
  return "";
}

function recordValue(record: WorkRecord) {
  if ("total" in record) return record.total;
  if ("budget" in record) return record.budget;
  return record.amount;
}

function recordDue(record: WorkRecord) {
  return "dueDate" in record ? record.dueDate : "";
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes("cancel") || value.includes("reject") || value.includes("overdue") || value === "void") {
    return "status-pill danger";
  }
  if (value.includes("draft") || value.includes("review") || value.includes("hold")) {
    return "status-pill warning";
  }
  return "status-pill";
}

export function WorkRecordsWorkspace({ kind, title, valueLabel }: Props) {
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [invoiceSource, setInvoiceSource] = useState<ProjectRecord | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState(`Loading ${title.toLowerCase()} from Pulse...`);
  const [saving, setSaving] = useState(false);
  const [documentRecordId, setDocumentRecordId] = useState("");
  const [focusedRecordId, setFocusedRecordId] = useState("");
  const canWrite = canRole(user?.role, "crm:write");
  const requestedRecordId = searchParams.get("record") ?? "";

  const statuses =
    kind === "quotes" ? quoteStatuses : kind === "projects" ? projectStatuses : invoiceStatuses;

  useEffect(() => {
    async function load() {
      try {
        const [workData, clientData, projectData] = await Promise.all([
          requestJson<Record<WorkKind, WorkRecord[]>>(`/api/${kind}`, { cache: "no-store" }),
          requestJson<{ clients: ClientRecord[] }>("/api/clients", { cache: "no-store" }),
          kind === "invoices"
            ? requestJson<{ projects: ProjectRecord[] }>("/api/projects", { cache: "no-store" })
            : Promise.resolve({ projects: [] })
        ]);
        setRecords(workData[kind]);
        setClients(clientData.clients);
        setProjects(projectData.projects);
        setMessage(`${title} are connected to the Pulse database.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `Unable to load ${title.toLowerCase()}.`);
      }
    }
    void load();
  }, [kind, title]);

  useEffect(() => {
    if (!requestedRecordId || !records.some((record) => record.id === requestedRecordId)) {
      return;
    }
    setActiveFilter("All");
    setFocusedRecordId(requestedRecordId);
    const focusTimer = window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-work-record="${CSS.escape(requestedRecordId)}"]`
      );
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      row?.focus({ preventScroll: true });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedRecordId(""), 2600);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(clearTimer);
    };
  }, [records, requestedRecordId]);

  const filters = useMemo(
    () => ["All", ...Array.from(new Set(records.map(recordStatus)))],
    [records]
  );
  const visibleRecords =
    activeFilter === "All" ? records : records.filter((record) => record.status === activeFilter);

  function openCreate(project?: ProjectRecord) {
    setInvoiceSource(project ?? null);
    setForm({
      ...emptyForm,
      title: project ? `${project.title} milestone invoice` : "",
      clientId: project?.clientId ?? "",
      projectId: project?.id ?? "",
      owner: project?.owner ?? user?.name ?? "Unassigned",
      value: project ? String(project.budget) : "0"
    });
    setFormOpen(true);
  }

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    if (!form.title || !form.clientId) {
      setMessage("Title and client are required.");
      return;
    }
    setSaving(true);
    try {
      if (invoiceSource) {
        // Project-board invoice creation uses the handoff endpoint so client lineage is inherited.
        const data = await requestJson<{ invoice: InvoiceRecord }>(
          `/api/projects/${invoiceSource.id}/invoices`,
          {
            method: "POST",
            body: JSON.stringify({
              title: form.title,
              owner: form.owner,
              amount: Number(form.value),
              dueDate: form.dueDate || undefined
            })
          }
        );
        setRecords((current) => current.map((record) =>
          record.id === invoiceSource.id && "invoiceCount" in record
            ? { ...record, invoiceCount: record.invoiceCount + 1 }
            : record
        ));
        setFormOpen(false);
        setInvoiceSource(null);
        setMessage(`${data.invoice.invoiceNumber} created from ${invoiceSource.projectNumber}.`);
        return;
      }
      const payload =
        kind === "quotes"
          ? { title: form.title, clientId: form.clientId, owner: form.owner, status: "Draft", total: Number(form.value) }
          : kind === "projects"
            ? { title: form.title, clientId: form.clientId, owner: form.owner, status: "Ready", budget: Number(form.value), dueDate: form.dueDate || undefined }
            : { title: form.title, clientId: form.clientId, projectId: form.projectId || undefined, owner: form.owner, status: "Draft", amount: Number(form.value), dueDate: form.dueDate || undefined };
      const singular = kind === "quotes" ? "quote" : kind === "projects" ? "project" : "invoice";
      const data = await requestJson<Record<string, WorkRecord>>(`/api/${kind}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setRecords((current) => [data[singular], ...current]);
      setFormOpen(false);
      setMessage(`${recordNumber(data[singular])} created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create record.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(record: WorkRecord, status: string) {
    try {
      const singular = kind === "quotes" ? "quote" : kind === "projects" ? "project" : "invoice";
      const data = await requestJson<Record<string, WorkRecord>>(`/api/${kind}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setRecords((current) => current.map((item) => item.id === record.id ? data[singular] : item));
      setMessage(`${recordNumber(record)} moved to ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update status.");
    }
  }

  async function convertQuote(quote: QuoteRecord) {
    try {
      const data = await requestJson<{ project: ProjectRecord }>(`/api/quotes/${quote.id}/convert`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setRecords((current) =>
        current.map((record) =>
          record.id === quote.id ? { ...quote, projectId: data.project.id } : record
        )
      );
      setMessage(`${quote.quoteNumber} created ${data.project.projectNumber}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  return (
    <div className="workspace-stack">
      <section className="metric-grid" aria-label={`${title} metrics`}>
        <article className="metric-card"><p className="metric-label">Visible Records</p><p className="metric-value">{visibleRecords.length}</p></article>
        <article className="metric-card"><p className="metric-label">Total Records</p><p className="metric-value">{records.length}</p></article>
        <article className="metric-card"><p className="metric-label">Active Filter</p><p className="metric-value metric-text">{activeFilter}</p></article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div><h2>{title} Board</h2><p className="panel-note">{message}</p></div>
          <button className="primary-button" type="button" onClick={() => openCreate()} disabled={!canWrite}>
            <Plus size={17} /> New {kind === "invoices" ? "Invoice" : kind === "projects" ? "Project" : "Quote"}
          </button>
        </div>
        <div className="filter-strip">
          <SlidersHorizontal size={16} />
          {filters.map((filter) => (
            <button className={filter === activeFilter ? "filter-chip active" : "filter-chip"} key={filter} type="button" onClick={() => setActiveFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
        <table className="data-table">
          <thead><tr><th>ID</th><th>Work</th><th>Client</th><th>Owner</th><th>Status</th><th>Due</th><th>{valueLabel}</th><th>Action</th></tr></thead>
          <tbody>
            {visibleRecords.map((record) => (
              <Fragment key={record.id}>
              <tr
                key={record.id}
                data-work-record={record.id}
                tabIndex={-1}
                className={focusedRecordId === record.id ? "work-record-focused" : undefined}
              >
                <td><strong>{recordNumber(record)}</strong></td>
                <td>{record.title}<br /><span className="table-muted">{"requestNumber" in record && record.requestNumber ? `From ${record.requestNumber}` : "quoteId" in record && record.quoteNumber ? `From ${record.quoteNumber}` : "invoiceNumber" in record && record.projectNumber ? `From ${record.projectNumber}` : "Database record"}</span></td>
                <td>{record.clientName || "Unlinked"}</td>
                <td>{record.owner}</td>
                <td>
                  {kind !== "invoices" ? (
                    <button className="toolbar-button compact" type="button" onClick={() => setDocumentRecordId(documentRecordId === record.id ? "" : record.id)}>
                      Files
                    </button>
                  ) : null}
                  {canWrite ? (
                    <select value={record.status} onChange={(event) => void changeStatus(record, event.target.value)}>
                      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  ) : <span className={statusClass(record.status)}>{record.status}</span>}
                </td>
                <td>{recordDue(record) || "-"}</td>
                <td>{formatMoney(recordValue(record))}</td>
                <td>
                  {kind === "quotes" && "projectId" in record && record.status === "Approved" && !record.projectId ? (
                    <button className="toolbar-button compact" type="button" onClick={() => void convertQuote(record)} disabled={!canWrite}>Create Project <ArrowRight size={14} /></button>
                  ) : null}
                  {kind === "projects" && "budget" in record ? (
                    <button className="toolbar-button compact" type="button" onClick={() => openCreate(record)} disabled={!canWrite}>Create Invoice <ArrowRight size={14} /></button>
                  ) : null}
                  {(kind === "quotes" && "projectId" in record && record.projectId) ? <span className="table-muted">Project created</span> : null}
                </td>
              </tr>
              {kind !== "invoices" && documentRecordId === record.id && "documents" in record ? (
                <tr key={`${record.id}-documents`}>
                  <td colSpan={8}>
                    <LifecycleDocuments
                      stage={kind === "quotes" ? "quote" : "project"}
                      recordId={record.id}
                      documents={record.documents}
                      canWrite={canWrite}
                      onChange={(documents) => setRecords((current) =>
                        current.map((item) => item.id === record.id ? { ...item, documents } : item)
                      )}
                    />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {formOpen ? (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true">
          <form className="lead-form-modal" onSubmit={createRecord}>
            <div className="modal-heading">
              <div><h2>New {invoiceSource || kind === "invoices" ? "Invoice" : kind === "projects" ? "Project" : "Quote"}</h2><p>Create a client-linked database record.</p></div>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="lead-form-grid">
              <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>Client<select value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value, projectId: "" })}><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.displayName}</option>)}</select></label>
              {kind === "invoices" ? <label>Project<select value={form.projectId} onChange={(event) => { const project = projects.find((item) => item.id === event.target.value); setForm({ ...form, projectId: event.target.value, clientId: project?.clientId ?? form.clientId }); }}><option value="">No project</option>{projects.filter((project) => !form.clientId || project.clientId === form.clientId).map((project) => <option key={project.id} value={project.id}>{project.projectNumber} - {project.title}</option>)}</select></label> : null}
              <label>Owner<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></label>
              <label>{valueLabel}<input type="number" min="0" step="0.01" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></label>
              {kind !== "quotes" ? <label>Due date<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label> : null}
            </div>
            <div className="modal-actions">
              <button className="toolbar-button compact" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}><Save size={17} /> {saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
