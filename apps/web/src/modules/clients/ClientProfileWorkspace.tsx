"use client";

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronDown,
  Clock3,
  CreditCard,
  Edit3,
  FileText,
  FolderKanban,
  History,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  StickyNote,
  Upload,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { canUser } from "@pulse/contracts/auth";
import type {
  ClientContact,
  ClientHistoryEvent,
  ClientHistoryResponse,
  ClientRecord,
  ClientSite,
  ClientStatus
} from "@pulse/contracts/clients";
import type { RequestRecord, RequestStatus } from "@pulse/contracts/requests";
import type {
  ClientWorkSummary,
  InvoiceRecord,
  ProjectRecord,
  QuoteRecord
} from "@pulse/contracts/work";
import { AnalyticsWorkspace } from "@/components/AnalyticsWorkspace";
import { ViewportPortal } from "@/components/ViewportPortal";
import { apiFetch } from "@/lib/api/client";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  ClientProfileContactDialog,
  ClientProfileSiteDialog
} from "./ClientProfileDialogs";
import { ClientMergeDialog } from "./ClientMergeDialog";

type ClientProfileWorkspaceProps = {
  clientId: string;
};

type ClientResponse = {
  client: ClientRecord;
  redirectClientId?: string;
};

type ClientRelatedWorkResponse = {
  requests: RequestRecord[];
  quotes: QuoteRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  summary: ClientWorkSummary;
};

type ActivityResponse = {
  client: ClientRecord;
  activity: ClientHistoryEvent;
};

const clientProfileTabs = ["Work", "People & Sites", "Details", "Relationship"] as const;
type ClientProfileTab = (typeof clientProfileTabs)[number];
type ClientWorkType = "All work" | "Requests" | "Quotes" | "Projects" | "Invoices";
type ClientWorkFilter =
  | "All Records"
  | "Active Work"
  | "Completed Work"
  | "Open Requests"
  | "Closed Requests"
  | "Draft Quotes"
  | "Other Quotes"
  | "Active Projects"
  | "Closed Projects"
  | "Open Invoices"
  | "Paid / Void Invoices";

const closedRequestStatuses = new Set<RequestStatus>([
  "Converted to Quote",
  "No Bid",
  "Cancelled",
  "Duplicate"
]);
const closedQuoteStatuses = new Set(["Approved", "Rejected", "Expired", "Cancelled"]);
const closedProjectStatuses = new Set(["Completed", "Cancelled"]);
const closedInvoiceStatuses = new Set(["Paid", "Void"]);

const tabQuery: Record<ClientProfileTab, string> = {
  Work: "work",
  "People & Sites": "people",
  Details: "details",
  Relationship: "relationship"
};

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") return String(value);
  return value?.trim() || "Not captured";
}

function displayDate(value: string | null | undefined) {
  return value ? formatWorkspaceDate(value) || "Not captured" : "Not captured";
}

function displayRate(value: number | null) {
  return value === null
    ? "Not captured"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1
      }).format(value);
}

function matchesSearch(values: Array<string | number | null | undefined>, searchTerm: string) {
  if (!searchTerm) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
}

function clientStatusClass(status: ClientStatus) {
  if (status === "On Hold") return "status-pill danger";
  if (status === "Prospect") return "status-pill warning";
  return "status-pill";
}

function requestStatusClass(status: RequestStatus) {
  if (["No Bid", "Cancelled", "Duplicate"].includes(status)) return "status-pill danger";
  if (["Missing Info", "Site Visit Required", "Ready for Quote"].includes(status)) {
    return "status-pill warning";
  }
  return "status-pill";
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await apiFetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Client request failed.");
  }
  return data as T;
}

function FieldList({
  items
}: {
  items: Array<{ label: string; value: string | number | null | undefined }>;
}) {
  return (
    <dl className="client-360-field-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{compactValue(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="client-360-compact-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ClientMetricCard({
  label,
  value,
  icon,
  onClick
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="client-360-metric-card" type="button" onClick={onClick}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="client-360-metric-icon" aria-hidden="true">{icon}</span>
    </button>
  );
}

function ContactFlags({ contact }: { contact: ClientContact }) {
  const flags = [
    contact.isPrimary || contact.isPrimaryContact ? "Primary" : "",
    contact.isBilling || contact.isBillingContact ? "Billing" : "",
    contact.isTechnicalContact ? "Technical" : "",
    contact.isDecisionMaker ? "Decision maker" : ""
  ].filter(Boolean);

  return flags.length ? (
    <div className="client-360-pill-row">
      {flags.map((flag) => <span className="request-inline-flags" key={flag}>{flag}</span>)}
    </div>
  ) : null;
}

function ContactCard({
  contact,
  isFocused = false
}: {
  contact: ClientContact;
  isFocused?: boolean;
}) {
  const phone = contact.phone || contact.mobile;
  return (
    <article className={isFocused ? "client-360-list-card work-record-focused" : "client-360-list-card"}>
      <div className="client-360-list-icon" aria-hidden="true"><UserRound size={17} /></div>
      <div>
        <strong>{contact.name}</strong>
        <span>{[contact.title, contact.department].filter(Boolean).join(" · ") || "No role captured"}</span>
        {contact.siteName ? <small>Site: {contact.siteName}</small> : null}
        <ContactFlags contact={contact} />
        <div className="client-record-actions">
          {contact.email ? <a href={`mailto:${contact.email}`}><Mail size={15} />Email</a> : null}
          {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone size={15} />Call</a> : null}
        </div>
        {!contact.email && !phone ? <small>No contact method captured</small> : null}
        {contact.notes ? <p>{contact.notes}</p> : null}
      </div>
    </article>
  );
}

function SiteCard({
  site,
  canEdit,
  onEdit,
  isFocused = false
}: {
  site: ClientSite;
  canEdit: boolean;
  onEdit: (site: ClientSite) => void;
  isFocused?: boolean;
}) {
  const location = site.address || [site.city, site.state, site.country].filter(Boolean).join(", ");
  return (
    <article className={isFocused ? "client-360-list-card work-record-focused" : "client-360-list-card"}>
      <div className="client-360-list-icon" aria-hidden="true"><MapPin size={17} /></div>
      <div>
        <strong>{site.siteName}</strong>
        <span>{site.isPrimarySite ? `${site.siteType} · Primary site` : site.siteType}</span>
        <small>{location || "No address captured"}</small>
        {site.operationalHours ? <small>Hours: {site.operationalHours}</small> : null}
        <div className="client-record-actions">
          {site.googleMapsUrl ? (
            <a href={site.googleMapsUrl} target="_blank" rel="noreferrer"><MapPin size={15} />Map</a>
          ) : null}
          {canEdit ? <button type="button" onClick={() => onEdit(site)}><Edit3 size={15} />Edit</button> : null}
        </div>
        {site.accessInstructions ? <p>{site.accessInstructions}</p> : null}
      </div>
    </article>
  );
}

function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  disabled = false
) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      dialog.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    }, 0);

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog!.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [dialogRef, disabled, onClose]);
}

