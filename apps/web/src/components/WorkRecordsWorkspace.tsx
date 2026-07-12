"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CalendarClock,
  FileText,
  Plus,
  Save,
  Search,
  X
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { convertQuoteToProject } from "@/lib/api/quotes";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClientRecord } from "@pulse/contracts/clients";
import {
  invoiceStatuses,
  projectStatuses,
  quoteStatuses,
  type InvoiceRecord,
  type ProjectRecord,
  type QuoteRecord
} from "@pulse/contracts/work";

type WorkKind = "quotes" | "projects" | "invoices";
type WorkRecord = QuoteRecord | ProjectRecord | InvoiceRecord;
type QueueSort = "activity" | "number" | "value" | "due";

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

type WorkView = {
  key: string;
  label: string;
  statuses?: readonly string[];
};

const emptyForm: FormState = {
  title: "",
  clientId: "",
  projectId: "",
  owner: "Unassigned",
  value: "0",
  dueDate: ""
};

const today = new Date().toISOString().slice(0, 10);

const workspaceCopy: Record<
  WorkKind,
  { eyebrow: string; summary: string; singular: string; plural: string }
> = {
  quotes: {
    eyebrow: "Sales proposals",
    summary: "Track proposal status, ownership, client value, and project handoff.",
    singular: "Quote",
    plural: "quotes"
  },
  projects: {
    eyebrow: "Delivery work",
    summary: "Track execution, ownership, timing, budgets, and billing readiness.",
    singular: "Project",
    plural: "projects"
  },
  invoices: {
    eyebrow: "Client billing",
    summary: "Track invoice status, due dates, balances, and project lineage.",
    singular: "Invoice",
    plural: "invoices"
  }
};

const workViews: Record<WorkKind, WorkView[]> = {
  quotes: [
    { key: "all", label: "All quotes" },
    { key: "open", label: "Open", statuses: ["Draft", "Review", "Sent"] },
    { key: "approved", label: "Approved", statuses: ["Approved"] },
    {
      key: "closed",
      label: "Closed",
      statuses: ["Rejected", "Expired", "Cancelled"]
    }
  ],
  projects: [
    { key: "all", label: "All projects" },
    {
      key: "active",
      label: "Active",
      statuses: ["Ready", "In Progress", "Field Work"]
    },
    { key: "hold", label: "On hold", statuses: ["On Hold"] },
    { key: "completed", label: "Completed", statuses: ["Completed"] },
    { key: "cancelled", label: "Cancelled", statuses: ["Cancelled"] }
  ],
  invoices: [
    { key: "all", label: "All invoices" },
    { key: "open", label: "Open", statuses: ["Draft", "Review", "Sent"] },
    { key: "paid", label: "Paid", statuses: ["Paid"] },
    { key: "overdue", label: "Overdue", statuses: ["Overdue"] },
    { key: "void", label: "Void", statuses: ["Void"] }
  ]
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Request failed."
    );
  }
  return data as T;
}

function recordNumber(record: WorkRecord) {
  if ("invoiceNumber" in record) return record.invoiceNumber;
  if ("projectNumber" in record) return record.projectNumber;
  return record.quoteNumber;
}

function recordValue(record: WorkRecord) {
  if ("total" in record) return record.total;
  if ("budget" in record) return record.budget;
  return record.amount;
}

function recordDue(record: WorkRecord) {
  return "dueDate" in record ? record.dueDate : "";
}

function recordSource(record: WorkRecord) {
  if ("requestNumber" in record && record.requestNumber) {
    return `From ${record.requestNumber}`;
  }
  if ("quoteNumber" in record && "quoteId" in record && record.quoteNumber) {
    return `From ${record.quoteNumber}`;
  }
  if (
    "invoiceNumber" in record &&
    "projectNumber" in record &&
    record.projectNumber
  ) {
    return `From ${record.projectNumber}`;
  }
  return "Direct entry";
}

function statusTone(status: string) {
  if (["Approved", "Paid", "Completed"].includes(status)) return "success";
  if (["Rejected", "Cancelled", "Expired", "Overdue", "Void"].includes(status)) {
    return "danger";
  }
  if (["Draft", "Review", "On Hold"].includes(status)) return "warning";
  return "info";
}

function needsAttention(record: WorkRecord) {
  if (["Overdue", "Expired"].includes(record.status)) return true;
  const dueDate = recordDue(record);
  if (!dueDate || dueDate >= today) return false;
  return !["Paid", "Void", "Completed", "Cancelled"].includes(record.status);
}

