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
  Phone,
  Plus,
  ReceiptText,
  Save,
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

function SummaryCard({
  title,
  icon,
  children
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="client-360-summary-card">
      <div className="client-360-card-heading">
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
    contact.isPrimaryContact ? "Primary" : "",
    contact.isBillingContact ? "Billing" : "",
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
    <div className="lead-empty-state client-360-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function RequestsTable({ requests }: { requests: RequestRecord[] }) {
  if (!requests.length) {
    return (
      <EmptyPanel
        title="No requests are linked to this client yet."
        detail="Client-linked requests will appear here once intake records use the Directory client relationship."
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

function QuotesTable({ quotes }: { quotes: ClientQuoteSummary[] }) {
  if (!quotes.length) {
    return (
      <EmptyPanel
        title="No converted quote work is linked yet."
        detail="Quotes will appear here when client-linked requests are converted into quote workspaces."
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

  const canWriteCrm = canRole(user?.role, "crm:write");
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

  const website = client?.website ? websiteHref(client.website) : "";

  async function importClientInfo() {
    if (!client || !canWriteActivity) {
      return;
    }

    try {
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
  const primaryContact =
    client.contacts.find((contact) => contact.isPrimaryContact) ?? client.contacts[0];

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
            <span className="request-inline-flags">{client.clientType}</span>
            <span className="request-inline-flags">{client.accountOwner}</span>
          </div>
        </div>
        <div className="client-360-actions">
          <button
            className="toolbar-button compact"
            type="button"
            onClick={() =>
              setMessage(
                `Edit workflow placeholder: ${client.displayName} can be updated through the client API.`
              )
            }
            disabled={!canWriteCrm}
          >
            <Edit3 size={16} />
            Edit Client
          </button>
          <Link className="primary-button compact" href="/requests/new">
            <Plus size={17} />
            New Request
          </Link>
          <button className="toolbar-button compact" type="button" disabled>
            <FileText size={16} />
            New Quote
          </button>
          <button className="toolbar-button compact" type="button" disabled>
            <FolderKanban size={16} />
            New Project
          </button>
          <button className="toolbar-button compact" type="button" disabled>
            <ReceiptText size={16} />
            Create Invoice
          </button>
          <button
            className="toolbar-button compact"
            type="button"
            onClick={importClientInfo}
            disabled={!canWriteActivity}
          >
            <Upload size={16} />
            Import
          </button>
        </div>
      </div>

      {message ? <div className="form-alert">{message}</div> : null}
      {relatedWorkError ? (
        <div className="form-alert">
          Client profile loaded. Related work is unavailable: {relatedWorkError}
        </div>
      ) : null}

      <section className="client-360-identity-strip" aria-label="Client identity">
        <div>
          <span>Main Phone</span>
          <strong>
            <Phone size={14} />
            {compactValue(client.mainPhone)}
          </strong>
        </div>
        <div>
          <span>Main Email</span>
          <strong>
            <Mail size={14} />
            {compactValue(client.mainEmail)}
          </strong>
        </div>
        <div>
          <span>Website</span>
          <strong>
            <Globe size={14} />
            {website ? (
              <a href={website} target="_blank" rel="noreferrer">
                {client.website}
              </a>
            ) : (
              "Not captured"
            )}
          </strong>
        </div>
        <div>
          <span>Payment Terms</span>
          <strong>{compactValue(client.paymentTerms)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{formatMoney(client.outstandingBalance)}</strong>
        </div>
        <div>
          <span>Lifetime Value</span>
          <strong>{formatMoney(client.lifetimeValue)}</strong>
        </div>
        <div>
          <span>Last Activity</span>
          <strong>{displayDate(client.lastActivity)}</strong>
        </div>
      </section>

      <div className="client-360-summary-grid">
        <SummaryCard title="Client Snapshot" icon={<Building2 size={17} />}>
          <FieldList
            items={[
              { label: "Legal Name", value: client.legalName },
              { label: "Industry", value: client.industry },
              { label: "Source", value: client.source },
              { label: "Language", value: client.preferredLanguage }
            ]}
          />
        </SummaryCard>
        <SummaryCard title="Primary Contact" icon={<UserRound size={17} />}>
          {primaryContact ? (
            <ContactSummary contact={primaryContact} />
          ) : (
            <p className="lead-notes">No contact captured yet.</p>
          )}
        </SummaryCard>
        <SummaryCard title="Primary Site" icon={<MapPin size={17} />}>
          {primarySite ? <SiteSummary site={primarySite} /> : <p className="lead-notes">No site captured yet.</p>}
        </SummaryCard>
        <SummaryCard title="Billing Details" icon={<CreditCard size={17} />}>
          <FieldList
            items={[
              { label: "Billing Email", value: client.billingEmail },
              { label: "Currency", value: client.preferredCurrency },
              { label: "Tax ID", value: client.taxId },
              { label: "PO Required", value: client.purchaseOrderRequired ? "Yes" : "No" }
            ]}
          />
        </SummaryCard>
      </div>

      <div className="client-360-summary-grid secondary">
        <SummaryCard title="Important Notes" icon={<StickyNote size={17} />}>
          <p className="lead-notes">{client.importantNotes || client.generalNotes || "No important notes captured."}</p>
        </SummaryCard>
        <SummaryCard title="Technology Preferences" icon={<FolderKanban size={17} />}>
          <FieldList
            items={[
              { label: "Camera", value: client.preferredCameraBrand },
              { label: "Access Control", value: client.preferredAccessControlBrand },
              { label: "Network", value: client.preferredNetworkBrand },
              { label: "Cabling", value: client.preferredCablingBrand }
            ]}
          />
        </SummaryCard>
        <SummaryCard title="Documentation" icon={<FileText size={17} />}>
          <p className="lead-notes">{client.documentationRequirements || "No documentation requirements captured."}</p>
        </SummaryCard>
        <SummaryCard title="Invoice & Insurance" icon={<ReceiptText size={17} />}>
          <FieldList
            items={[
              { label: "Invoice", value: client.invoiceRequirements },
              { label: "Insurance", value: client.insuranceRequirements },
              { label: "Purchase Order", value: client.purchaseOrderRequired ? "Required" : "Not required" }
            ]}
          />
        </SummaryCard>
      </div>

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
            <section className="metric-grid" aria-label="Client profile metrics">
              <article className="metric-card">
                <p className="metric-label">Open Requests</p>
                <p className="metric-value">{activeRequests.length}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Active Quotes</p>
                <p className="metric-value">{quotes.length}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Active Projects</p>
                <p className="metric-value">{client.activeProjects}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Outstanding Balance</p>
                <p className="metric-value metric-text">{formatMoney(client.outstandingBalance)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Lifetime Value</p>
                <p className="metric-value metric-text">{formatMoney(client.lifetimeValue)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Last Activity</p>
                <p className="metric-value metric-text">{displayDate(client.lastActivity)}</p>
              </article>
            </section>

            <div className="client-360-overview-grid">
              <section className="lead-section">
                <h3>Active Requests</h3>
                <RequestsTable requests={activeRequests.slice(0, 5)} />
              </section>
              <section className="lead-section">
                <h3>Converted Quotes</h3>
                <QuotesTable quotes={quotes.slice(0, 5)} />
              </section>
              <section className="lead-section">
                <h3>Projects</h3>
                <EmptyPanel
                  title="No database-backed projects yet."
                  detail="Project records are still a starter workspace and are not linked to clients in v1."
                />
              </section>
              <section className="lead-section">
                <h3>Invoices</h3>
                <EmptyPanel
                  title="No database-backed invoices yet."
                  detail="Invoice records are still a starter workspace and are not linked to clients in v1."
                />
              </section>
              <section className="lead-section client-360-wide-section">
                <h3>Recent Activity</h3>
                <ClientActivityTimeline activities={client.recentActivity.slice(0, 5)} />
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "Requests" ? (
          <div className="client-360-tab-content">
            <RequestsTable requests={requests} />
          </div>
        ) : null}

        {activeTab === "Quotes" ? (
          <div className="client-360-tab-content">
            <QuotesTable quotes={quotes} />
          </div>
        ) : null}

        {activeTab === "Projects" ? (
          <div className="client-360-tab-content">
            <EmptyPanel
              title="Projects are not database-backed yet."
              detail="This tab is reserved for future client-linked project records once the Projects module has a real model."
            />
          </div>
        ) : null}

        {activeTab === "Invoices" ? (
          <div className="client-360-tab-content">
            <EmptyPanel
              title="Invoices are not database-backed yet."
              detail="This tab is reserved for future client-linked invoice records once Billing has a real invoice model."
            />
          </div>
        ) : null}

        {activeTab === "Contacts & Sites" ? (
          <div className="client-360-tab-content">
            <div className="client-360-two-column">
              <section className="lead-section">
                <h3>Contacts</h3>
                <div className="client-360-list-stack">
                  {client.contacts.length ? (
                    client.contacts.map((contact) => <ContactCard contact={contact} key={contact.id || contact.name} />)
                  ) : (
                    <p className="lead-notes">No contacts captured yet.</p>
                  )}
                </div>
              </section>
              <section className="lead-section">
                <h3>Sites</h3>
                <div className="client-360-list-stack">
                  {client.sites.length ? (
                    client.sites.map((site) => <SiteCard site={site} key={site.id || site.siteName} />)
                  ) : (
                    <p className="lead-notes">No sites captured yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "Activity" ? (
          <div className="client-360-tab-content">
            <section className="lead-section">
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
            <section className="lead-section">
              <h3>Activity Timeline</h3>
              <ClientActivityTimeline activities={client.recentActivity} />
            </section>
          </div>
        ) : null}

        {activeTab === "Preferences" ? (
          <div className="client-360-tab-content">
            <div className="client-360-two-column">
              <section className="lead-section">
                <h3>Brand & Technology</h3>
                <FieldList
                  items={[
                    { label: "Brand Preferences", value: client.brandPreferences },
                    { label: "Technology Preferences", value: client.technologyPreferences },
                    { label: "Preferred Vendors", value: client.preferredVendors },
                    { label: "Standard Technologies", value: client.standardTechnologies }
                  ]}
                />
              </section>
              <section className="lead-section">
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
    </section>
  );
}
