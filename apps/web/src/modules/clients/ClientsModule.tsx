"use client";

import Link from "next/link";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  Building2,
  Filter,
  Search,
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
  const { user } = useCurrentUser();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | ClientType>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const canWriteCrm = canRole(user?.role, "crm:write");

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

  return (
    <div className="clients-module">
      <section className="clients-command-bar">
        <div>
          <p className="eyebrow">Directory / Clients</p>
          <h2>Clients</h2>
        </div>
        <div className="clients-hero-actions">
          {canWriteCrm ? (
            <Link className="primary-button" href="/clients/new">
              New Client
            </Link>
          ) : null}
        </div>
      </section>

      <section className="clients-workspace">
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
                  const legalNameIsDifferent =
                    client.legalName &&
                    client.legalName.trim().toLowerCase() !==
                      client.displayName.trim().toLowerCase();

                  return (
                    <Link
                      key={client.id}
                      className="client-row"
                      href={`/clients/${client.id}`}
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
                    </Link>
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
                  ? "Create the first client account to start building Directory history."
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
                {canWriteCrm ? (
                  <Link className="primary-button" href="/clients/new">
                    Create new client
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

      </section>
    </div>
  );
}