function activityTimestamp(record: WorkRecord) {
  return Date.parse(record.updatedAt || record.createdAt) || 0;
}

function dueTimestamp(record: WorkRecord) {
  const dueDate = recordDue(record);
  return dueDate
    ? Date.parse(`${dueDate}T00:00:00`)
    : Number.MAX_SAFE_INTEGER;
}

function displayDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

export function WorkRecordsWorkspace({ kind, title, valueLabel }: Props) {
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [invoiceSource, setInvoiceSource] = useState<ProjectRecord | null>(null);
  const [activeView, setActiveView] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<QueueSort>("activity");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [documentRecordId, setDocumentRecordId] = useState("");
  const [focusedRecordId, setFocusedRecordId] = useState("");
  const writePermission = kind === "quotes"
    ? "quotes:write"
    : kind === "projects"
      ? "projects:write"
      : "billing:write";
  const canWrite = canUser(user, writePermission);
  const requestedRecordId = searchParams.get("record") ?? "";
  const copy = workspaceCopy[kind];
  const views = workViews[kind];
  const statuses =
    kind === "quotes"
      ? quoteStatuses
      : kind === "projects"
        ? projectStatuses
        : invoiceStatuses;

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setLoadError("");
        const [workData, clientData, projectData] = await Promise.all([
          requestJson<Record<WorkKind, WorkRecord[]>>(`/api/${kind}`, {
            cache: "no-store"
          }),
          canWrite
            ? requestJson<{ clients: ClientRecord[] }>("/api/clients", {
                cache: "no-store"
              })
            : Promise.resolve({ clients: [] }),
          kind === "invoices" && canWrite
            ? requestJson<{ projects: ProjectRecord[] }>("/api/projects", {
                cache: "no-store"
              })
            : Promise.resolve({ projects: [] })
        ]);
        setRecords(workData[kind]);
        setClients(clientData.clients);
        setProjects(projectData.projects);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : `Unable to load ${title.toLowerCase()}.`
        );
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [canWrite, kind, title]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && formOpen) {
        setFormOpen(false);
        setInvoiceSource(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [formOpen]);

  useEffect(() => {
    if (!requestedRecordId || !records.some((record) => record.id === requestedRecordId)) {
      return;
    }
    setActiveView("all");
    setSearchTerm("");
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

  const viewCounts = useMemo(
    () =>
      Object.fromEntries(
        views.map((view) => [
          view.key,
          view.statuses
            ? records.filter((record) => view.statuses?.includes(record.status))
                .length
            : records.length
        ])
      ),
    [records, views]
  );

  const visibleRecords = useMemo(() => {
    const selectedView = views.find((view) => view.key === activeView);
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return records
      .filter((record) => {
        const matchesView =
          !selectedView?.statuses ||
          selectedView.statuses.includes(record.status);
        const matchesSearch =
          !normalizedSearch ||
          [
            recordNumber(record),
            record.title,
            record.clientName,
            record.owner,
            record.status,
            recordSource(record)
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        return matchesView && matchesSearch;
      })
      .sort((left, right) => {
        if (sort === "number") {
          return recordNumber(right).localeCompare(recordNumber(left), undefined, {
            numeric: true
          });
        }
        if (sort === "value") return recordValue(right) - recordValue(left);
        if (sort === "due") return dueTimestamp(left) - dueTimestamp(right);
        return activityTimestamp(right) - activityTimestamp(left);
      });
  }, [activeView, records, searchTerm, sort, views]);

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

  function closeCreate() {
    setFormOpen(false);
    setInvoiceSource(null);
  }

  async function createRecord(event: FormEvent) {
    event.preventDefault();
    if (!form.title || !form.clientId) {
      setToast("Title and client are required.");
      return;
    }
    setSaving(true);
    try {
      if (invoiceSource) {
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
        setRecords((current) =>
          current.map((record) =>
            record.id === invoiceSource.id && "invoiceCount" in record
              ? { ...record, invoiceCount: record.invoiceCount + 1 }
              : record
          )
        );
        closeCreate();
        setToast(
          `${data.invoice.invoiceNumber} created from ${invoiceSource.projectNumber}.`
        );
        return;
      }

      const payload =
        kind === "quotes"
          ? {
              title: form.title,
              clientId: form.clientId,
              owner: form.owner,
              status: "Draft",
              total: Number(form.value)
            }
          : kind === "projects"
            ? {
                title: form.title,
                clientId: form.clientId,
                owner: form.owner,
                status: "Ready",
                budget: Number(form.value),
                dueDate: form.dueDate || undefined
              }
            : {
                title: form.title,
                clientId: form.clientId,
                projectId: form.projectId || undefined,
                owner: form.owner,
                status: "Draft",
                amount: Number(form.value),
                dueDate: form.dueDate || undefined
              };
      const singular =
        kind === "quotes" ? "quote" : kind === "projects" ? "project" : "invoice";
      const data = await requestJson<Record<string, WorkRecord>>(`/api/${kind}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setRecords((current) => [data[singular], ...current]);
      closeCreate();
      setToast(`${recordNumber(data[singular])} created.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create record.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(record: WorkRecord, status: string) {
    try {
      const singular =
        kind === "quotes" ? "quote" : kind === "projects" ? "project" : "invoice";
      const data = await requestJson<Record<string, WorkRecord>>(
        `/api/${kind}/${record.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        }
      );
      setRecords((current) =>
        current.map((item) => (item.id === record.id ? data[singular] : item))
      );
      setToast(`${recordNumber(record)} moved to ${status}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update status.");
    }
  }

  async function convertQuote(quote: QuoteRecord) {
    try {
      const data = await convertQuoteToProject(quote.id);
      setRecords((current) =>
        current.map((record) =>
          record.id === quote.id ? { ...quote, projectId: data.project.id } : record
        )
      );
      setToast(`${quote.quoteNumber} created ${data.project.projectNumber}.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  function renderStatus(record: WorkRecord, compact = false) {
    return canWrite ? (
      <select
        className={`work-queue-status-select tone-${statusTone(record.status)}${compact ? " compact" : ""}`}
        value={record.status}
        aria-label={`Status for ${recordNumber(record)}`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => void changeStatus(record, event.target.value)}
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    ) : (
      <span className={`work-queue-status tone-${statusTone(record.status)}`}>
        {record.status}
      </span>
    );
  }

  function renderActions(record: WorkRecord, mobile = false) {
    const canShowFiles = kind !== "invoices" && "documents" in record;
    const canCreateProject =
      kind === "quotes" &&
      canUser(user, "projects:write") &&
      "projectId" in record &&
      record.status === "Approved" &&
      !record.projectId;
    const canCreateInvoice = kind === "projects" && canUser(user, "billing:write") && "budget" in record;

    return (
      <div className={mobile ? "work-queue-card-actions" : "work-queue-actions"}>
        {kind === "quotes" ? (
          <Link href={`/quotes/${record.id}`}>
            Open workspace
            <ArrowRight size={14} />
          </Link>
        ) : null}
        {canShowFiles ? (
          <button
            type="button"
            aria-expanded={documentRecordId === record.id}
            onClick={() =>
              setDocumentRecordId(documentRecordId === record.id ? "" : record.id)
            }
          >
            <FileText size={14} />
            Files
          </button>
        ) : null}
        {canCreateProject ? (
          <button
            className="primary"
            type="button"
            onClick={() => void convertQuote(record as QuoteRecord)}
            disabled={!canWrite}
          >
            Create project
            <ArrowRight size={14} />
          </button>
        ) : null}
        {canCreateInvoice ? (
          <button
            className="primary"
            type="button"
            onClick={() => openCreate(record as ProjectRecord)}
            disabled={!canWrite}
          >
            Create invoice
            <ArrowRight size={14} />
          </button>
        ) : null}
        {kind === "quotes" && "projectId" in record && record.projectId ? (
          <span>Project created</span>
        ) : null}
        {kind === "projects" && "invoiceCount" in record && record.invoiceCount ? (
          <span>
            {record.invoiceCount} invoice{record.invoiceCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {kind === "invoices" ? (
          <span>—</span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="work-queue">
      <header className="work-queue-heading">
        <div>
          <nav className="breadcrumb work-queue-breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link>
            <span>/</span>
            <span>{title}</span>
          </nav>
          <h1>{title}</h1>
          <p>
            <strong>{copy.eyebrow}</strong>
            <span aria-hidden="true"> · </span>
            {copy.summary}
          </p>
        </div>
        {kind === "quotes" && canUser(user, "requests:write") ? (
          <Link className="primary-button compact" href="/requests">
            <Plus size={17} />
            Create from request
          </Link>
        ) : (
          <button
            className="primary-button compact"
            type="button"
            onClick={() => openCreate()}
            disabled={!canWrite}
          >
            <Plus size={17} />
            New {copy.singular.toLowerCase()}
          </button>
        )}
      </header>

      <nav className="work-queue-views" aria-label={`${title} views`}>
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            className={activeView === view.key ? "active" : ""}
            aria-current={activeView === view.key ? "page" : undefined}
            onClick={() => setActiveView(view.key)}
          >
            <span>{view.label}</span>
            <strong>{viewCounts[view.key] ?? 0}</strong>
          </button>
        ))}
      </nav>

      <div className="work-queue-surface">
        <div className="work-queue-toolbar">
          <label className="work-queue-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search {title.toLowerCase()}</span>
            <input
              type="search"
              placeholder={`Search ${copy.singular.toLowerCase()}, client, owner, or status`}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="work-queue-sort">
            <ArrowUpDown size={16} aria-hidden="true" />
            <span className="sr-only">Sort {title.toLowerCase()}</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as QueueSort)}
            >
              <option value="activity">Newest activity</option>
              <option value="number">{copy.singular} number</option>
              <option value="value">{valueLabel}: high to low</option>
              {kind !== "quotes" ? <option value="due">Due date</option> : null}
            </select>
          </label>
        </div>

        <div className="work-queue-meta">
          <span>
            <strong>{visibleRecords.length}</strong>{" "}
            {visibleRecords.length === 1
              ? copy.singular.toLowerCase()
              : copy.plural}
          </span>
          <span>
            Sorted by{" "}
            {sort === "activity"
              ? "newest activity"
              : sort === "number"
                ? `${copy.singular.toLowerCase()} number`
                : sort === "value"
                  ? valueLabel.toLowerCase()
                  : "due date"}
          </span>
        </div>

        {loadError ? (
          <div className="work-queue-state error">
            <AlertTriangle size={20} />
            <div>
              <strong>Unable to load {title.toLowerCase()}</strong>
              <span>{loadError}</span>
            </div>
          </div>
        ) : null}

        <div className="work-queue-desktop">
          <table className="work-queue-table">
            <thead>
              <tr>
                <th>{copy.singular}</th>
                <th>Client</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Timing</th>
                <th>{valueLabel}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }, (_, rowIndex) => (
                    <tr className="work-queue-skeleton-row" key={rowIndex}>
                      {Array.from({ length: 7 }, (__, cellIndex) => (
                        <td key={cellIndex}>
                          <span />
                        </td>
                      ))}
                    </tr>
                  ))
                : visibleRecords.map((record) => {
                    const dueDate = recordDue(record);
                    return (
                      <Fragment key={record.id}>
                        <tr
                          data-work-record={record.id}
                          tabIndex={-1}
                          className={[
                            needsAttention(record) ? "needs-attention" : "",
                            focusedRecordId === record.id
                              ? "work-record-focused"
                              : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <td>
                            {kind === "quotes" ? (
                              <Link href={`/quotes/${record.id}`}><strong>{record.title}</strong></Link>
                            ) : (
                              <strong>{record.title}</strong>
                            )}
                            <span>{recordNumber(record)}</span>
                            <small>{recordSource(record)}</small>
                          </td>
                          <td>
                            <strong>{record.clientName || "Unlinked"}</strong>
                          </td>
                          <td>{renderStatus(record)}</td>
                          <td>
                            <strong>{record.owner || "Unassigned"}</strong>
                          </td>
                          <td
                            className={
                              needsAttention(record)
                                ? "work-queue-timing attention"
                                : "work-queue-timing"
                            }
                          >
                            <strong>
                              <CalendarClock size={14} />
                              <span>
                                {dueDate
                                  ? `Due ${displayDate(dueDate)}`
                                  : `Updated ${displayDate(record.updatedAt)}`}
                              </span>
                            </strong>
                          </td>
                          <td>
                            <strong>{formatMoney(recordValue(record))}</strong>
                          </td>
                          <td>{renderActions(record)}</td>
                        </tr>
                        {kind !== "invoices" &&
                        documentRecordId === record.id &&
                        "documents" in record ? (
                          <tr
                            className="work-queue-documents-row"
                            key={`${record.id}-documents`}
                          >
                            <td colSpan={7}>
                              <LifecycleDocuments
                                stage={kind === "quotes" ? "quote" : "project"}
                                recordId={record.id}
                                documents={record.documents}
                                canWrite={canWrite}
                                onChange={(documents) =>
                                  setRecords((current) =>
                                    current.map((item) =>
                                      item.id === record.id
                                        ? { ...item, documents }
                                        : item
                                    )
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
            </tbody>
          </table>
        </div>

        <div className="work-queue-mobile">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <div className="work-queue-mobile-skeleton" key={index} />
              ))
            : visibleRecords.map((record) => {
                const dueDate = recordDue(record);
                return (
                  <article
                    className={`work-queue-mobile-card${needsAttention(record) ? " needs-attention" : ""}${focusedRecordId === record.id ? " work-record-focused" : ""}`}
                    data-work-record={record.id}
                    tabIndex={-1}
                    key={record.id}
                  >
                    <div className="work-queue-card-body">
                      <div className="work-queue-card-heading">
                        <span>{recordNumber(record)}</span>
                        {renderStatus(record, true)}
                      </div>
                      <h3>
                        {kind === "quotes" ? (
                          <Link href={`/quotes/${record.id}`}>{record.title}</Link>
                        ) : (
                          record.title
                        )}
                      </h3>
                      <p>{record.clientName || "Unlinked client"}</p>
                      <span className="work-queue-card-source">
                        {recordSource(record)}
                      </span>
                      <div className="work-queue-card-summary">
                        <div>
                          <span>{valueLabel}</span>
                          <strong>{formatMoney(recordValue(record))}</strong>
                        </div>
                        <div className={needsAttention(record) ? "attention" : ""}>
                          <span>{dueDate ? "Timing" : "Activity"}</span>
                          <strong>
                            {dueDate
                              ? `Due ${displayDate(dueDate)}`
                              : `Updated ${displayDate(record.updatedAt)}`}
                          </strong>
                        </div>
                      </div>
                      <div className="work-queue-card-owner">
                        <span>Owner</span>
                        <strong>{record.owner || "Unassigned"}</strong>
                      </div>
                    </div>
                    {renderActions(record, true)}
                    {kind !== "invoices" &&
                    documentRecordId === record.id &&
                    "documents" in record ? (
                      <div className="work-queue-card-documents">
                        <LifecycleDocuments
                          stage={kind === "quotes" ? "quote" : "project"}
                          recordId={record.id}
                          documents={record.documents}
                          canWrite={canWrite}
                          onChange={(documents) =>
                            setRecords((current) =>
                              current.map((item) =>
                                item.id === record.id ? { ...item, documents } : item
                              )
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
        </div>

        {!isLoading && !loadError && visibleRecords.length === 0 ? (
          <div className="work-queue-state">
            <Search size={21} />
            <div>
              <strong>No {copy.plural} match this view</strong>
              <span>Try another view or clear the search.</span>
            </div>
            {searchTerm ? (
              <button type="button" onClick={() => setSearchTerm("")}>
                Clear search
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {formOpen ? (
        <div
          className="work-queue-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeCreate();
          }}
        >
          <form
            className="work-queue-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-create-title"
            onSubmit={createRecord}
          >
            <div className="work-queue-modal-heading">
              <div>
                <span>
                  {invoiceSource ? invoiceSource.projectNumber : copy.eyebrow}
                </span>
                <h2 id="work-create-title">
                  New {invoiceSource ? "Invoice" : copy.singular}
                </h2>
                <p>Create a client-linked record in Pulse.</p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                aria-label="Close create form"
              >
                <X size={20} />
              </button>
            </div>
            <div className="work-queue-form-grid">
              <label>
                Title
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                Client
                <select
                  required
                  value={form.clientId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      clientId: event.target.value,
                      projectId: ""
                    })
                  }
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "invoices" ? (
                <label>
                  Project
                  <select
                    value={form.projectId}
                    onChange={(event) => {
                      const project = projects.find(
                        (item) => item.id === event.target.value
                      );
                      setForm({
                        ...form,
                        projectId: event.target.value,
                        clientId: project?.clientId ?? form.clientId
                      });
                    }}
                  >
                    <option value="">No project</option>
                    {projects
                      .filter(
                        (project) =>
                          !form.clientId || project.clientId === form.clientId
                      )
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.projectNumber} - {project.title}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <label>
                Owner
                <input
                  value={form.owner}
                  onChange={(event) =>
                    setForm({ ...form, owner: event.target.value })
                  }
                />
              </label>
              <label>
                {valueLabel}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(event) =>
                    setForm({ ...form, value: event.target.value })
                  }
                />
              </label>
              {kind !== "quotes" || invoiceSource ? (
                <label>
                  Due date
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm({ ...form, dueDate: event.target.value })
                    }
                  />
                </label>
              ) : null}
            </div>
            <div className="work-queue-modal-actions">
              <button type="button" onClick={closeCreate}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                <Save size={17} />
                {saving ? "Saving..." : `Save ${invoiceSource ? "invoice" : copy.singular.toLowerCase()}`}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {toast ? (
        <div className="work-queue-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
