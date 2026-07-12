"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Filter,
  MapPin,
  Pencil,
  Plus,
  Search,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { canUser } from "@pulse/contracts/auth";
import {
  clientOwners,
  clientSiteTypes,
  clientStatuses,
  type ClientRecord,
  type ClientSite,
  type ClientSiteType,
  type ClientStatus
} from "@pulse/contracts/clients";
import { formJson } from "@/lib/forms/sanitization";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { ClientProfileSiteDialog } from "./ClientProfileDialogs";

type ClientListResponse = {
  clients: ClientRecord[];
};

type SiteRow = {
  client: ClientRecord;
  site: ClientSite;
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

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return value?.trim() || "Not captured";
}

function siteAddress(site: ClientSite) {
  return (
    site.address ||
    [
      site.addressLine1,
      site.addressLine2,
      [site.city, site.state, site.postalCode].filter(Boolean).join(" "),
      site.country
    ]
      .filter(Boolean)
      .join(", ") ||
    "No address captured"
  );
}

function flattenSites(clients: ClientRecord[]): SiteRow[] {
  return clients.flatMap((client) =>
    client.sites.map((site) => ({ client, site }))
  );
}

function siteSearchValues(row: SiteRow) {
  const { client, site } = row;
  return [
    site.siteName,
    site.name,
    site.siteType,
    site.address,
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.state,
    site.postalCode,
    site.country,
    site.operationalHours,
    site.accessInstructions,
    site.parkingInstructions,
    site.securityRequirements,
    site.siteNotes,
    client.displayName,
    client.legalName,
    client.clientNumber,
    client.accountOwner,
    client.status,
    client.primaryContact.name,
    client.primaryContact.email,
    client.primaryContact.phone,
    client.primaryContact.mobile
  ];
}

