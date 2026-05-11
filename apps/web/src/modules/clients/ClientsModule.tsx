"use client";

import Link from "next/link";
import {
  Building2,
  CreditCard,
  Edit3,
  Filter,
  FolderKanban,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Search,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  clientOwners,
  clientStatuses,
  clientTypes,
  formatMoney,
  type ClientRecord,
  type ClientStatus,
  type ClientType
} from "./clientData";

type ClientListResponse = {
  clients: ClientRecord[];
};

type ClientResponse = {
  client: ClientRecord;
};

function statusClass(status: ClientStatus) {
  if (status === "On Hold") {
    return "status-pill danger";
  }

  if (status === "Prospect") {
    return "status-pill warning";
  }

  return "status-pill";
}

function serviceSummary(client: ClientRecord) {
  return client.serviceProfile.length
    ? client.serviceProfile.join(", ")
    : "No service profile";
}

function displayDate(date: string) {
  if (!date) {
    return "No activity";
  }

  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return value?.trim() || "Not captured";
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
    throw new Error(
      typeof data.error === "string" ? data.error : "Client request failed."
    );
  }

  return data as T;
}

export function ClientsModule() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | ClientType>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    statusFilter !== "All" ||
    typeFilter !== "All" ||
    ownerFilter !== "All";

  useEffect(() => {
    async function loadClients() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await requestJson<ClientListResponse>("/api/clients", {
          cache: "no-store"
        });
        setClients(data.clients);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load clients from the API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadClients();
  }, []);

  useEffect(() => {
    if (
      selectedClientId &&
      clients.length > 0 &&
      !clients.some((client) => client.id === selectedClientId)
    ) {
      setSelectedClientId("");
    }
  }, [clients, selectedClientId]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return clients.filter((client) => {
      const haystack = [
        client.id,
        client.clientNumber,
        client.displayName,
        client.legalName,
        client.companyName,
        client.clientType,
        client.status,
        client.accountOwner,
        client.primaryContact.name,
        client.primaryContact.email,
        client.mainPhone,
        client.mainEmail,
        client.primarySite,
        client.city,
        client.state,
        serviceSummary(client)
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "All" || client.status === statusFilter;
      const matchesType =
        typeFilter === "All" || client.clientType === typeFilter;
      const matchesOwner =
        ownerFilter === "All" || client.accountOwner === ownerFilter;

      return matchesSearch && matchesStatus && matchesType && matchesOwner;
    });
  }, [clients, ownerFilter, searchTerm, statusFilter, typeFilter]);

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("All");
    setTypeFilter("All");
    setOwnerFilter("All");
  }

  function replaceClient(updatedClient: ClientRecord) {
    setClients((current) =>
      current.map((client) =>
        client.id === updatedClient.id ? updatedClient : client
      )
    );
    setSelectedClientId(updatedClient.id);
  }

  async function importClientInfo() {
    if (!selectedClient) {
      return;
    }

    try {
      const data = await requestJson<ClientResponse>(
        `/api/clients/${selectedClient.id}/import`,
        {
          method: "POST",
          body: JSON.stringify({
            source: "Manual profile import",
            actor: "Alex Morgan"
          })
        }
      );
      replaceClient(data.client);
      setNotice(`${data.client.displayName} client info import recorded.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to record client import."
      );
    }
  }

  function startEditClient() {
    if (!selectedClient) {
      return;
    }

    setNotice(
      `Edit workflow placeholder: ${selectedClient.displayName} can be updated through the client API, and the edit screen is the next UI step.`
    );
  }

  return (
    <div className="clients-module">
      <section className="clients-command-bar">
        <div>
          <p className="eyebrow">CRM / Clients</p>
          <h2>Clients</h2>
        </div>
        <div className="clients-hero-actions">
          <Link className="primary-button" href="/clients/new">
            New Client
          </Link>
          <button
            className="toolbar-button compact"
            type="button"
            disabled={!selectedClient}
            onClick={importClientInfo}
          >
            <Upload size={17} />
            Import
          </button>
        </div>
      </section>

      <section
        className={
          selectedClient
            ? "clients-workspace detail-open"
            : "clients-workspace"
        }
      >
        <div className="client-list-panel">
          <div className="client-list-toolbar">
            <label className="lead-search">
              <Search size={17} />
              <input
                aria-label="Search clients"
                placeholder="Search clients, contacts, sites, services..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <div className="lead-filter-row">
              <Filter size={16} />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "All" | ClientStatus)
                }
              >
                <option value="All">All statuses</option>
                {clientStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as "All" | ClientType)
                }
              >
                <option value="All">All types</option>
                {clientTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="All">All owners</option>
                {clientOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
              {hasActiveFilters ? (
                <button
                  className="toolbar-button compact"
                  type="button"
                  onClick={clearFilters}
                >
                  <X size={16} />
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="client-list-meta">
            <span>
              Showing {filteredClients.length} of {clients.length} clients
            </span>
            {hasActiveFilters ? <strong>Filters active</strong> : null}
          </div>

          {loadError ? <div className="form-alert error">{loadError}</div> : null}
          {notice ? <div className="form-alert">{notice}</div> : null}

          <div className="client-list" aria-busy={isLoading}>
            {filteredClients.length ? (
              <>
                <div className="client-list-header" aria-hidden="true">
                  <span>Client</span>
                  <span>Primary contact</span>
                  <span>Primary site</span>
                  <span>Phone / Email</span>
                  <span>Owner</span>
                  <span>Relationship</span>
                </div>
                {filteredClients.map((client) => {
                  const isSelected = client.id === selectedClient?.id;
                  const legalNameIsDifferent =
                    client.legalName &&
                    client.legalName.trim().toLowerCase() !==
                      client.displayName.trim().toLowerCase();

                  return (
                    <button
                      key={client.id}
                      className={isSelected ? "client-row selected" : "client-row"}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                    >
                      <span className="client-row-icon">
                        <Building2 size={20} />
                      </span>
                      <span className="client-row-primary">
                        <strong>{client.displayName}</strong>
                        <small>
                          {legalNameIsDifferent
                            ? client.legalName
                            : `${client.clientType} account`}
                        </small>
                        <span className={statusClass(client.status)}>
                          {client.status}
                        </span>
                      </span>
                      <span>
                        <strong>{client.primaryContact.name}</strong>
                        <small>{compactValue(client.primaryContact.title)}</small>
                      </span>
                      <span>
                        <strong>{compactValue(client.primarySite)}</strong>
                        <small>
                          {[client.city, client.state].filter(Boolean).join(", ") ||
                            `${client.sites.length} sites`}
                        </small>
                      </span>
                      <span>
                        <strong>{compactValue(client.mainPhone)}</strong>
                        <small>{compactValue(client.mainEmail)}</small>
                      </span>
                      <span>
                        <strong>{client.accountOwner}</strong>
                        <small>{displayDate(client.lastActivity)}</small>
                      </span>
                      <span>
                        <strong>{formatMoney(client.lifetimeValue)}</strong>
                        <small>
                          {client.openOpportunities} opps / {client.activeProjects} projects
                        </small>
                      </span>
                    </button>
                  );
                })}
              </>
            ) : null}
          </div>

          {!isLoading && filteredClients.length === 0 ? (
            <div className="lead-empty-state client-empty-state">
              <strong>
                {clients.length === 0
                  ? "No clients have been created yet."
                  : "No clients match the current filters."}
              </strong>
              <span>
                {clients.length === 0
                  ? "Create the first client account to start building CRM history."
                  : "Clear filters or adjust the search phrase to widen the list."}
              </span>
              <div className="client-empty-actions">
                {hasActiveFilters ? (
                  <button
                    className="toolbar-button compact"
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
                <Link className="primary-button" href="/clients/new">
                  Create new client
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {selectedClient ? (
          <aside className="client-profile-panel" aria-label="Client profile">
            <div className="client-profile-header">
              <div>
                <p>{selectedClient.clientNumber}</p>
                <h2>{selectedClient.displayName}</h2>
                <span className={statusClass(selectedClient.status)}>
                  {selectedClient.status}
                </span>
              </div>
              <div className="client-profile-actions">
                <button
                  className="toolbar-button compact"
                  type="button"
                  onClick={startEditClient}
                >
                  <Edit3 size={16} />
                  Edit Client
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close client details"
                  onClick={() => setSelectedClientId("")}
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="client-profile-grid">
              <div>
                <span>Owner</span>
                <strong>{selectedClient.accountOwner}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{selectedClient.clientType}</strong>
              </div>
              <div>
                <span>Relationship Value</span>
                <strong>{formatMoney(selectedClient.lifetimeValue)}</strong>
              </div>
              <div>
                <span>Outstanding Balance</span>
                <strong>{formatMoney(selectedClient.outstandingBalance)}</strong>
              </div>
            </div>

            <section className="client-section">
              <h3>Primary Contact</h3>
              <div className="client-contact-card">
                <p>
                  <UserRound size={15} />
                  {selectedClient.primaryContact.name}
                  {selectedClient.primaryContact.title
                    ? `, ${selectedClient.primaryContact.title}`
                    : ""}
                </p>
                <p>
                  <Mail size={15} />
                  {compactValue(selectedClient.primaryContact.email)}
                </p>
                <p>
                  <Phone size={15} />
                  {compactValue(
                    selectedClient.primaryContact.phone ||
                      selectedClient.primaryContact.mobile
                  )}
                </p>
              </div>
            </section>

            <section className="client-section">
              <h3>Sites</h3>
              <div className="client-site-list">
                {selectedClient.sites.length ? (
                  selectedClient.sites.map((site) => (
                    <article key={site.id || `${selectedClient.id}-${site.name}`}>
                      <MapPin size={15} />
                      <span>
                        <strong>
                          {site.name}
                          {site.isPrimarySite ? " (Primary)" : ""}
                        </strong>
                        <small>
                          {[site.address, site.city, site.state]
                            .filter(Boolean)
                            .join(" / ") || site.siteType}
                        </small>
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="client-muted-line">No sites captured yet.</p>
                )}
              </div>
            </section>

            <section className="client-section">
              <h3>Service Profile</h3>
              {selectedClient.serviceProfile.length ? (
                <div className="client-service-tags">
                  {selectedClient.serviceProfile.map((service) => (
                    <span key={service}>{service}</span>
                  ))}
                </div>
              ) : (
                <p className="client-muted-line">No service profile captured yet.</p>
              )}
            </section>

            <section className="client-section">
              <h3>Brand & Technology Preferences</h3>
              <div className="client-history-grid">
                <div>
                  <span>Camera</span>
                  <strong>{compactValue(selectedClient.preferredCameraBrand)}</strong>
                </div>
                <div>
                  <span>Access Control</span>
                  <strong>
                    {compactValue(selectedClient.preferredAccessControlBrand)}
                  </strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>{compactValue(selectedClient.preferredNetworkBrand)}</strong>
                </div>
                <div>
                  <span>Cabling</span>
                  <strong>{compactValue(selectedClient.preferredCablingBrand)}</strong>
                </div>
              </div>
            </section>

            <section className="client-section">
              <h3>Billing & Payment Terms</h3>
              <div className="client-history-grid">
                <div>
                  <span>Terms</span>
                  <strong>{compactValue(selectedClient.paymentTerms)}</strong>
                </div>
                <div>
                  <span>Billing Email</span>
                  <strong>{compactValue(selectedClient.billingEmail)}</strong>
                </div>
                <div>
                  <span>Currency</span>
                  <strong>{compactValue(selectedClient.preferredCurrency)}</strong>
                </div>
                <div>
                  <span>PO Required</span>
                  <strong>
                    {selectedClient.purchaseOrderRequired ? "Yes" : "No"}
                  </strong>
                </div>
              </div>
            </section>

            <section className="client-section">
              <h3>Recent Activity</h3>
              <div className="client-activity-list">
                {selectedClient.recentActivity.length ? (
                  selectedClient.recentActivity.slice(0, 5).map((activity) => (
                    <article key={activity.id || `${selectedClient.id}-${activity.title}`}>
                      <strong>{activity.title}</strong>
                      {activity.detail ? <p>{activity.detail}</p> : null}
                      <span>
                        {displayDate(activity.date)} by {activity.actor}
                      </span>
                    </article>
                  ))
                ) : (
                  <p className="client-muted-line">No activity recorded yet.</p>
                )}
              </div>
            </section>

            <section className="client-section">
              <h3>Relationship History</h3>
              <div className="client-relationship-list">
                <article>
                  <FolderKanban size={15} />
                  <span>
                    <strong>Active Projects</strong>
                    <small>{selectedClient.activeProjects} connected records</small>
                  </span>
                </article>
                <article>
                  <ReceiptText size={15} />
                  <span>
                    <strong>Open Quotes</strong>
                    <small>Quote records are not connected to clients yet.</small>
                  </span>
                </article>
                <article>
                  <CreditCard size={15} />
                  <span>
                    <strong>Billing History</strong>
                    <small>
                      Outstanding balance: {formatMoney(selectedClient.outstandingBalance)}
                    </small>
                  </span>
                </article>
              </div>
            </section>
          </aside>
        ) : null}
      </section>
    </div>
  );
}
