"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  Plus,
  Save,
  Search,
  X
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { ViewportPortal } from "@/components/ViewportPortal";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClientRecord } from "@pulse/contracts/clients";
import type { RequestAssignee } from "@pulse/contracts/requests";
import {
  invoiceStatuses,
  projectStatuses,
  quoteStatuses,
  type QuoteCalculationMode,
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
  contactId: string;
  siteId: string;
  projectId: string;
  assignedToId: string;
  value: string;
  dueDate: string;
  calculationMode: QuoteCalculationMode | "";
};

type WorkView = {
  key: string;
  label: string;
  statuses?: readonly string[];
};

const emptyForm: FormState = {
  title: "",
  clientId: "",
  contactId: "",
  siteId: "",
  projectId: "",
  assignedToId: "",
  value: "0",
  dueDate: "",
  calculationMode: ""
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
    summary: "Track execution, assignment, timing, budgets, and billing readiness.",
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
    { key: "open", label: "Open", statuses: ["Draft", "Review"] },
    { key: "sent", label: "Sent", statuses: ["Sent"] },
    {
      key: "completed",
      label: "Completed",
      statuses: ["Approved", "Rejected", "Expired", "Cancelled"]
    },
    { key: "all", label: "All quotes" }
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

function recordTrades(record: WorkRecord) {
  return "trades" in record ? record.trades : [];
}

function recordAssignedName(record: WorkRecord) {
  return "owner" in record
    ? record.owner || "Unassigned"
    : record.assignedTo?.name ?? "Unassigned";
}

function recordHref(kind: WorkKind, recordId: string, tab?: "files" | "updates") {
  const base = kind === "quotes"
    ? `/quotes/${recordId}`
    : kind === "projects"
      ? `/projects/${recordId}`
      : `/billing/${recordId}`;
  return tab ? `${base}?tab=${tab}` : base;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [invoiceAssignees, setInvoiceAssignees] = useState<RequestAssignee[]>([]);
  const [invoiceSource, setInvoiceSource] = useState<ProjectRecord | null>(null);
  const [activeView, setActiveView] = useState(
    kind === "quotes" ? "open" : "all"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<QueueSort>("activity");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [focusedRecordId, setFocusedRecordId] = useState("");
  const writePermission = kind === "quotes"
    ? "quotes:write"
    : kind === "projects"
      ? "projects:write"
      : "billing:write";
  const canWrite = canUser(user, writePermission);
  const canCreateBilling = kind === "projects" && canUser(user, "billing:write");
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
        const [workData, clientData, projectData, userData, invoiceUserData] = await Promise.all([
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
            : Promise.resolve({ projects: [] }),
          canWrite
            ? kind === "quotes"
              ? requestJson<{ teamMembers: RequestAssignee[] }>("/api/quotes/team-members", {
                  cache: "no-store"
                }).then((data) => ({ assignees: data.teamMembers }))
              : requestJson<{ assignees: RequestAssignee[] }>(`/api/${kind}/team-members`, {
                  cache: "no-store"
                })
            : Promise.resolve({ assignees: [] }),
          canCreateBilling
            ? requestJson<{ assignees: RequestAssignee[] }>("/api/invoices/team-members", {
                cache: "no-store"
              })
            : Promise.resolve({ assignees: [] })
        ]);
        setRecords(workData[kind]);
        setClients(clientData.clients);
        setProjects(projectData.projects);
        setAssignees(userData.assignees);
        setInvoiceAssignees(invoiceUserData.assignees);
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
  }, [canCreateBilling, canWrite, kind, title]);

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
            recordAssignedName(record),
            record.status,
            ...recordTrades(record),
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
    const availableAssignees = project ? invoiceAssignees : assignees;
    const inheritedAssigneeId = project?.assignedToId &&
      availableAssignees.some((assignee) => assignee.id === project.assignedToId)
      ? project.assignedToId
      : null;
    const currentUserId = user?.id &&
      availableAssignees.some((assignee) => assignee.id === user.id)
      ? user.id
      : "";
    setInvoiceSource(project ?? null);
    setForm({
      ...emptyForm,
      title: project ? `${project.title} milestone invoice` : "",
      clientId: project?.clientId ?? "",
      contactId: project?.contactId ?? "",
      siteId: project?.siteId ?? "",
      projectId: project?.id ?? "",
      assignedToId: inheritedAssigneeId ?? currentUserId,
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
    if (
      !form.title ||
      !form.clientId ||
      (kind === "quotes" && (!form.contactId || !form.calculationMode))
    ) {
      setToast(
        kind === "quotes"
          ? "Title, client, point of contact, and calculation mode are required."
          : "Title and client are required."
      );
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
              assignedToId: form.assignedToId || null,
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
              contactId: form.contactId,
              siteId: form.siteId || null,
              assignedToId: form.assignedToId || null,
              status: "Draft",
              calculationMode: form.calculationMode
            }
          : kind === "projects"
            ? {
                title: form.title,
                clientId: form.clientId,
                contactId: form.contactId || null,
                siteId: form.siteId || null,
                assignedToId: form.assignedToId || null,
                status: "Ready",
                budget: Number(form.value),
                dueDate: form.dueDate || undefined
              }
            : {
                title: form.title,
                clientId: form.clientId,
                projectId: form.projectId || undefined,
                contactId: form.contactId || null,
                siteId: form.siteId || null,
                assignedToId: form.assignedToId || null,
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
        <div className="work-queue-heading-actions">
          {kind === "quotes" && canUser(user, "requests:write") ? (
            <Link className="secondary-button compact" href="/requests">
              Create from request
            </Link>
          ) : null}
          <button
            className="primary-button compact"
            type="button"
            onClick={() => openCreate()}
            disabled={!canWrite}
          >
            <Plus size={17} />
            New {copy.singular.toLowerCase()}
          </button>
        </div>
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
              placeholder={`Search ${copy.singular.toLowerCase()}, client, assigned person, or status`}
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
                <th>{kind === "quotes" ? "Owner" : "Assigned to"}</th>
                <th>Timing</th>
                <th>{valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }, (_, rowIndex) => (
                    <tr className="work-queue-skeleton-row" key={rowIndex}>
                      {Array.from({ length: 6 }, (__, cellIndex) => (
                        <td key={cellIndex}>
                          <span />
                        </td>
                      ))}
                    </tr>
                  ))
                : visibleRecords.map((record) => {
                    const dueDate = recordDue(record);
                    return (
                        <tr
                          key={record.id}
                          data-work-record={record.id}
                          tabIndex={0}
                          role="link"
                          aria-label={`Open ${recordNumber(record)}: ${record.title}`}
                          onClick={() => router.push(recordHref(kind, record.id))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(recordHref(kind, record.id));
                            }
                          }}
                          className={[
                            "work-queue-clickable",
                            needsAttention(record) ? "needs-attention" : "",
                            focusedRecordId === record.id
                              ? "work-record-focused"
                              : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <td>
                            <strong>{record.title}</strong>
                            <span>{recordNumber(record)}</span>
                            <small>{recordSource(record)}</small>
                            {kind === "quotes" && recordTrades(record).length ? (
                              <span className="queue-trade-chips">
                                {recordTrades(record).map((trade) => (
                                  <span className="queue-category" key={trade}>{trade}</span>
                                ))}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <strong>{record.clientName || "Unlinked"}</strong>
                          </td>
                          <td>{renderStatus(record)}</td>
                          <td>
                            <strong>{recordAssignedName(record)}</strong>
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
                        </tr>
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
                    tabIndex={0}
                    role="link"
                    aria-label={`Open ${recordNumber(record)}: ${record.title}`}
                    onClick={() => router.push(recordHref(kind, record.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(recordHref(kind, record.id));
                      }
                    }}
                    key={record.id}
                  >
                    <div className="work-queue-card-body">
                      <div className="work-queue-card-heading">
                        <span>{recordNumber(record)}</span>
                        {renderStatus(record, true)}
                      </div>
                      <h3>
                        {record.title}
                      </h3>
                      <p>{record.clientName || "Unlinked client"}</p>
                      <span className="work-queue-card-source">
                        {recordSource(record)}
                      </span>
                      {kind === "quotes" && recordTrades(record).length ? (
                        <span className="queue-trade-chips">
                          {recordTrades(record).map((trade) => (
                            <span className="queue-category" key={trade}>{trade}</span>
                          ))}
                        </span>
                      ) : null}
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
                        <span>{kind === "quotes" ? "Owner" : "Assigned to"}</span>
                        <strong>{recordAssignedName(record)}</strong>
                      </div>
                    </div>
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
        <ViewportPortal>
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
                      contactId: "",
                      siteId: "",
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
              <label>
                  Point of contact {kind === "quotes" ? "" : "(optional)"}
                  <select
                    required={kind === "quotes"}
                    disabled={!form.clientId}
                    value={form.contactId}
                    onChange={(event) =>
                      setForm({ ...form, contactId: event.target.value })
                    }
                  >
                    <option value="">
                      {!form.clientId
                        ? "Select client first"
                        : clients.find((client) => client.id === form.clientId)?.contacts.length
                          ? "Select point of contact"
                          : "No contacts on this client profile"}
                    </option>
                    {(clients.find((client) => client.id === form.clientId)?.contacts ?? []).map(
                      (contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name}{contact.title ? ` - ${contact.title}` : ""}
                        </option>
                      )
                    )}
                  </select>
                </label>
              <label>
                Site (optional)
                <select
                  disabled={!form.clientId}
                  value={form.siteId}
                  onChange={(event) => setForm({ ...form, siteId: event.target.value })}
                >
                  <option value="">{form.clientId ? "No site" : "Select client first"}</option>
                  {(clients.find((client) => client.id === form.clientId)?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
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
                      const inheritedAssigneeId = project?.assignedToId &&
                        assignees.some((assignee) => assignee.id === project.assignedToId)
                        ? project.assignedToId
                        : form.assignedToId;
                      setForm({
                        ...form,
                        projectId: event.target.value,
                        clientId: project?.clientId ?? form.clientId,
                        contactId: project?.contactId ?? "",
                        siteId: project?.siteId ?? "",
                        assignedToId: inheritedAssigneeId
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
                  Assigned person
                  <select
                    value={form.assignedToId}
                    onChange={(event) =>
                      setForm({ ...form, assignedToId: event.target.value })
                    }
                  >
                    <option value="">Unassigned</option>
                    {(invoiceSource ? invoiceAssignees : assignees).map((assignee) => (
                      <option key={assignee.id} value={assignee.id}>
                        {assignee.name} · {assignee.roleLabel}
                      </option>
                    ))}
                  </select>
                </label>
              {kind === "quotes" ? (
                <fieldset className="quote-mode-fieldset">
                  <legend>Calculation mode</legend>
                  <div className="quote-mode-options">
                    {([
                      ["LEGACY", "Legacy Quote", "Enter summarized values calculated outside Pulse."],
                      ["PULSE", "Pulse Quote", "Build and calculate the quote using Pulse line items."]
                    ] as const).map(([mode, label, description]) => (
                      <label
                        className={`quote-mode-option${form.calculationMode === mode ? " selected" : ""}`}
                        key={mode}
                      >
                        <input
                          type="radio"
                          name="calculationMode"
                          required
                          checked={form.calculationMode === mode}
                          onChange={() => setForm({ ...form, calculationMode: mode })}
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
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
              )}
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
        </ViewportPortal>
      ) : null}

      {toast ? (
        <ViewportPortal>
          <div className="work-queue-toast" role="status" aria-live="polite">
            {toast}
          </div>
        </ViewportPortal>
      ) : null}
    </section>
  );
}
