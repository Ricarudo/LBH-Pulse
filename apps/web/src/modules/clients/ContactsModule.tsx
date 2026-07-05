"use client";

import Link from "next/link";
import { ArrowLeft, Building2, Filter, Search, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  clientOwners,
  clientStatuses,
  type ClientContact,
  type ClientRecord,
  type ClientStatus
} from "./clientData";

type ClientListResponse = {
  clients: ClientRecord[];
};

type ContactFlagFilter =
  | "All"
  | "Primary"
  | "Billing"
  | "Technical"
  | "Decision Maker";

type ContactRow = {
  client: ClientRecord;
  contact: ClientContact;
  flags: ContactFlagFilter[];
};

const contactFlagFilters: ContactFlagFilter[] = [
  "All",
  "Primary",
  "Billing",
  "Technical",
  "Decision Maker"
];

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
      typeof data.error === "string" ? data.error : "Contact request failed."
    );
  }

  return data as T;
}

function statusClass(status: ClientStatus) {
  if (status === "On Hold") {
    return "status-pill danger";
  }

  if (status === "Prospect") {
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

function contactFlags(contact: ClientContact): ContactFlagFilter[] {
  return [
    contact.isPrimary || contact.isPrimaryContact ? "Primary" : "",
    contact.isBilling || contact.isBillingContact ? "Billing" : "",
    contact.isTechnicalContact ? "Technical" : "",
    contact.isDecisionMaker ? "Decision Maker" : ""
  ].filter(Boolean) as ContactFlagFilter[];
}

function contactSiteName(client: ClientRecord, contact: ClientContact) {
  if (contact.siteName) {
    return contact.siteName;
  }

  if (contact.siteId) {
    return client.sites.find((site) => site.id === contact.siteId)?.siteName ?? "";
  }

  return "";
}

function contactPhone(contact: ClientContact) {
  return contact.phone || contact.mobile;
}

function flattenContacts(clients: ClientRecord[]): ContactRow[] {
  return clients.flatMap((client) =>
    client.contacts.map((contact) => ({
      client,
      contact,
      flags: contactFlags(contact)
    }))
  );
}

function ownerOptions(clients: ClientRecord[]) {
  return Array.from(
    new Set([
      ...clientOwners,
      ...clients.map((client) => client.accountOwner).filter(Boolean)
    ])
  );
}

export function ContactsModule() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [flagFilter, setFlagFilter] = useState<ContactFlagFilter>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function loadContacts() {
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
            : "Unable to load contacts from the API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadContacts();
  }, []);

  const contacts = useMemo(() => flattenContacts(clients), [clients]);
  const owners = useMemo(() => ownerOptions(clients), [clients]);
  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    statusFilter !== "All" ||
    ownerFilter !== "All" ||
    flagFilter !== "All";

  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return contacts.filter((row) => {
      const siteName = contactSiteName(row.client, row.contact);
      const flags = row.flags.length ? row.flags : ["General"];
      const haystack = [
        row.contact.name,
        row.contact.firstName,
        row.contact.lastName,
        row.contact.title,
        row.contact.email,
        row.contact.phone,
        row.contact.mobile,
        row.client.displayName,
        row.client.legalName,
        row.client.companyName,
        row.client.clientNumber,
        siteName,
        row.client.accountOwner,
        row.client.status,
        flags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "All" || row.client.status === statusFilter;
      const matchesOwner =
        ownerFilter === "All" || row.client.accountOwner === ownerFilter;
      const matchesFlag =
        flagFilter === "All" || row.flags.includes(flagFilter);

      return matchesSearch && matchesStatus && matchesOwner && matchesFlag;
    });
  }, [contacts, flagFilter, ownerFilter, searchTerm, statusFilter]);

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("All");
    setOwnerFilter("All");
    setFlagFilter("All");
  }

  return (
    <div className="clients-module contacts-module">
      <section className="clients-command-bar">
        <div className="clients-command-primary">
          <Link className="toolbar-button compact clients-directory-return" href="/directory">
            <ArrowLeft size={16} />
            Directory
          </Link>
          <div>
            <nav className="breadcrumb clients-command-breadcrumb" aria-label="Breadcrumb">
              <Link href="/hub">Home</Link>
              <span>/</span>
              <Link href="/directory">Directory</Link>
              <span>/</span>
              <span>Contacts</span>
            </nav>
            <h2>Contacts</h2>
            <p className="clients-command-summary">
              <strong>Directory</strong>
              <span aria-hidden="true"> · </span>
              People connected to client accounts, sites, and relationships.
            </p>
          </div>
        </div>
      </section>

      <section className="clients-workspace contacts-workspace">
        <div className="client-list-panel">
          <div className="client-list-toolbar">
            <label className="lead-search">
              <Search size={17} />
              <input
                aria-label="Search contacts"
                placeholder="Search contacts, clients, sites, owners..."
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
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="All">All owners</option>
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
              <select
                value={flagFilter}
                onChange={(event) =>
                  setFlagFilter(event.target.value as ContactFlagFilter)
                }
              >
                {contactFlagFilters.map((flag) => (
                  <option key={flag} value={flag}>
                    {flag === "All" ? "All flags" : flag}
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
              Showing {filteredContacts.length} of {contacts.length} contacts
            </span>
            {hasActiveFilters ? <strong>Filters active</strong> : null}
          </div>

          {loadError ? <div className="form-alert error">{loadError}</div> : null}

          <div className="client-list" aria-busy={isLoading}>
            {filteredContacts.length ? (
              <>
                <div
                  className="client-list-header contact-list-header"
                  aria-hidden="true"
                >
                  <span>Contact</span>
                  <span>Client</span>
                  <span>Role / Flags</span>
                  <span>Email / Phone</span>
                  <span>Related site</span>
                  <span>Owner / Status</span>
                </div>
                {filteredContacts.map((row, index) => {
                  const siteName = contactSiteName(row.client, row.contact);
                  const flags = row.flags.length ? row.flags : ["General"];

                  return (
                    <Link
                      key={`${row.client.id}-${row.contact.id || index}`}
                      className="client-row contact-row"
                      href={`/clients/${row.client.id}`}
                    >
                      <span className="client-row-icon">
                        <UserRound size={20} />
                      </span>
                      <span className="client-row-primary">
                        <strong>{compactValue(row.contact.name)}</strong>
                        <small>{compactValue(row.contact.title)}</small>
                      </span>
                      <span>
                        <strong>{row.client.displayName}</strong>
                        <small>{row.client.clientNumber}</small>
                      </span>
                      <span>
                        <strong>{compactValue(row.contact.title)}</strong>
                        <small className="contact-flag-list">
                          {flags.map((flag) => (
                            <span className="contact-flag" key={flag}>
                              {flag}
                            </span>
                          ))}
                        </small>
                      </span>
                      <span>
                        <strong>{compactValue(row.contact.email)}</strong>
                        <small>{compactValue(contactPhone(row.contact))}</small>
                      </span>
                      <span>
                        <strong>{compactValue(siteName)}</strong>
                        <small>
                          {siteName ? "Client site" : `${row.client.sites.length} sites`}
                        </small>
                      </span>
                      <span>
                        <strong>{row.client.accountOwner}</strong>
                        <small className={statusClass(row.client.status)}>
                          {row.client.status}
                        </small>
                      </span>
                    </Link>
                  );
                })}
              </>
            ) : null}
          </div>

          {isLoading ? (
            <div className="lead-empty-state client-empty-state">
              <strong>Loading contacts...</strong>
            </div>
          ) : null}

          {!isLoading && filteredContacts.length === 0 ? (
            <div className="lead-empty-state client-empty-state">
              <strong>
                {contacts.length === 0
                  ? "No contacts have been captured yet."
                  : "No contacts match the current filters."}
              </strong>
              <span>
                {contacts.length === 0
                  ? "Add contacts from a client profile or during client creation."
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
                ) : (
                  <Link className="toolbar-button compact" href="/clients">
                    <Building2 size={16} />
                    View clients
                  </Link>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
