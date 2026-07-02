"use client";

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  Edit3,
  FileText,
  FolderKanban,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  ReceiptText,
  Save,
  Search,
  SlidersHorizontal,
  StickyNote,
  Upload,
  UserRound
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { RequestRecord, RequestStatus } from "@/types/request";
import {
  formatMoney,
  type ClientActivity,
  type ClientContact,
  type ClientQuoteSummary,
  type ClientRecord,
  type ClientSite,
  type ClientStatus
} from "./clientData";

type ClientProfileWorkspaceProps = {
  clientId: string;
};

type ClientResponse = {
  client: ClientRecord;
};

type ClientRelatedWorkResponse = {
  requests: RequestRecord[];
  quotes: ClientQuoteSummary[];
};

const clientProfileTabs = [
  "Overview",
  "Requests",
  "Quotes",
  "Projects",
  "Invoices",
  "Contacts & Sites",
  "Activity",
  "Preferences"
] as const;

type ClientProfileTab = (typeof clientProfileTabs)[number];

const closedRequestStatuses = new Set<RequestStatus>([
  "Converted to Quote",
  "No Bid",
  "Cancelled",
  "Duplicate"
]);

const closedQuoteStatuses = new Set(["Accepted", "Won", "Lost", "Expired", "Cancelled", "Rejected"]);

const clientWorkFilters = [
  "All Records",
  "Open Requests",
  "Closed Requests",
  "Draft Quotes",
  "Other Quotes"
] as const;

type ClientWorkFilter = (typeof clientWorkFilters)[number];

function clientStatusClass(status: ClientStatus) {
  if (status === "On Hold") {
    return "status-pill danger";
  }

  if (status === "Prospect") {
    return "status-pill warning";
  }

  return "status-pill";
}

function requestStatusClass(status: RequestStatus) {
  if (["No Bid", "Cancelled", "Duplicate"].includes(status)) {
    return "status-pill danger";
  }

  if (["Missing Info", "Site Visit Required", "Ready for Quote"].includes(status)) {
    return "status-pill warning";
  }

  return "status-pill";
}

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return value?.trim() || "Not captured";
}