function ClientActivityDialog({
  client,
  actor,
  onCancel,
  onSaved
}: {
  client: ClientRecord;
  actor: string;
  onCancel: () => void;
  onSaved: (response: ActivityResponse) => void;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("Note");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useDialogFocus(dialogRef, onCancel, saving);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary.trim()) {
      setError("Enter a short summary.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const response = await requestJson<ActivityResponse>(`/api/clients/${client.id}/activities`, {
        method: "POST",
        body: JSON.stringify({ type, title: summary.trim(), detail: details.trim(), actor })
      });
      onSaved(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save activity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ViewportPortal>
      <div className="modal-backdrop client-modal-backdrop" role="presentation">
        <form
          className="client-task-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-activity-title"
          ref={dialogRef}
          onSubmit={submit}
        >
          <header className="client-task-dialog-header">
            <div><span>Client activity</span><h2 id="client-activity-title">Log activity</h2></div>
            <button className="icon-button" type="button" aria-label="Close log activity" onClick={onCancel} disabled={saving}><X size={20} /></button>
          </header>
          <div className="client-task-dialog-body">
            <label className="field-label">
              Type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {["Note", "Call", "Email", "Meeting", "Follow-up"].map((option) => (
                  <option value={option} key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              <span className="field-label-heading">
                Summary <span aria-hidden="true">*</span>
              </span>
              <input
                value={summary}
                maxLength={160}
                aria-invalid={Boolean(error && !summary.trim())}
                aria-describedby="activity-summary-error"
                onChange={(event) => {
                  setSummary(event.target.value);
                  if (event.target.value.trim()) setError("");
                }}
              />
            </label>
            {error ? <p className="field-error" id="activity-summary-error" role="alert">{error}</p> : null}
            <label className="field-label">
              <span className="field-label-heading">
                Details <span className="field-optional">Optional</span>
              </span>
              <textarea value={details} maxLength={2000} onChange={(event) => setDetails(event.target.value)} />
            </label>
          </div>
          <footer className="client-task-dialog-footer">
            <button className="toolbar-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving || !summary.trim()}>
              {saving ? "Saving…" : "Save Activity"}
            </button>
          </footer>
        </form>
      </div>
    </ViewportPortal>
  );
}

function ClientHistoryDialog({
  client,
  refreshKey,
  onCancel
}: {
  client: ClientRecord;
  refreshKey: number;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [events, setEvents] = useState<ClientHistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useDialogFocus(dialogRef, onCancel);

  async function load(append = false) {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ take: "25" });
      if (query.trim()) params.set("q", query.trim());
      if (type !== "All") params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (append && cursor) params.set("cursor", cursor);
      const response = await requestJson<ClientHistoryResponse>(
        `/api/clients/${client.id}/history?${params.toString()}`,
        { cache: "no-store" }
      );
      setEvents((current) => append ? [...current, ...response.events] : response.events);
      setTotal(response.total);
      setCursor(response.nextCursor ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load client history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 250);
    return () => window.clearTimeout(timer);
    // Filters and refresh key intentionally reload the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id, query, type, from, to, refreshKey]);

  return (
    <ViewportPortal>
      <div className="modal-backdrop client-modal-backdrop" role="presentation">
        <section
          className="client-history-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-history-title"
          ref={dialogRef}
        >
          <header className="client-history-dialog-header">
            <div>
              <span>Client record</span>
              <h2 id="client-history-title">History <small>{total}</small></h2>
            </div>
            <button className="icon-button" type="button" aria-label="Close history" onClick={onCancel}><X size={20} /></button>
          </header>
          <div className="client-history-controls">
            <label className="lead-search">
              <Search size={17} />
              <input
                aria-label="Search client history"
                placeholder="Search client history"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? <button type="button" aria-label="Clear history search" onClick={() => setQuery("")}><X size={16} /></button> : null}
            </label>
            <div className="client-history-filter-row">
              <label>Event type
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  {[
                    ["All", "All events"],
                    ["Client", "Profile edits"],
                    ["Alias", "Alternative names"],
                    ["Contact", "Contacts"],
                    ["Site", "Sites"],
                    ["Note", "Notes"],
                    ["Call", "Calls"],
                    ["Email", "Emails"],
                    ["Meeting", "Meetings"],
                    ["Follow-up", "Follow-ups"],
                    ["Import", "Imports"],
                    ["Merge", "Merges"]
                  ].map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            </div>
          </div>
          <div className="client-history-body">
            {error ? <div className="form-alert" role="alert">{error}</div> : null}
            {!loading && !events.length ? (
              <EmptyPanel
                title="No history matches these filters."
                detail="Clear the search or expand the date range."
              />
            ) : null}
            <div className="client-history-timeline" aria-live="polite">
              {events.map((event) => (
                <article className="client-history-event" key={event.id}>
                  <div className="client-history-event-icon" aria-hidden="true"><Clock3 size={16} /></div>
                  <div>
                    <div className="client-history-event-heading">
                      <span>{event.type}</span>
                      <strong>{event.title}</strong>
                    </div>
                    {event.detail ? <p>{event.detail}</p> : null}
                    <small>{event.actor} · {formatWorkspaceDate(event.createdAt, true)}</small>
                  </div>
                </article>
              ))}
            </div>
            {loading ? <p className="client-history-loading">Loading history…</p> : null}
          </div>
          {cursor ? (
            <footer className="client-history-dialog-footer">
              <button className="toolbar-button" type="button" disabled={loading} onClick={() => void load(true)}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </footer>
          ) : null}
        </section>
      </div>
    </ViewportPortal>
  );
}

function lifecycleStatusClass(type: "Request" | "Quote" | "Project" | "Invoice", status: string) {
  if (type === "Request") return requestStatusClass(status as RequestStatus);
  if (type === "Invoice" && status === "Overdue") return "status-pill danger";
  if (
    (type === "Quote" && ["Rejected", "Expired", "Cancelled"].includes(status)) ||
    (type === "Project" && status === "Cancelled") ||
    (type === "Invoice" && status === "Void")
  ) return "status-pill danger";
  if (
    (type === "Quote" && ["Draft", "Review"].includes(status)) ||
    (type === "Project" && status === "On Hold") ||
    (type === "Invoice" && ["Draft", "Review"].includes(status))
  ) return "status-pill warning";
  return "status-pill";
}

function WorkTable({
  type,
  requests,
  quotes,
  projects,
  invoices,
  hasFilters
}: {
  type: ClientWorkType;
  requests: RequestRecord[];
  quotes: QuoteRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  hasFilters: boolean;
}) {
  const workLabel = type === "All work" ? "work records" : type.toLowerCase();
  const empty = (
    <EmptyPanel
      title={hasFilters ? `No ${workLabel} match the current filters.` : `No ${workLabel} are linked yet.`}
      detail={hasFilters ? "Clear the search or choose a broader status." : "Linked records will appear here as the relationship progresses."}
    />
  );

  if (type === "All work") {
    const records = [
      ...requests.map((record) => ({
        id: `request-${record.id}`,
        type: "Request" as const,
        number: record.requestNumber,
        title: record.title,
        status: record.status,
        owner: record.assignedToName,
        value: "—",
        updatedAt: record.updatedAt,
        href: `/requests/${record.id}`
      })),
      ...quotes.map((record) => ({
        id: `quote-${record.id}`,
        type: "Quote" as const,
        number: record.quoteNumber,
        title: record.title,
        status: record.status,
        owner: record.owner,
        value: formatMoney(record.total),
        updatedAt: record.updatedAt,
        href: `/quotes/${record.id}`
      })),
      ...projects.map((record) => ({
        id: `project-${record.id}`,
        type: "Project" as const,
        number: record.projectNumber,
        title: record.title,
        status: record.status,
        owner: record.assignedTo?.name ?? "Unassigned",
        value: formatMoney(record.budget),
        updatedAt: record.updatedAt,
        href: `/projects/${record.id}`
      })),
      ...invoices.map((record) => ({
        id: `invoice-${record.id}`,
        type: "Invoice" as const,
        number: record.invoiceNumber,
        title: record.title,
        status: record.status,
        owner: record.assignedTo?.name ?? "Unassigned",
        value: formatMoney(record.amount),
        updatedAt: record.updatedAt,
        href: `/billing/${record.id}`
      }))
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (!records.length) return empty;
    return (
      <div className="client-work-table-wrap">
        <table className="data-table client-360-table">
          <thead><tr><th>Stage</th><th>Record</th><th>Status</th><th>Owner</th><th>Value</th><th>Updated</th><th /></tr></thead>
          <tbody>{records.map((record) => (
            <tr key={record.id}>
              <td data-label="Stage"><span className="client-lifecycle-stage">{record.type}</span></td>
              <td data-label="Record"><Link href={record.href}><strong>{record.number}</strong></Link><br /><span className="table-muted">{record.title}</span></td>
              <td data-label="Status"><span className={lifecycleStatusClass(record.type, record.status)}>{record.status}</span></td>
              <td data-label="Owner">{record.owner}</td>
              <td data-label="Value">{record.value}</td>
              <td data-label="Updated">{displayDate(record.updatedAt)}</td>
              <td><Link className="toolbar-button compact" href={record.href}>Open</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  if (type === "Requests") {
    if (!requests.length) return empty;
    return (
      <div className="client-work-table-wrap">
        <table className="data-table client-360-table">
          <thead><tr><th>Request</th><th>Status</th><th>Type</th><th>Category</th><th>Owner</th><th>Received</th><th /></tr></thead>
          <tbody>{requests.map((request) => (
            <tr key={request.id}>
              <td data-label="Request"><strong>{request.requestNumber}</strong><br /><span className="table-muted">{request.title}</span></td>
              <td data-label="Status"><span className={requestStatusClass(request.status)}>{request.status}</span></td>
              <td data-label="Type">{request.requestType}</td>
              <td data-label="Category">{request.serviceCategories.join(", ")}</td>
              <td data-label="Owner">{request.assignedToName}</td>
              <td data-label="Received">{displayDate(request.receivedDate)}</td>
              <td><Link className="toolbar-button compact" href={`/requests/${request.id}`}>Open</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  if (type === "Quotes") {
    if (!quotes.length) return empty;
    return (
      <div className="client-work-table-wrap">
        <table className="data-table client-360-table">
          <thead><tr><th>Quote</th><th>Status</th><th>Owner</th><th>Total</th><th>Created from</th><th>Updated</th></tr></thead>
          <tbody>{quotes.map((quote) => (
            <tr key={quote.id}>
              <td data-label="Quote"><Link href={`/quotes/${quote.id}`}><strong>{quote.quoteNumber}</strong></Link><br /><span className="table-muted">{quote.title}</span></td>
              <td data-label="Status"><span className={quote.status === "Draft" ? "status-pill warning" : "status-pill"}>{quote.status}</span></td>
              <td data-label="Owner">{quote.owner}</td>
              <td data-label="Total">{formatMoney(quote.total)}</td>
              <td data-label="Created from">{quote.requestId ? <Link href={`/requests/${quote.requestId}`}>{quote.requestNumber}</Link> : "Manual quote"}</td>
              <td data-label="Updated">{displayDate(quote.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  if (type === "Projects") {
    if (!projects.length) return empty;
    return (
      <div className="client-work-table-wrap">
        <table className="data-table client-360-table">
          <thead><tr><th>Project</th><th>Status</th><th>Owner</th><th>Budget</th><th>Source quote</th><th>Due</th></tr></thead>
          <tbody>{projects.map((project) => (
            <tr key={project.id}>
              <td data-label="Project"><strong>{project.projectNumber}</strong><br /><span className="table-muted">{project.title}</span></td>
              <td data-label="Status"><span className={project.status === "On Hold" ? "status-pill warning" : "status-pill"}>{project.status}</span></td>
              <td data-label="Owner">{project.assignedTo?.name ?? "Unassigned"}</td>
              <td data-label="Budget">{formatMoney(project.budget)}</td>
              <td data-label="Source quote">{project.quoteNumber || "Manual project"}</td>
              <td data-label="Due">{displayDate(project.dueDate)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  if (!invoices.length) return empty;
  return (
    <div className="client-work-table-wrap">
      <table className="data-table client-360-table">
        <thead><tr><th>Invoice</th><th>Status</th><th>Owner</th><th>Amount</th><th>Project</th><th>Issued</th><th>Due</th></tr></thead>
        <tbody>{invoices.map((invoice) => (
          <tr key={invoice.id}>
            <td data-label="Invoice"><strong>{invoice.invoiceNumber}</strong><br /><span className="table-muted">{invoice.title}</span></td>
            <td data-label="Status"><span className={invoice.status === "Overdue" ? "status-pill danger" : invoice.status === "Draft" || invoice.status === "Review" ? "status-pill warning" : "status-pill"}>{invoice.status}</span></td>
            <td data-label="Owner">{invoice.assignedTo?.name ?? "Unassigned"}</td>
            <td data-label="Amount">{formatMoney(invoice.amount)}</td>
            <td data-label="Project">{invoice.projectNumber || "No project"}</td>
            <td data-label="Issued">{displayDate(invoice.issuedDate)}</td>
            <td data-label="Due">{displayDate(invoice.dueDate)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function ClientProfileWorkspace({ clientId }: ClientProfileWorkspaceProps) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [workSummary, setWorkSummary] = useState<ClientWorkSummary>({
    activeRequests: 0,
    activeQuotes: 0,
    activeProjects: 0,
    outstandingInvoiceBalance: 0,
    revisionRequests: 0,
    revisedQuotes: 0,
    revisionRate: null,
    averageRevisions: null
  });
  const [activeTab, setActiveTab] = useState<ClientProfileTab>("Work");
  const [workType, setWorkType] = useState<ClientWorkType>("All work");
  const [workspaceFilter, setWorkspaceFilter] = useState<ClientWorkFilter>("All Records");
  const [profileSearch, setProfileSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [relatedWorkError, setRelatedWorkError] = useState("");
  const [message, setMessage] = useState("");
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [historyOpenedHere, setHistoryOpenedHere] = useState(false);
  const [profileDialog, setProfileDialog] = useState<"contact" | "site" | null>(null);
  const [siteToEdit, setSiteToEdit] = useState<ClientSite | null>(null);
  const [focusedRecord, setFocusedRecord] = useState("");
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const canWriteClients = canUser(user, "clients:write");
  const canWriteActivity = canUser(user, "activity:write");

  useEffect(() => {
    async function loadClientProfile() {
      try {
        setLoading(true);
        setLoadError("");
        setRelatedWorkError("");
        const clientData = await requestJson<ClientResponse>(`/api/clients/${clientId}`, { cache: "no-store" });
        setClient(clientData.client);
        const resolvedClientId = clientData.redirectClientId ?? clientId;
        if (clientData.redirectClientId) router.replace(`/clients/${clientData.redirectClientId}`);
        try {
          const related = await requestJson<ClientRelatedWorkResponse>(
            `/api/clients/${resolvedClientId}/related-work`,
            { cache: "no-store" }
          );
          setRequests(related.requests);
          setQuotes(related.quotes);
          setProjects(related.projects);
          setInvoices(related.invoices);
          setWorkSummary(related.summary);
        } catch (caught) {
          setRelatedWorkError(caught instanceof Error ? caught.message : "Unable to load related work.");
        }
      } catch (caught) {
        setLoadError(caught instanceof Error ? caught.message : "Unable to load this client.");
        setClient(null);
      } finally {
        setLoading(false);
      }
    }
    void loadClientProfile();
  }, [clientId, router]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    const mapped = clientProfileTabs.find((tab) => tabQuery[tab] === requestedTab);
    const contactId = searchParams.get("contact");
    if (mapped) setActiveTab(mapped);
    else if (requestedTab === "contacts" || contactId) setActiveTab("People & Sites");
    else setActiveTab("Work");
    if (contactId) setFocusedRecord(contactId);
    setHistoryOpen(searchParams.get("history") === "1");
  }, [searchParams]);

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      setHistoryOpen(params.get("history") === "1");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!editMenuOpen && !moreActionsOpen) return;
    function dismiss(event: MouseEvent) {
      const target = event.target as Node;
      if (!editMenuRef.current?.contains(target)) setEditMenuOpen(false);
      if (!moreMenuRef.current?.contains(target)) setMoreActionsOpen(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setEditMenuOpen(false);
        setMoreActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [editMenuOpen, moreActionsOpen]);

  useEffect(() => {
    if (!focusedRecord) return;
    const timer = window.setTimeout(() => setFocusedRecord(""), 2400);
    return () => window.clearTimeout(timer);
  }, [focusedRecord]);

  function selectTab(tab: ClientProfileTab) {
    setActiveTab(tab);
    setWorkspaceFilter("All Records");
    setProfileSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabQuery[tab]);
    window.history.replaceState(window.history.state, "", url);
  }

  function openHistory() {
    setMoreActionsOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("history", "1");
    window.history.pushState({ ...window.history.state, clientHistoryModal: true }, "", url);
    setHistoryOpenedHere(true);
    setHistoryOpen(true);
  }

  function closeHistory() {
    if (historyOpenedHere && window.history.state?.clientHistoryModal) {
      window.history.back();
      setHistoryOpenedHere(false);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("history");
    window.history.replaceState(window.history.state, "", url);
    setHistoryOpen(false);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % clientProfileTabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + clientProfileTabs.length) % clientProfileTabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = clientProfileTabs.length - 1;
    selectTab(clientProfileTabs[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  const normalizedSearch = profileSearch.trim().toLowerCase();
  const filteredRequests = useMemo(() => requests.filter((request) => {
    const filterMatches = workspaceFilter === "Open Requests"
      ? !closedRequestStatuses.has(request.status)
      : workspaceFilter === "Closed Requests"
        ? closedRequestStatuses.has(request.status)
        : workspaceFilter === "Active Work"
          ? !closedRequestStatuses.has(request.status)
          : workspaceFilter === "Completed Work"
            ? closedRequestStatuses.has(request.status)
        : true;
    return filterMatches && matchesSearch(
      [request.requestNumber, request.title, request.status, request.requestType, ...request.serviceCategories, request.assignedToName],
      normalizedSearch
    );
  }), [normalizedSearch, requests, workspaceFilter]);
  const filteredQuotes = useMemo(() => quotes.filter((quote) => {
    const closed = closedQuoteStatuses.has(quote.status);
    const filterMatches = workspaceFilter === "Draft Quotes"
      ? quote.status === "Draft"
      : workspaceFilter === "Other Quotes"
        ? quote.status !== "Draft"
        : workspaceFilter === "Active Work"
          ? !closed
          : workspaceFilter === "Completed Work"
            ? closed
        : true;
    return filterMatches && matchesSearch(
      [quote.quoteNumber, quote.title, quote.status, quote.owner, quote.requestNumber, quote.total],
      normalizedSearch
    );
  }), [normalizedSearch, quotes, workspaceFilter]);
  const filteredProjects = useMemo(() => projects.filter((project) => {
    const closed = closedProjectStatuses.has(project.status);
    const filterMatches = workspaceFilter === "Active Projects"
      ? !closed
      : workspaceFilter === "Closed Projects"
        ? closed
        : workspaceFilter === "Active Work"
          ? !closed
          : workspaceFilter === "Completed Work"
            ? closed
        : true;
    return filterMatches && matchesSearch(
      [project.projectNumber, project.title, project.status, project.assignedTo?.name, project.quoteNumber],
      normalizedSearch
    );
  }), [normalizedSearch, projects, workspaceFilter]);
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    const closed = closedInvoiceStatuses.has(invoice.status);
    const filterMatches = workspaceFilter === "Open Invoices"
      ? !closed
      : workspaceFilter === "Paid / Void Invoices"
        ? closed
        : workspaceFilter === "Active Work"
          ? !closed
          : workspaceFilter === "Completed Work"
            ? closed
        : true;
    return filterMatches && matchesSearch(
      [invoice.invoiceNumber, invoice.title, invoice.status, invoice.assignedTo?.name, invoice.projectNumber],
      normalizedSearch
    );
  }), [invoices, normalizedSearch, workspaceFilter]);
  const filteredContacts = useMemo(() => (client?.contacts ?? []).filter((contact) => matchesSearch(
    [contact.name, contact.title, contact.department, contact.email, contact.phone, contact.mobile, contact.siteName],
    normalizedSearch
  )), [client?.contacts, normalizedSearch]);
  const filteredSites = useMemo(() => (client?.sites ?? []).filter((site) => matchesSearch(
    [site.siteName, site.siteType, site.address, site.city, site.state, site.country],
    normalizedSearch
  )), [client?.sites, normalizedSearch]);

  const workFilters = useMemo<ClientWorkFilter[]>(() => {
    if (workType === "All work") return ["All Records", "Active Work", "Completed Work"];
    if (workType === "Requests") return ["All Records", "Open Requests", "Closed Requests"];
    if (workType === "Quotes") return ["All Records", "Draft Quotes", "Other Quotes"];
    if (workType === "Projects") return ["All Records", "Active Projects", "Closed Projects"];
    return ["All Records", "Open Invoices", "Paid / Void Invoices"];
  }, [workType]);

  const lifecycleEvents = useMemo(() => [
    ...requests.map((record) => ({ id: `request-${record.id}`, type: "Request", title: `${record.requestNumber} · ${record.title}`, detail: record.status, date: record.receivedDate })),
    ...quotes.map((record) => ({ id: `quote-${record.id}`, type: "Quote", title: `${record.quoteNumber} · ${record.title}`, detail: record.status, date: record.updatedAt })),
    ...projects.map((record) => ({ id: `project-${record.id}`, type: "Project", title: `${record.projectNumber} · ${record.title}`, detail: record.status, date: record.dueDate })),
    ...invoices.map((record) => ({ id: `invoice-${record.id}`, type: "Invoice", title: `${record.invoiceNumber} · ${record.title}`, detail: record.status, date: record.issuedDate }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [invoices, projects, quotes, requests]);

  async function importClientInfo() {
    if (!client || !canWriteClients) return;
    try {
      setMoreActionsOpen(false);
      const data = await requestJson<ClientResponse>(`/api/clients/${client.id}/import`, {
        method: "POST",
        body: JSON.stringify({ source: "Manual profile import", actor: user?.name ?? "Pulse User" })
      });
      setClient(data.client);
      setHistoryRefreshKey((key) => key + 1);
      setMessage(`${data.client.displayName} client info import recorded.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to record client import.");
    }
  }

  if (loading) return <div className="lead-empty-state">Loading client profile…</div>;
  if (!client) {
    return (
      <div className="lead-empty-state">
        <strong>{loadError || "Client not found."}</strong>
        <Link className="toolbar-button compact" href="/clients">Back to clients</Link>
      </div>
    );
  }

  const primaryContact = client.contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact);
  const primarySite = client.sites.find((site) => site.isPrimarySite) ?? client.sites[0];
  const aliases = client.aliases;
  const normalizedIdentityNames = new Set([client.displayName, client.legalName]
    .filter(Boolean)
    .map((name) => name.trim().toLocaleLowerCase()));
  const identityAliases = aliases.filter((alias) => !normalizedIdentityNames.has(alias.name.trim().toLocaleLowerCase()));
  const visibleAliases = identityAliases.slice(0, 3);
  const remainingAliases = Math.max(0, identityAliases.length - visibleAliases.length);
  const activeResultCount =
    workType === "All work" ? filteredRequests.length + filteredQuotes.length + filteredProjects.length + filteredInvoices.length :
    workType === "Requests" ? filteredRequests.length :
    workType === "Quotes" ? filteredQuotes.length :
    workType === "Projects" ? filteredProjects.length :
    filteredInvoices.length;

  return (
    <section className="client-360-page">
      <header className="client-record-header">
        <div className="client-record-identity">
          <div className="client-record-title-line">
            <Link className="client-record-back" href="/clients" aria-label="Back to clients" title="Back to clients">
              <ArrowLeft size={18} />
            </Link>
            <h1>{client.displayName}</h1>
            <span className="client-record-number">{client.clientNumber}</span>
          </div>
          <div className="client-record-support-line">
            {client.legalName && client.legalName !== client.displayName ? <p>Legal name: {client.legalName}</p> : null}
            {identityAliases.length ? (
              <div className="client-record-aliases" aria-label="Alternative names">
                {visibleAliases.map((alias) => <span key={alias.id || alias.name}>{alias.name}</span>)}
                {remainingAliases ? (
                  <button type="button" onClick={() => {
                    selectTab("Details");
                    window.setTimeout(() => document.getElementById("identity-names")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                  }}>+{remainingAliases} more</button>
                ) : null}
              </div>
            ) : null}
            <div className="client-record-meta-row">
              <span className={clientStatusClass(client.status)}>{client.status}</span>
              <span className="client-record-meta-pill">
                <Building2 size={14} aria-hidden="true" />
                <small>Industry</small>
                <strong>{compactValue(client.industry)}</strong>
              </span>
              <span className="client-record-meta-pill">
                <UserRound size={14} aria-hidden="true" />
                <small>Owner</small>
                <strong>{client.accountOwner}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="client-360-actions">
          {canWriteClients ? (
            <div className="client-edit-split" ref={editMenuRef}>
              <Link className="client-edit-split-main" href={`/directory/clients/${client.id}/edit`}><Edit3 size={16} />Edit Client</Link>
              {canWriteActivity ? (
                <button
                  className="client-edit-split-menu"
                  type="button"
                  aria-label="More edit client actions"
                  aria-haspopup="menu"
                  aria-expanded={editMenuOpen}
                  onClick={() => setEditMenuOpen((open) => !open)}
                ><ChevronDown size={17} /></button>
              ) : null}
              {editMenuOpen ? (
                <div className="mini-popover client-360-actions-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => {
                    setEditMenuOpen(false);
                    setActivityDialogOpen(true);
                  }}><StickyNote size={16} />Log Activity</button>
                </div>
              ) : null}
            </div>
          ) : canWriteActivity ? (
            <button className="toolbar-button" type="button" onClick={() => setActivityDialogOpen(true)}><StickyNote size={16} />Log Activity</button>
          ) : null}
          <div className="client-360-more-actions" ref={moreMenuRef}>
            <button
              className="toolbar-button compact"
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreActionsOpen}
              onClick={() => setMoreActionsOpen((open) => !open)}
            ><MoreHorizontal size={16} />More</button>
            {moreActionsOpen ? (
              <div className="mini-popover client-360-actions-menu" role="menu">
                <button type="button" role="menuitem" onClick={openHistory}><History size={16} />History</button>
                {canWriteClients ? <button type="button" role="menuitem" onClick={() => void importClientInfo()}><Upload size={16} />Record import</button> : null}
                {user?.isSystemAdmin ? (
                  <>
                    <hr />
                    <button className="danger-menu-item" type="button" role="menuitem" onClick={() => {
                      setMoreActionsOpen(false);
                      setIsMergeDialogOpen(true);
                    }}><Building2 size={16} />Combine with another client</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <section className="client-360-metric-grid client-record-highlights" aria-label="Operational highlights">
          <ClientMetricCard label="Open requests" value={workSummary.activeRequests} icon={<FileText size={19} />} onClick={() => {
            selectTab("Work"); setWorkType("Requests"); setWorkspaceFilter("Open Requests");
          }} />
          <ClientMetricCard label="Active quotes" value={workSummary.activeQuotes} icon={<ReceiptText size={19} />} onClick={() => {
            selectTab("Work"); setWorkType("Quotes"); setWorkspaceFilter("Other Quotes");
          }} />
          <ClientMetricCard label="Active projects" value={workSummary.activeProjects} icon={<FolderKanban size={19} />} onClick={() => {
            selectTab("Work"); setWorkType("Projects"); setWorkspaceFilter("Active Projects");
          }} />
          <ClientMetricCard label="Outstanding balance" value={formatMoney(workSummary.outstandingInvoiceBalance)} icon={<CreditCard size={19} />} onClick={() => {
            selectTab("Work"); setWorkType("Invoices"); setWorkspaceFilter("Open Invoices");
          }} />
        </section>
      </header>

      {message ? <div className="form-alert" role="status">{message}</div> : null}
      {relatedWorkError ? <div className="form-alert">Related work is unavailable: {relatedWorkError}</div> : null}

      <section className="client-360-tabs-panel">
        <div className="lead-view-tabs client-360-tabs" role="tablist" aria-label="Client workspace sections">
          {clientProfileTabs.map((tab, index) => (
            <button
              id={`client-tab-${tabQuery[tab]}`}
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`client-panel-${tabQuery[tab]}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={activeTab === tab ? "lead-view-tab active" : "lead-view-tab"}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => selectTab(tab)}
            >{tab}</button>
          ))}
        </div>

        {activeTab === "Work" ? (
          <div className="client-360-tab-content" role="tabpanel" id="client-panel-work" aria-labelledby="client-tab-work">
            <div className="client-360-work-switcher" role="tablist" aria-label="Work record type">
              {([
                ["All work", requests.length + quotes.length + projects.length + invoices.length],
                ["Requests", requests.length],
                ["Quotes", quotes.length],
                ["Projects", projects.length],
                ["Invoices", invoices.length]
              ] as Array<[ClientWorkType, number]>).map(([type, count]) => (
                <button key={type} type="button" role="tab" aria-selected={workType === type} className={workType === type ? "active" : ""} onClick={() => {
                  setWorkType(type); setWorkspaceFilter("All Records"); setProfileSearch("");
                }}>{type}<span>{count}</span></button>
              ))}
            </div>
            <div className="client-context-toolbar">
              <label className="lead-search client-360-search"><Search size={17} />
                <input aria-label={`Search client ${workType.toLowerCase()}`} placeholder={`Search ${workType.toLowerCase()}`} value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} />
                {profileSearch ? <button type="button" aria-label={`Clear ${workType.toLowerCase()} search`} onClick={() => setProfileSearch("")}><X size={16} /></button> : null}
              </label>
              <label className="client-360-filter-control"><SlidersHorizontal size={16} />
                <select aria-label={`Filter ${workType.toLowerCase()} by status`} value={workspaceFilter} onChange={(event) => setWorkspaceFilter(event.target.value as ClientWorkFilter)}>
                  {workFilters.map((filter) => <option key={filter}>{filter}</option>)}
                </select>
              </label>
              <span className="client-360-result-count">{activeResultCount} records</span>
            </div>
            {workType === "Quotes" ? (
              <section className="client-quote-revision-strip" aria-label="Quote revision metrics">
                <div><span>Revision requests</span><strong>{workSummary.revisionRequests}</strong></div>
                <div><span>Quotes revised</span><strong>{workSummary.revisedQuotes}</strong></div>
                <div><span>Revision rate</span><strong>{displayRate(workSummary.revisionRate)}</strong></div>
                <div><span>Average revisions</span><strong>{workSummary.averageRevisions === null ? "Not captured" : workSummary.averageRevisions.toFixed(1)}</strong></div>
              </section>
            ) : null}
            <WorkTable
              type={workType}
              requests={filteredRequests}
              quotes={filteredQuotes}
              projects={filteredProjects}
              invoices={filteredInvoices}
              hasFilters={Boolean(profileSearch || workspaceFilter !== "All Records")}
            />
          </div>
        ) : null}

        {activeTab === "People & Sites" ? (
          <div className="client-360-tab-content" role="tabpanel" id="client-panel-people" aria-labelledby="client-tab-people">
            <section className="client-operational-strip client-people-primary-strip" aria-label="Primary people and sites">
              <article>
                <UserRound size={17} aria-hidden="true" />
                <div><span>Primary contact</span><strong>{primaryContact?.name || "Not captured"}</strong>
                  {primaryContact?.email ? <a href={`mailto:${primaryContact.email}`}>{primaryContact.email}</a> : null}
                  {primaryContact?.phone || primaryContact?.mobile ? <small>{primaryContact.phone || primaryContact.mobile}</small> : null}
                </div>
              </article>
              <article>
                <MapPin size={17} aria-hidden="true" />
                <div><span>Primary site</span><strong>{primarySite?.siteName || client.primarySite || "Not captured"}</strong>
                  <small>{primarySite?.address || "No address captured"}</small>
                </div>
              </article>
            </section>
            <div className="client-context-toolbar">
              <label className="lead-search client-360-search"><Search size={17} />
                <input aria-label="Search contacts and sites" placeholder="Search contacts and sites" value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} />
                {profileSearch ? <button type="button" aria-label="Clear contacts and sites search" onClick={() => setProfileSearch("")}><X size={16} /></button> : null}
              </label>
              <span className="client-360-result-count">{filteredContacts.length + filteredSites.length} records</span>
            </div>
            <div className="client-360-two-column">
              <section className="client-360-tab-card">
                <div className="client-360-card-heading">
                  <h2>Contacts <span>{client.contacts.length}</span></h2>
                  {canWriteClients ? <button className="toolbar-button compact" type="button" onClick={() => setProfileDialog("contact")}><Plus size={16} />Add Contact</button> : null}
                </div>
                <div className="client-360-list-stack">
                  {filteredContacts.length ? filteredContacts.map((contact) => (
                    <ContactCard contact={contact} isFocused={focusedRecord === contact.id || focusedRecord === contact.name} key={contact.id || contact.name} />
                  )) : <EmptyPanel title={client.contacts.length ? "No contacts match this search." : "No contacts captured yet."} detail="Add a contact to make key people immediately reachable." />}
                </div>
              </section>
              <section className="client-360-tab-card">
                <div className="client-360-card-heading">
                  <h2>Sites <span>{client.sites.length}</span></h2>
                  {canWriteClients ? <button className="toolbar-button compact" type="button" onClick={() => setProfileDialog("site")}><Plus size={16} />Add Site</button> : null}
                </div>
                <div className="client-360-list-stack">
                  {filteredSites.length ? filteredSites.map((site) => (
                    <SiteCard site={site} canEdit={canWriteClients} isFocused={focusedRecord === site.siteName} onEdit={setSiteToEdit} key={site.id || site.siteName} />
                  )) : <EmptyPanel title={client.sites.length ? "No sites match this search." : "No sites captured yet."} detail="Add a site to keep service locations easy to find." />}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "Details" ? (
          <div className="client-360-tab-content client-details-sections" role="tabpanel" id="client-panel-details" aria-labelledby="client-tab-details">
            <section className="client-360-tab-card client-details-attention">
              <h2>Requirements & Notes</h2>
              <FieldList items={[
                { label: "Critical requirement", value: client.purchaseOrderRequired ? "Purchase order required" : "No purchase order requirement" },
                { label: "Documentation requirements", value: client.documentationRequirements },
                { label: "Important note", value: client.importantNotes || client.generalNotes }
              ]} />
            </section>
            <section className="client-360-tab-card" id="identity-names">
              <h2>Identity & Names</h2>
              <FieldList items={[
                { label: "Display name", value: client.displayName },
                { label: "Legal name", value: client.legalName },
                { label: "Client number", value: client.clientNumber },
                { label: "Industry", value: client.industry },
                { label: "Website", value: client.website }
              ]} />
              <div className="client-details-aliases">
                <h3>Alternative names</h3>
                {aliases.length ? aliases.map((alias) => (
                  <span key={alias.id || alias.name}>{alias.name}<small>{alias.source}</small></span>
                )) : <p>Not captured</p>}
              </div>
            </section>
            <section className="client-360-tab-card">
              <h2>Account & Relationship Ownership</h2>
              <FieldList items={[
                { label: "Status", value: client.status },
                { label: "Account owner", value: client.accountOwner },
                { label: "Source", value: client.source },
                { label: "Preferred language", value: client.preferredLanguage },
                { label: "Open opportunities", value: client.openOpportunities },
                { label: "Client since", value: displayDate(client.createdAt) }
              ]} />
            </section>
            <section className="client-360-tab-card">
              <h2>Billing & Compliance</h2>
              <FieldList items={[
                { label: "Payment terms", value: client.paymentTerms },
                { label: "Preferred currency", value: client.preferredCurrency },
                { label: "Tax ID", value: client.taxId },
                { label: "Purchase order required", value: client.purchaseOrderRequired ? "Yes" : "No" },
                { label: "Invoice requirements", value: client.invoiceRequirements },
                { label: "Insurance requirements", value: client.insuranceRequirements },
                { label: "Documentation requirements", value: client.documentationRequirements }
              ]} />
            </section>
            <section className="client-360-tab-card">
              <h2>Service & Technology</h2>
              <FieldList items={[
                { label: "Service profile", value: client.serviceProfile.join(", ") },
                { label: "Brand preferences", value: client.brandPreferences },
                { label: "Technology preferences", value: client.technologyPreferences },
                { label: "Preferred vendors", value: client.preferredVendors },
                { label: "Camera", value: client.preferredCameraBrand },
                { label: "Access control", value: client.preferredAccessControlBrand },
                { label: "Network", value: client.preferredNetworkBrand },
                { label: "Cabling", value: client.preferredCablingBrand },
                { label: "Standard technologies", value: client.standardTechnologies }
              ]} />
            </section>
            <section className="client-360-tab-card">
              <h2>Record and Merge Information</h2>
              <FieldList items={[
                { label: "Created", value: displayDate(client.createdAt) },
                { label: "Updated", value: displayDate(client.updatedAt) },
                { label: "Merged records", value: client.mergedFrom.length }
              ]} />
              {client.mergedFrom.map((source) => (
                <p className="client-merge-source" key={source.id}>{source.clientNumber} · {source.displayName} · merged {displayDate(source.mergedAt)}</p>
              ))}
            </section>
          </div>
        ) : null}

        {activeTab === "Relationship" ? (
          <div className="client-360-tab-content client-relationship-content" role="tabpanel" id="client-panel-relationship" aria-labelledby="client-tab-relationship">
            <AnalyticsWorkspace embeddedClientId={client.id} clientSince={client.createdAt} />
            <section className="client-relationship-timeline">
              <div className="client-relationship-heading">
                <div><span>Operational lifecycle</span><h2>Relationship timeline</h2></div>
                <p>Requests, quotes, projects, and invoices show how this commercial relationship progressed.</p>
              </div>
              {lifecycleEvents.length ? (
                <div className="client-history-timeline">
                  {lifecycleEvents.map((event) => (
                    <article className="client-history-event" key={event.id}>
                      <div className="client-history-event-icon" aria-hidden="true"><CalendarClock size={16} /></div>
                      <div><div className="client-history-event-heading"><span>{event.type}</span><strong>{event.title}</strong></div><p>{event.detail}</p><small>{displayDate(event.date)}</small></div>
                    </article>
                  ))}
                </div>
              ) : <EmptyPanel title="No lifecycle events yet." detail="Requests, quotes, projects, and invoices will appear here." />}
            </section>
          </div>
        ) : null}
      </section>

      {activityDialogOpen ? (
        <ClientActivityDialog
          client={client}
          actor={user?.name ?? "Pulse User"}
          onCancel={() => setActivityDialogOpen(false)}
          onSaved={(response) => {
            setClient(response.client);
            setActivityDialogOpen(false);
            setHistoryRefreshKey((key) => key + 1);
            setMessage("Activity saved to client history.");
          }}
        />
      ) : null}
      {historyOpen ? <ClientHistoryDialog client={client} refreshKey={historyRefreshKey} onCancel={closeHistory} /> : null}
      {profileDialog === "contact" ? (
        <ClientProfileContactDialog client={client} onCancel={() => setProfileDialog(null)} onSaved={(nextClient, contactName) => {
          setClient(nextClient); setProfileDialog(null); selectTab("People & Sites"); setFocusedRecord(contactName); setHistoryRefreshKey((key) => key + 1); setMessage(`${contactName} was added.`);
        }} />
      ) : null}
      {profileDialog === "site" ? (
        <ClientProfileSiteDialog client={client} onCancel={() => setProfileDialog(null)} onSaved={(nextClient, siteName) => {
          setClient(nextClient); setProfileDialog(null); selectTab("People & Sites"); setFocusedRecord(siteName); setHistoryRefreshKey((key) => key + 1); setMessage(`${siteName} was added.`);
        }} />
      ) : null}
      {siteToEdit ? (
        <ClientProfileSiteDialog client={client} site={siteToEdit} onCancel={() => setSiteToEdit(null)} onSaved={(nextClient, siteName) => {
          setClient(nextClient); setSiteToEdit(null); setFocusedRecord(siteName); setHistoryRefreshKey((key) => key + 1); setMessage(`${siteName} was updated.`);
        }} />
      ) : null}
      {isMergeDialogOpen ? (
        <ClientMergeDialog currentClient={client} onCancel={() => setIsMergeDialogOpen(false)} onMerged={(mergedClient) => {
          setClient(mergedClient); setIsMergeDialogOpen(false); setHistoryRefreshKey((key) => key + 1); setMessage(`${mergedClient.displayName} now contains the consolidated records.`); router.replace(`/clients/${mergedClient.id}`); router.refresh();
        }} />
      ) : null}
    </section>
  );
}