export function SitesModule() {
  const { user } = useCurrentUser();
  const canWriteSites = canUser(user, "clients:write");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [clientFilter, setClientFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | ClientSiteType>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [newSiteClientId, setNewSiteClientId] = useState("");
  const [pickerError, setPickerError] = useState("");
  const [siteEditor, setSiteEditor] = useState<{
    client: ClientRecord;
    site?: ClientSite;
  } | null>(null);

  useEffect(() => {
    async function loadSites() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await formJson<ClientListResponse>(
          "/api/clients",
          { cache: "no-store" },
          "Unable to load sites from the API."
        );
        setClients(data.clients);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load sites from the API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadSites();
  }, []);

  const sites = useMemo(() => flattenSites(clients), [clients]);
  const owners = useMemo(
    () =>
      Array.from(
        new Set([
          ...clientOwners,
          ...clients.map((client) => client.accountOwner).filter(Boolean)
        ])
      ),
    [clients]
  );
  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    clientFilter !== "All" ||
    statusFilter !== "All" ||
    typeFilter !== "All" ||
    ownerFilter !== "All";

  const filteredSites = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sites.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        siteSearchValues(row).join(" ").toLowerCase().includes(normalizedSearch);
      const matchesClient =
        clientFilter === "All" || row.client.id === clientFilter;
      const matchesStatus =
        statusFilter === "All" || row.client.status === statusFilter;
      const matchesType = typeFilter === "All" || row.site.siteType === typeFilter;
      const matchesOwner =
        ownerFilter === "All" || row.client.accountOwner === ownerFilter;

      return (
        matchesSearch &&
        matchesClient &&
        matchesStatus &&
        matchesType &&
        matchesOwner
      );
    });
  }, [clientFilter, clients, ownerFilter, searchTerm, sites, statusFilter, typeFilter]);

  function clearFilters() {
    setSearchTerm("");
    setClientFilter("All");
    setStatusFilter("All");
    setTypeFilter("All");
    setOwnerFilter("All");
  }

  function replaceClient(nextClient: ClientRecord) {
    setClients((current) =>
      current.some((client) => client.id === nextClient.id)
        ? current.map((client) =>
            client.id === nextClient.id ? nextClient : client
          )
        : [nextClient, ...current]
    );
  }

  function openCreateSite() {
    setSuccessMessage("");
    setPickerError("");
    setNewSiteClientId(clients.length === 1 ? clients[0].id : "");
    setClientPickerOpen(true);
  }

  function continueCreateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clients.find((item) => item.id === newSiteClientId);

    if (!client) {
      setPickerError("Select a client before adding a site.");
      return;
    }

    setClientPickerOpen(false);
    setSiteEditor({ client });
  }

  return (
    <div className="clients-module sites-module">
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
              <span>Sites / Locations</span>
            </nav>
            <h1>Sites / Locations</h1>
            <p className="clients-command-summary">
              <strong>Directory</strong>
              <span aria-hidden="true"> · </span>
              Customer offices, facilities, campuses, and job locations.
            </p>
          </div>
        </div>
        {canWriteSites ? (
          <button className="primary-button" type="button" onClick={openCreateSite}>
            <Plus size={17} />
            New Site
          </button>
        ) : null}
      </section>

      <section className="client-list-panel site-list-panel">
        <div className="client-list-toolbar">
          <label className="lead-search">
            <Search size={17} />
            <input
              aria-label="Search sites"
              placeholder="Search sites, clients, addresses, owners..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <div className="lead-filter-row">
            <Filter size={16} />
            <select
              aria-label="Filter sites by client"
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="All">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter sites by client status"
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
              aria-label="Filter sites by type"
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "All" | ClientSiteType)
              }
            >
              <option value="All">All site types</option>
              {clientSiteTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter sites by owner"
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
            {hasActiveFilters ? (
              <button className="toolbar-button compact" type="button" onClick={clearFilters}>
                <X size={16} />
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="client-list-meta">
          <span>
            Showing {filteredSites.length} of {sites.length} sites · {clients.length} clients
          </span>
          {hasActiveFilters ? <strong>Filters active</strong> : null}
        </div>

        {loadError ? <div className="form-alert error">{loadError}</div> : null}
        {successMessage ? (
          <div className="form-alert contact-create-success" role="status">
            {successMessage}
          </div>
        ) : null}

        <div className="client-list site-list" aria-busy={isLoading}>
          {filteredSites.length ? (
            <>
              <div className="client-list-header site-list-header" aria-hidden="true">
                <span>Site</span>
                <span>Client</span>
                <span>Location</span>
                <span>Primary contact</span>
                <span>Owner / status</span>
                <span>Actions</span>
              </div>
              {filteredSites.map(({ client, site }) => {
                const phone = client.primaryContact.phone || client.primaryContact.mobile;
                return (
                  <article className="client-row site-row" key={`${client.id}-${site.id}`}>
                    <Link
                      className="client-row-icon site-row-icon"
                      href={`/clients/${client.id}`}
                      aria-label={`Open ${client.displayName}`}
                    >
                      <MapPin size={20} />
                    </Link>
                    <span className="client-row-primary site-row-primary">
                      <Link href={`/clients/${client.id}`}>
                        <strong>{site.siteName}</strong>
                      </Link>
                      <small>{site.siteType || "Site"}</small>
                      {site.isPrimarySite ? (
                        <span className="status-pill">Primary site</span>
                      ) : null}
                    </span>
                    <span className="site-row-client">
                      <Link href={`/clients/${client.id}`}>
                        <strong>{client.displayName}</strong>
                      </Link>
                      <small>{client.clientNumber}</small>
                    </span>
                    <span>
                      <strong>{siteAddress(site)}</strong>
                      <small>
                        {[site.city, site.state].filter(Boolean).join(", ") || "Location not captured"}
                      </small>
                    </span>
                    <span>
                      <strong>{compactValue(client.primaryContact.name)}</strong>
                      <small>
                        {compactValue(client.primaryContact.email)}
                        {phone ? ` · ${phone}` : ""}
                      </small>
                    </span>
                    <span>
                      <strong>{client.accountOwner}</strong>
                      <small className={statusClass(client.status)}>{client.status}</small>
                    </span>
                    <span className="site-row-action">
                      {canWriteSites ? (
                        <button
                          className="toolbar-button compact"
                          type="button"
                          onClick={() => {
                            setSuccessMessage("");
                            setSiteEditor({ client, site });
                          }}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>
                      ) : (
                        <Link className="toolbar-button compact" href={`/clients/${client.id}`}>
                          Open
                        </Link>
                      )}
                    </span>
                  </article>
                );
              })}
            </>
          ) : null}
        </div>

        {isLoading ? (
          <div className="lead-empty-state client-empty-state">
            <strong>Loading sites...</strong>
          </div>
        ) : null}

        {!isLoading && filteredSites.length === 0 ? (
          <div className="lead-empty-state client-empty-state">
            <strong>
              {sites.length === 0
                ? "No sites have been captured yet."
                : "No sites match the current filters."}
            </strong>
            <span>
              {sites.length === 0
                ? "Add a site to a client account to make locations available across Requests and Projects."
                : "Clear filters or adjust the search phrase to widen the list."}
            </span>
            <div className="client-empty-actions">
              {hasActiveFilters ? (
                <button className="toolbar-button compact" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
              {canWriteSites && clients.length ? (
                <button className="primary-button" type="button" onClick={openCreateSite}>
                  <Plus size={17} />
                  Add first site
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
      </section>

      {clientPickerOpen ? (
        <div
          className="client-create-dialog-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setClientPickerOpen(false);
            }
          }}
        >
          <form
            className="client-create-dialog site-client-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-client-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={continueCreateSite}
          >
            <div className="client-create-dialog-header">
              <div>
                <p className="eyebrow">Directory</p>
                <h3 id="site-client-picker-title">Choose a client</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close choose client popup"
                onClick={() => setClientPickerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="site-picker-description">
              Sites belong to a client account. Choose the account that owns this location to continue.
            </p>
            <label className="material-field">
              <span>
                Client <small>Required</small>
              </span>
              <select
                aria-label="Client for new site"
                value={newSiteClientId}
                onChange={(event) => {
                  setNewSiteClientId(event.target.value);
                  setPickerError("");
                }}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName} · {client.clientNumber}
                  </option>
                ))}
              </select>
            </label>
            {pickerError ? <div className="form-alert error">{pickerError}</div> : null}
            {!clients.length ? (
              <div className="form-alert">
                Create a client account before adding a site.
              </div>
            ) : null}
            <div className="client-create-dialog-actions">
              <button
                className="toolbar-button compact"
                type="button"
                onClick={() => setClientPickerOpen(false)}
              >
                Cancel
              </button>
              {clients.length ? (
                <button className="primary-button compact" type="submit">
                  <MapPin size={16} />
                  Continue to site details
                </button>
              ) : (
                <Link className="primary-button compact" href="/clients">
                  <Building2 size={16} />
                  Create a client
                </Link>
              )}
            </div>
          </form>
        </div>
      ) : null}

      {siteEditor ? (
        <ClientProfileSiteDialog
          key={`${siteEditor.client.id}-${siteEditor.site?.id ?? "new"}`}
          client={siteEditor.client}
          site={siteEditor.site}
          onCancel={() => setSiteEditor(null)}
          onSaved={(nextClient, siteName) => {
            const wasEditing = Boolean(siteEditor.site);
            replaceClient(nextClient);
            setSiteEditor(null);
            setSuccessMessage(
              wasEditing
                ? `${siteName} site details were saved.`
                : `${siteName} was added as a client site.`
            );
          }}
        />
      ) : null}
    </div>
  );
}