function displayDate(value: string) {
  if (!value) {
    return "No activity";
  }

  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function websiteHref(website: string) {
  if (!website) {
    return "";
  }

  return website.startsWith("http") ? website : `https://${website}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function matchesSearch(values: Array<string | number | null | undefined>, searchTerm: string) {
  if (!searchTerm) {
    return true;
  }

  return values.some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
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

function ClientMetricCard({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <article className="client-360-metric-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="client-360-metric-icon">{icon}</div>
    </article>
  );
}

function ProfileSection({
  title,
  icon,
  children
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="client-360-profile-section">
      <div className="client-360-section-heading">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function FieldList({
  items
}: {
  items: Array<{
    label: string;
    value: string | number | null | undefined;
  }>;
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

function ContactFlags({ contact }: { contact: ClientContact }) {
  const flags = [
    contact.isPrimary || contact.isPrimaryContact ? "Primary" : "",
    contact.isBilling || contact.isBillingContact ? "Billing" : "",
    contact.isTechnicalContact ? "Technical" : "",
    contact.isDecisionMaker ? "Decision Maker" : ""
  ].filter(Boolean);

  if (!flags.length) {
    return null;
  }

  return (
    <div className="client-360-pill-row">
      {flags.map((flag) => (
        <span className="request-inline-flags" key={flag}>
          {flag}
        </span>
      ))}
    </div>
  );
}

function ContactCard({ contact }: { contact: ClientContact }) {
  return (
    <article className="client-360-list-card">
      <div className="client-360-list-icon">
        <UserRound size={17} />
      </div>
      <div>
        <strong>{contact.name}</strong>
        <span>{[contact.title, contact.department].filter(Boolean).join(" - ") || "No role captured"}</span>
        <small>
          {compactValue(contact.email)} / {compactValue(contact.phone || contact.mobile)}
        </small>
        {contact.siteName ? <small>Site: {contact.siteName}</small> : null}
        <ContactFlags contact={contact} />
        {contact.notes ? <p>{contact.notes}</p> : null}
      </div>
    </article>
  );
}

function ContactSummary({ contact }: { contact: ClientContact }) {
  return (
    <div className="client-360-compact-summary">
      <strong>{contact.name}</strong>
      <span>{[contact.title, contact.department].filter(Boolean).join(" - ") || "No role captured"}</span>
      <small>
        {compactValue(contact.email)} / {compactValue(contact.phone || contact.mobile)}
      </small>
      {contact.siteName ? <small>Site: {contact.siteName}</small> : null}
      <ContactFlags contact={contact} />
    </div>
  );
}

function SiteCard({ site }: { site: ClientSite }) {
  return (
    <article className="client-360-list-card">
      <div className="client-360-list-icon">
        <MapPin size={17} />
      </div>
      <div>
        <strong>{site.siteName}</strong>
        <span>{site.isPrimarySite ? `${site.siteType} - Primary Site` : site.siteType}</span>
        <small>{site.address || [site.city, site.state, site.country].filter(Boolean).join(", ") || "No address captured"}</small>
        {site.operationalHours ? <small>Hours: {site.operationalHours}</small> : null}
        {site.accessInstructions ? <p>{site.accessInstructions}</p> : null}
      </div>
    </article>
  );
}

function SiteSummary({ site }: { site: ClientSite }) {
  return (
    <div className="client-360-compact-summary">
      <strong>{site.siteName}</strong>
      <span>{site.isPrimarySite ? `${site.siteType} - Primary Site` : site.siteType}</span>
      <small>{site.address || [site.city, site.state, site.country].filter(Boolean).join(", ") || "No address captured"}</small>
      {site.operationalHours ? <small>Hours: {site.operationalHours}</small> : null}
    </div>
  );
}

function ClientActivityTimeline({ activities }: { activities: ClientActivity[] }) {
  if (!activities.length) {
    return (
      <div className="activity-empty-state">
        <StickyNote size={18} />
        <span>No client activity has been recorded yet.</span>
      </div>
    );
  }

  return (
    <div className="client-360-activity-list">
      {activities.map((activity) => (
        <article className="client-360-activity-item" key={activity.id}>
          <div className="global-activity-icon">
            <StickyNote size={16} />
          </div>
          <div>
            <div className="global-activity-heading">
              <strong>{activity.title}</strong>
              <span>{activity.type}</span>
            </div>
            {activity.detail ? <p>{activity.detail}</p> : null}
            <div className="global-activity-meta">
              <span>
                <UserRound size={13} />
                {activity.actor}
              </span>
              <span>
                <CalendarClock size={13} />
                {displayDate(activity.date)}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
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

function RequestsTable({
  requests,
  emptyTitle = "No requests are linked to this client yet.",
  emptyDetail = "Client-linked requests will appear here once intake records use the Directory client relationship."
}: {
  requests: RequestRecord[];
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  if (!requests.length) {
    return (
      <EmptyPanel
        title={emptyTitle}
        detail={emptyDetail}
      />
    );
  }

  return (
    <table className="data-table client-360-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Status</th>
          <th>Type</th>
          <th>Category</th>
          <th>Owner</th>
          <th>Received</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => (
          <tr key={request.id}>
            <td>
              <strong>{request.requestNumber}</strong>
              <br />
              <span className="table-muted">{request.title}</span>
            </td>
            <td>
              <span className={requestStatusClass(request.status)}>{request.status}</span>
            </td>
            <td>{request.requestType}</td>
            <td>{request.serviceCategory}</td>
            <td>{request.assignedToName}</td>
            <td>{displayDate(request.receivedDate)}</td>
            <td>
              <Link className="toolbar-button compact" href={`/requests/${request.id}`}>
                Open
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuotesTable({
  quotes,
  emptyTitle = "No converted quote work is linked yet.",
  emptyDetail = "Quotes will appear here when client-linked requests are converted into quote workspaces."
}: {
  quotes: ClientQuoteSummary[];
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  if (!quotes.length) {
    return (
      <EmptyPanel
        title={emptyTitle}
        detail={emptyDetail}
      />
    );
  }

  return (
    <table className="data-table client-360-table">
      <thead>
        <tr>
          <th>Quote</th>
          <th>Status</th>
          <th>Owner</th>
          <th>Total</th>
          <th>Created From</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {quotes.map((quote) => (
          <tr key={quote.id}>
            <td>
              <strong>{quote.quoteNumber}</strong>
              <br />
              <span className="table-muted">{quote.title}</span>
            </td>
            <td>
              <span className={quote.status === "Draft" ? "status-pill warning" : "status-pill"}>
                {quote.status}
              </span>
            </td>
            <td>{quote.owner}</td>
            <td>{formatMoney(quote.total)}</td>
            <td>
              <Link href={`/requests/${quote.requestId}`}>{quote.requestNumber}</Link>
            </td>
            <td>{displayDate(quote.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ClientProfileWorkspace({ clientId }: ClientProfileWorkspaceProps) {
  const { user } = useCurrentUser();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [quotes, setQuotes] = useState<ClientQuoteSummary[]>([]);
  const [activeTab, setActiveTab] = useState<ClientProfileTab>("Overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [relatedWorkError, setRelatedWorkError] = useState("");
  const [activityDetail, setActivityDetail] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState<ClientWorkFilter>("All Records");
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);

  const canEditClients = user?.role === "Admin";
  const canWriteActivity = canRole(user?.role, "crm:activity:write");

  useEffect(() => {
    async function loadClientProfile() {
      try {
        setIsLoading(true);
        setLoadError("");
        setRelatedWorkError("");
        const clientData = await requestJson<ClientResponse>(`/api/clients/${clientId}`, {
          cache: "no-store"
        });
        setClient(clientData.client);

        try {
          const relatedWorkData = await requestJson<ClientRelatedWorkResponse>(
            `/api/clients/${clientId}/related-work`,
            {
              cache: "no-store"
            }
          );
          setRequests(relatedWorkData.requests);
          setQuotes(relatedWorkData.quotes);
        } catch (error) {
          setRequests([]);
          setQuotes([]);
          setRelatedWorkError(
            error instanceof Error
              ? error.message
              : "Unable to load related client work."
          );
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load this client profile.");
        setClient(null);
        setRequests([]);
        setQuotes([]);
        setRelatedWorkError("");
      } finally {
        setIsLoading(false);
      }
    }

    void loadClientProfile();
  }, [clientId]);

  const activeRequests = useMemo(
    () => requests.filter((request) => !closedRequestStatuses.has(request.status)),
    [requests]
  );

  const activeQuotes = useMemo(
    () => quotes.filter((quote) => !closedQuoteStatuses.has(quote.status)),
    [quotes]
  );

  const normalizedSearch = profileSearch.trim().toLowerCase();

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const matchesFilter =
          workspaceFilter === "Open Requests"
            ? !closedRequestStatuses.has(request.status)
            : workspaceFilter === "Closed Requests"
              ? closedRequestStatuses.has(request.status)
              : true;

        return (
          matchesFilter &&
          matchesSearch(
            [
              request.requestNumber,
              request.title,
              request.status,
              request.requestType,
              request.serviceCategory,
              request.assignedToName,
              request.receivedDate
            ],
            normalizedSearch
          )
        );
      }),
    [normalizedSearch, requests, workspaceFilter]
  );

  const filteredQuotes = useMemo(
    () =>
      quotes.filter((quote) => {
        const matchesFilter =
          workspaceFilter === "Draft Quotes"
            ? quote.status === "Draft"
            : workspaceFilter === "Other Quotes"
              ? quote.status !== "Draft"
              : true;

        return (
          matchesFilter &&
          matchesSearch(
            [
              quote.quoteNumber,
              quote.title,
              quote.status,
              quote.owner,
              quote.requestNumber,
              quote.total
            ],
            normalizedSearch
          )
        );
      }),
    [normalizedSearch, quotes, workspaceFilter]
  );

  const filteredActiveRequests = useMemo(
    () => filteredRequests.filter((request) => !closedRequestStatuses.has(request.status)),
    [filteredRequests]
  );

  const filteredContacts = useMemo(
    () =>
      (client?.contacts ?? []).filter((contact) =>
        matchesSearch(
          [
            contact.name,
            contact.title,
            contact.department,
            contact.email,
            contact.phone,
            contact.mobile,
            contact.siteName,
            contact.notes
          ],
          normalizedSearch
        )
      ),
    [client?.contacts, normalizedSearch]
  );

  const filteredSites = useMemo(
    () =>
      (client?.sites ?? []).filter((site) =>
        matchesSearch(
          [
            site.siteName,
            site.siteType,
            site.address,
            site.city,
            site.state,
            site.country,
            site.operationalHours,
            site.accessInstructions,
            site.siteNotes
          ],
          normalizedSearch
        )
      ),
    [client?.sites, normalizedSearch]
  );

  const filteredActivities = useMemo(
    () =>
      (client?.recentActivity ?? []).filter((activity) =>
        matchesSearch(
          [activity.title, activity.type, activity.detail, activity.actor, activity.date],
          normalizedSearch
        )
      ),
    [client?.recentActivity, normalizedSearch]
  );

  const workspaceResultLabel = useMemo(() => {
    if (activeTab === "Requests") {
      return `${filteredRequests.length} requests`;
    }

    if (activeTab === "Quotes") {
      return `${filteredQuotes.length} quotes`;
    }

    if (activeTab === "Contacts & Sites") {
      return `${filteredContacts.length + filteredSites.length} records`;
    }

    if (activeTab === "Activity") {
      return `${filteredActivities.length} activities`;
    }

    if (activeTab === "Overview") {
      return `${filteredActiveRequests.length + filteredQuotes.length + filteredActivities.length} related items`;
    }

    return "Profile data";
  }, [
    activeTab,
    filteredActivities.length,
    filteredActiveRequests.length,
    filteredContacts.length,
    filteredQuotes.length,
    filteredRequests.length,
    filteredSites.length
  ]);

  const website = client?.website ? websiteHref(client.website) : "";

  async function importClientInfo() {
    if (!client || !canWriteActivity) {
      return;
    }

    try {
      setMoreActionsOpen(false);
      const data = await requestJson<ClientResponse>(`/api/clients/${client.id}/import`, {
        method: "POST",
        body: JSON.stringify({
          source: "Manual profile import",
          actor: user?.name ?? "Pulse User"
        })
      });
      setClient(data.client);
      setMessage(`${data.client.displayName} client info import recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to record client import.");
    }
  }

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client || !canWriteActivity || !activityDetail.trim()) {
      return;
    }

    try {
      setIsSavingActivity(true);
      const data = await requestJson<ClientResponse>(`/api/clients/${client.id}/activities`, {
        method: "POST",
        body: JSON.stringify({
          type: "Note",
          title: "Client note added",
          detail: activityDetail,
          actor: user?.name ?? "Pulse User"
        })
      });
      setClient(data.client);
      setActivityDetail("");
      setMessage("Client activity added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add client activity.");
    } finally {
      setIsSavingActivity(false);
    }
  }

  if (isLoading) {
    return <div className="lead-empty-state">Loading client profile...</div>;
  }

  if (!client) {
    return (
      <div className="lead-empty-state">
        <strong>{loadError || "Client not found."}</strong>
        <Link className="toolbar-button compact" href="/clients">
          Back to clients
        </Link>
      </div>
    );
  }

  const primarySite = client.sites.find((site) => site.isPrimarySite) ?? client.sites[0];
  const primarySiteName = primarySite?.siteName || client.primarySite;
  const primaryContact = client.contacts.find(
    (contact) => contact.isPrimary || contact.isPrimaryContact
  );
  const billingContact = client.contacts.find(
    (contact) => contact.isBilling || contact.isBillingContact
  );
  const importantNotes = client.importantNotes || client.generalNotes;
  const serviceProfile = client.serviceProfile.filter(Boolean);

  return (
    <section className="client-360-page">
      <div className="client-360-heading">
        <Link className="toolbar-button compact" href="/clients">
          <ArrowLeft size={16} />
          Clients
        </Link>
        <div>
          <span>{client.clientNumber}</span>
          <h1>{client.displayName}</h1>
          <div className="request-preview-badges">
            <span className={clientStatusClass(client.status)}>{client.status}</span>
            <span className="request-inline-flags">{compactValue(client.industry)}</span>
            <span className="request-inline-flags">{client.accountOwner}</span>
          </div>
        </div>
        <div className="client-360-actions">
          {canEditClients ? (
            <Link className="toolbar-button compact" href={`/directory/clients/${client.id}/edit`}>
              <Edit3 size={16} />
              Edit Client
            </Link>
          ) : null}
          {canWriteActivity ? (
            <div className="client-360-more-actions">
              <button
                className="toolbar-button compact"
                type="button"
                aria-haspopup="menu"
                aria-expanded={moreActionsOpen}
                onClick={() => setMoreActionsOpen((isOpen) => !isOpen)}
              >
                <MoreHorizontal size={16} />
                More
              </button>
              {moreActionsOpen ? (
                <div className="mini-popover client-360-actions-menu" role="menu">
                  <button type="button" role="menuitem" onClick={importClientInfo}>
                    <Upload size={15} />
                    Record import
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {message ? <div className="form-alert">{message}</div> : null}
      {relatedWorkError ? (
        <div className="form-alert">
          Client profile loaded. Related work is unavailable: {relatedWorkError}
        </div>
      ) : null}

      <div className="client-360-layout">
        <aside className="client-360-profile-panel" aria-label="Client profile">
          <div className="client-360-profile-header">
            <div className="client-360-avatar" aria-hidden="true">
              {getInitials(client.displayName) || "CL"}
            </div>
            <div>
              <span>{client.clientNumber}</span>
              <h2>{client.displayName}</h2>
              <div className="client-360-profile-badges">
                <span className={clientStatusClass(client.status)}>{client.status}</span>
                <span className="request-inline-flags">{compactValue(client.industry)}</span>
              </div>
            </div>
          </div>

          <ProfileSection title="Client Details" icon={<Building2 size={17} />}>
            <FieldList
              items={[
                { label: "Legal Name", value: client.legalName },
                { label: "Industry", value: client.industry },
                { label: "Owner", value: client.accountOwner },
                { label: "Source", value: client.source },
                { label: "Language", value: client.preferredLanguage }
              ]}
            />
          </ProfileSection>

          <ProfileSection title="Contact Channels" icon={<Phone size={17} />}>
            <div className="client-360-channel-list">
              <span>
                <Phone size={14} />
                {primaryContact ? compactValue(primaryContact.phone || primaryContact.mobile) : "No primary contact selected."}
              </span>
              <span>
                <Mail size={14} />
                {primaryContact ? compactValue(primaryContact.email) : "No primary contact selected."}
              </span>
              <span>
                <Globe size={14} />
                {website ? (
                  <a href={website} target="_blank" rel="noreferrer">
                    {client.website}
                  </a>
                ) : (
                  "Not captured"
                )}
              </span>
            </div>
          </ProfileSection>

          <ProfileSection title="Primary Contact" icon={<UserRound size={17} />}>
            {primaryContact?.name ? (
              <ContactSummary contact={primaryContact} />
            ) : (
              <p className="lead-notes">No primary contact selected.</p>
            )}
          </ProfileSection>

          <ProfileSection title="Primary Site" icon={<MapPin size={17} />}>
            {primarySite ? (
              <SiteSummary site={primarySite} />
            ) : (
              <p className="lead-notes">{primarySiteName || "No primary site captured."}</p>
            )}
          </ProfileSection>

          <ProfileSection title="Important Notes" icon={<StickyNote size={17} />}>
            <p className="lead-notes">{importantNotes || "No important notes captured."}</p>
          </ProfileSection>

          <ProfileSection title="Documentation" icon={<FileText size={17} />}>
            <p className="lead-notes">
              {client.documentationRequirements || "No documentation requirements captured."}
            </p>
          </ProfileSection>
        </aside>

        <main className="client-360-main-workspace">
          <section className="client-360-toolbar" aria-label="Search and filter client workspace">
            <label className="lead-search client-360-search">
              <Search size={17} />
              <input
                aria-label="Search client workspace"
                placeholder="Search work, contacts, sites, activity..."
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
              />
            </label>
            <label className="client-360-filter-control">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Filter client workspace"
                value={workspaceFilter}
                onChange={(event) => setWorkspaceFilter(event.target.value as ClientWorkFilter)}
              >
                {clientWorkFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
            </label>
            <span className="client-360-result-count">{workspaceResultLabel}</span>
          </section>

          <section className="client-360-metric-grid" aria-label="Client profile metrics">
            <ClientMetricCard
              label="Open Requests"
              value={activeRequests.length}
              icon={<FileText size={18} />}
            />
            <ClientMetricCard
              label="Active Quotes"
              value={activeQuotes.length}
              icon={<ReceiptText size={18} />}
            />
            <ClientMetricCard
              label="Active Projects"
              value={client.activeProjects}
              icon={<FolderKanban size={18} />}
            />
            <ClientMetricCard
              label="Outstanding Balance"
              value={formatMoney(client.outstandingBalance)}
              icon={<CreditCard size={18} />}
            />
            <ClientMetricCard
              label="Lifetime Value"
              value={formatMoney(client.lifetimeValue)}
              icon={<Building2 size={18} />}
            />
            <ClientMetricCard
              label="Last Activity"
              value={displayDate(client.lastActivity)}
              icon={<CalendarClock size={18} />}
            />
          </section>

          <section className="client-360-tabs-panel">
            <div className="lead-view-tabs client-360-tabs" role="tablist" aria-label="Client profile sections">
              {clientProfileTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={activeTab === tab ? "lead-view-tab active" : "lead-view-tab"}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "Overview" ? (
              <div className="client-360-tab-content">
                <div className="client-360-overview-grid">
                  <section className="client-360-tab-card">
                    <h3>Relationship</h3>
                    <FieldList
                      items={[
                        { label: "Industry", value: client.industry },
                        { label: "Source", value: client.source },
                        { label: "Payment Terms", value: client.paymentTerms },
                        { label: "Open Opportunities", value: client.openOpportunities },
                        { label: "Created", value: displayDate(client.createdAt) },
                        { label: "Updated", value: displayDate(client.updatedAt) }
                      ]}
                    />
                  </section>
                  <section className="client-360-tab-card">
                    <h3>Billing</h3>
                    <FieldList
                      items={[
                        { label: "Billing Contact", value: billingContact?.name },
                        { label: "Billing Email", value: billingContact?.email },
                        { label: "Currency", value: client.preferredCurrency },
                        { label: "Tax ID", value: client.taxId },
                        { label: "PO Required", value: client.purchaseOrderRequired ? "Yes" : "No" },
                        { label: "Invoice", value: client.invoiceRequirements }
                      ]}
                    />
                  </section>
                  <section className="client-360-tab-card">
                    <h3>Service Profile</h3>
                    {serviceProfile.length ? (
                      <div className="client-360-pill-row">
                        {serviceProfile.map((service) => (
                          <span className="request-inline-flags" key={service}>
                            {service}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="lead-notes">No service profile captured.</p>
                    )}
                  </section>
                  <section className="client-360-tab-card">
                    <h3>Billing Contact</h3>
                    {billingContact?.name ? (
                      <ContactSummary contact={billingContact} />
                    ) : (
                      <p className="lead-notes">No billing contact captured.</p>
                    )}
                  </section>
                  <section className="client-360-tab-card client-360-wide-section">
                    <h3>Active Requests</h3>
                    <RequestsTable
                      requests={filteredActiveRequests.slice(0, 5)}
                      emptyTitle={
                        profileSearch || workspaceFilter !== "All Records"
                          ? "No active requests match the current search."
                          : "No active requests are linked to this client."
                      }
                      emptyDetail="Client-linked open intake work will appear here."
                    />
                  </section>
                  <section className="client-360-tab-card client-360-wide-section">
                    <h3>Related Quotes</h3>
                    <QuotesTable
                      quotes={filteredQuotes.slice(0, 5)}
                      emptyTitle={
                        profileSearch || workspaceFilter !== "All Records"
                          ? "No quotes match the current search."
                          : "No converted quote work is linked yet."
                      }
                      emptyDetail="Quotes will appear here when client-linked requests are converted."
                    />
                  </section>
                  <section className="client-360-tab-card client-360-wide-section">
                    <h3>Recent Activity</h3>
                    <ClientActivityTimeline activities={filteredActivities.slice(0, 5)} />
                  </section>
                </div>
              </div>
            ) : null}

            {activeTab === "Requests" ? (
              <div className="client-360-tab-content">
                <RequestsTable
                  requests={filteredRequests}
                  emptyTitle={
                    profileSearch || workspaceFilter !== "All Records"
                      ? "No requests match the current search."
                      : "No requests are linked to this client yet."
                  }
                  emptyDetail="Adjust the search or filter to broaden the client request list."
                />
              </div>
            ) : null}

            {activeTab === "Quotes" ? (
              <div className="client-360-tab-content">
                <QuotesTable
                  quotes={filteredQuotes}
                  emptyTitle={
                    profileSearch || workspaceFilter !== "All Records"
                      ? "No quotes match the current search."
                      : "No converted quote work is linked yet."
                  }
                  emptyDetail="Adjust the search or filter to broaden the client quote list."
                />
              </div>
            ) : null}

            {activeTab === "Projects" ? (
              <div className="client-360-tab-content client-360-compact-tab">
                <EmptyPanel
                  title="No client-linked project records yet."
                  detail="The active project count is preserved on the profile; detailed project records are not linked in this workspace yet."
                />
              </div>
            ) : null}

            {activeTab === "Invoices" ? (
              <div className="client-360-tab-content client-360-compact-tab">
                <EmptyPanel
                  title="No client-linked invoice records yet."
                  detail="Outstanding balance and invoice requirements are preserved; detailed invoice records are not linked in this workspace yet."
                />
              </div>
            ) : null}

            {activeTab === "Contacts & Sites" ? (
              <div className="client-360-tab-content">
                <div className="client-360-two-column">
                  <section className="client-360-tab-card">
                    <h3>Contacts</h3>
                    <div className="client-360-list-stack">
                      {filteredContacts.length ? (
                        filteredContacts.map((contact) => (
                          <ContactCard contact={contact} key={contact.id || contact.name} />
                        ))
                      ) : (
                        <EmptyPanel
                          title={client.contacts.length ? "No contacts match the current search." : "No contacts captured yet."}
                          detail="Client contacts from this Directory record appear here."
                        />
                      )}
                    </div>
                  </section>
                  <section className="client-360-tab-card">
                    <h3>Sites</h3>
                    <div className="client-360-list-stack">
                      {filteredSites.length ? (
                        filteredSites.map((site) => <SiteCard site={site} key={site.id || site.siteName} />)
                      ) : (
                        <EmptyPanel
                          title={client.sites.length ? "No sites match the current search." : "No sites captured yet."}
                          detail="Client sites from this Directory record appear here."
                        />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {activeTab === "Activity" ? (
              <div className="client-360-tab-content">
                <section className="client-360-tab-card">
                  <h3>Add Activity</h3>
                  <form className="client-360-activity-form" onSubmit={addActivity}>
                    <textarea
                      placeholder="Add a client note..."
                      value={activityDetail}
                      onChange={(event) => setActivityDetail(event.target.value)}
                      disabled={!canWriteActivity}
                    />
                    <button
                      className="primary-button compact"
                      type="submit"
                      disabled={!canWriteActivity || !activityDetail.trim() || isSavingActivity}
                    >
                      <Save size={16} />
                      {isSavingActivity ? "Saving..." : "Add Activity"}
                    </button>
                  </form>
                </section>
                <section className="client-360-tab-card">
                  <h3>Activity Timeline</h3>
                  <ClientActivityTimeline activities={filteredActivities} />
                </section>
              </div>
            ) : null}

            {activeTab === "Preferences" ? (
              <div className="client-360-tab-content">
                <div className="client-360-two-column">
                  <section className="client-360-tab-card">
                    <h3>Brand & Technology</h3>
                    <FieldList
                      items={[
                        { label: "Brand Preferences", value: client.brandPreferences },
                        { label: "Technology Preferences", value: client.technologyPreferences },
                        { label: "Preferred Vendors", value: client.preferredVendors },
                        { label: "Camera", value: client.preferredCameraBrand },
                        { label: "Access Control", value: client.preferredAccessControlBrand },
                        { label: "Network", value: client.preferredNetworkBrand },
                        { label: "Cabling", value: client.preferredCablingBrand },
                        { label: "Standard Technologies", value: client.standardTechnologies }
                      ]}
                    />
                  </section>
                  <section className="client-360-tab-card">
                    <h3>Requirements</h3>
                    <FieldList
                      items={[
                        { label: "Documentation", value: client.documentationRequirements },
                        { label: "Invoice", value: client.invoiceRequirements },
                        { label: "Insurance", value: client.insuranceRequirements },
                        { label: "PO Required", value: client.purchaseOrderRequired ? "Yes" : "No" }
                      ]}
                    />
                  </section>
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </section>
  );
}
