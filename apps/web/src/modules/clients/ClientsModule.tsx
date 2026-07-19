"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canUser } from "@pulse/contracts/auth";
import {
  buildQuickCreatePayload,
  createBlankQuickCreateForm,
  mapQuickCreateApiErrors,
  quickCreateLimits,
  validateQuickCreateForm,
  type QuickCreateErrors,
  type QuickCreateField
} from "@/lib/forms/clientQuickCreate";
// Directory and request intake share the same quick-create sanitation rules so
// a new client behaves consistently no matter where it is created.
import { FormRequestError, formJson } from "@/lib/forms/sanitization";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { ViewportPortal } from "@/components/ViewportPortal";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";
import {
  ArrowLeft,
  Building2,
  Filter,
  Plus,
  Search,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  clientIndustries,
  clientOwners,
  clientStatuses,
  type ClientIndustry,
  type ClientRecord,
  type ClientStatus
} from "@pulse/contracts/clients";

type ClientListResponse = {
  clients: ClientRecord[];
};

type ClientCreateResponse = {
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
  return formatWorkspaceDate(date) || "No activity";
}

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return value?.trim() || "Not captured";
}

export function ClientsModule() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [industryFilter, setIndustryFilter] = useState<"All" | ClientIndustry>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState(createBlankQuickCreateForm);
  const [quickCreateErrors, setQuickCreateErrors] = useState<QuickCreateErrors>({});
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const clientNameInputRef = useRef<HTMLInputElement>(null);

  const canWriteCrm = canUser(user, "clients:write");

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    statusFilter !== "All" ||
    industryFilter !== "All" ||
    ownerFilter !== "All";

  useEffect(() => {
    async function loadClients() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await formJson<ClientListResponse>(
          "/api/clients",
          { cache: "no-store" },
          "Unable to load clients from the API."
        );
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
    if (!isQuickCreateOpen) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      clientNameInputRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isCreatingClient) {
        setIsQuickCreateOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isCreatingClient, isQuickCreateOpen]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return clients.filter((client) => {
      const haystack = [
        client.id,
        client.clientNumber,
        client.displayName,
        client.legalName,
        client.companyName,
        client.industry,
        client.status,
        client.accountOwner,
        client.primaryContact.name,
        client.primaryContact.email,
        client.primaryContact.phone,
        client.primaryContact.mobile,
        ...client.contacts.flatMap((contact) => [
          contact.name,
          contact.role,
          contact.title,
          contact.email,
          contact.phone,
          contact.mobile
        ]),
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
      const matchesIndustry =
        industryFilter === "All" || client.industry === industryFilter;
      const matchesOwner =
        ownerFilter === "All" || client.accountOwner === ownerFilter;

      return matchesSearch && matchesStatus && matchesIndustry && matchesOwner;
    });
  }, [clients, industryFilter, ownerFilter, searchTerm, statusFilter]);

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("All");
    setIndustryFilter("All");
    setOwnerFilter("All");
  }

  function openQuickCreateDialog() {
    setQuickCreateForm(createBlankQuickCreateForm());
    setQuickCreateErrors({});
    setIsQuickCreateOpen(true);
  }

  function closeQuickCreateDialog() {
    if (isCreatingClient) {
      return;
    }

    setIsQuickCreateOpen(false);
    setQuickCreateErrors({});
  }

  function updateQuickCreateField(field: QuickCreateField, value: string) {
    setQuickCreateForm((current) => ({
      ...current,
      [field]: value
    }));
    setQuickCreateErrors((current) => {
      if (!current[field] && !current.form) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  async function handleQuickCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Normalize before validating, then store normalized values back into the
    // form so the user sees the exact payload that will be submitted.
    const { normalized, errors } = validateQuickCreateForm(quickCreateForm);
    setQuickCreateForm(normalized);

    if (Object.keys(errors).length) {
      setQuickCreateErrors(errors);
      return;
    }

    try {
      setIsCreatingClient(true);
      setQuickCreateErrors({});
      const data = await formJson<ClientCreateResponse>(
        "/api/clients",
        {
          method: "POST",
          body: JSON.stringify(buildQuickCreatePayload(normalized))
        },
        "Unable to create this client."
      );

      router.push(`/clients/${data.client.id}`);
    } catch (error) {
      if (error instanceof FormRequestError) {
        setQuickCreateErrors(mapQuickCreateApiErrors(error));
      } else {
        setQuickCreateErrors({
          form:
            error instanceof Error
              ? error.message
              : "Unable to create this client."
        });
      }
    } finally {
      setIsCreatingClient(false);
    }
  }

  return (
    <div className="clients-module">
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
              <span>Clients</span>
            </nav>
            <h1>Clients</h1>
            <p className="clients-command-summary">
              <strong>Directory</strong>
              <span aria-hidden="true"> · </span>
              Client accounts, contacts, sites, and relationship context.
            </p>
          </div>
        </div>
        <div className="clients-hero-actions">
          {canWriteCrm ? (
            <button className="primary-button" type="button" onClick={openQuickCreateDialog}>
              <Plus size={17} />
              New Client
            </button>
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
                value={industryFilter}
                onChange={(event) =>
                  setIndustryFilter(event.target.value as "All" | ClientIndustry)
                }
              >
                <option value="All">All industries</option>
                {clientIndustries.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
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
                            : `${client.industry || "Unclassified"} account`}
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
                        <strong>{compactValue(client.primaryContact.phone)}</strong>
                        <small>{compactValue(client.primaryContact.email)}</small>
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
                  <button
                    className="primary-button"
                    type="button"
                    onClick={openQuickCreateDialog}
                  >
                    <Plus size={17} />
                    Create new client
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

      </section>
      {isQuickCreateOpen ? (
        <ViewportPortal>
          <div
            className="client-create-dialog-scrim"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeQuickCreateDialog();
              }
            }}
          >
            <form
              className="client-create-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-client-dialog-title"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={handleQuickCreateSubmit}
            >
            <div className="client-create-dialog-header">
              <div>
                <p className="eyebrow">Directory</p>
                <h3 id="quick-client-dialog-title">Create New Client</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close create client popup"
                onClick={closeQuickCreateDialog}
                disabled={isCreatingClient}
              >
                <X size={18} />
              </button>
            </div>

            <div className="material-field-grid">
              <label className="material-field">
                <span>
                  Client Name <small>Required</small>
                </span>
                <input
                  ref={clientNameInputRef}
                  value={quickCreateForm.clientName}
                  maxLength={quickCreateLimits.clientName + 16}
                  aria-invalid={Boolean(quickCreateErrors.clientName)}
                  aria-describedby={
                    quickCreateErrors.clientName ? "quick-client-name-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("clientName", event.target.value)
                  }
                />
                {quickCreateErrors.clientName ? (
                  <small id="quick-client-name-error" className="field-error" role="alert">
                    {quickCreateErrors.clientName}
                  </small>
                ) : null}
              </label>

              <label className="material-field">
                <span>
                  Client Industry <small>Required</small>
                </span>
                <select
                  value={quickCreateForm.industry}
                  aria-invalid={Boolean(quickCreateErrors.industry)}
                  aria-describedby={
                    quickCreateErrors.industry ? "quick-client-industry-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("industry", event.target.value)
                  }
                >
                  <option value="">Select industry</option>
                  {clientIndustries.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
                {quickCreateErrors.industry ? (
                  <small
                    id="quick-client-industry-error"
                    className="field-error"
                    role="alert"
                  >
                    {quickCreateErrors.industry}
                  </small>
                ) : null}
              </label>

              <label className="material-field">
                <span>Point of Contact Name</span>
                <input
                  value={quickCreateForm.contactName}
                  maxLength={quickCreateLimits.contactName + 16}
                  aria-invalid={Boolean(quickCreateErrors.contactName)}
                  aria-describedby={
                    quickCreateErrors.contactName ? "quick-contact-name-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("contactName", event.target.value)
                  }
                />
                {quickCreateErrors.contactName ? (
                  <small id="quick-contact-name-error" className="field-error" role="alert">
                    {quickCreateErrors.contactName}
                  </small>
                ) : null}
              </label>

              <label className="material-field">
                <span>Point of Contact Email</span>
                <input
                  type="email"
                  value={quickCreateForm.contactEmail}
                  maxLength={quickCreateLimits.contactEmail + 16}
                  aria-invalid={Boolean(quickCreateErrors.contactEmail)}
                  aria-describedby={
                    quickCreateErrors.contactEmail ? "quick-contact-email-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("contactEmail", event.target.value)
                  }
                />
                {quickCreateErrors.contactEmail ? (
                  <small id="quick-contact-email-error" className="field-error" role="alert">
                    {quickCreateErrors.contactEmail}
                  </small>
                ) : null}
              </label>

              <label className="material-field">
                <span>Point of Contact Phone</span>
                <input
                  value={quickCreateForm.contactPhone}
                  maxLength={quickCreateLimits.contactPhone + 16}
                  aria-invalid={Boolean(quickCreateErrors.contactPhone)}
                  aria-describedby={
                    quickCreateErrors.contactPhone ? "quick-contact-phone-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("contactPhone", event.target.value)
                  }
                />
                {quickCreateErrors.contactPhone ? (
                  <small id="quick-contact-phone-error" className="field-error" role="alert">
                    {quickCreateErrors.contactPhone}
                  </small>
                ) : null}
              </label>

              <label className="material-field">
                <span>Point of Contact Role</span>
                <input
                  value={quickCreateForm.contactRole}
                  maxLength={quickCreateLimits.contactRole + 16}
                  aria-invalid={Boolean(quickCreateErrors.contactRole)}
                  aria-describedby={
                    quickCreateErrors.contactRole ? "quick-contact-role-error" : undefined
                  }
                  disabled={isCreatingClient}
                  onChange={(event) =>
                    updateQuickCreateField("contactRole", event.target.value)
                  }
                />
                {quickCreateErrors.contactRole ? (
                  <small id="quick-contact-role-error" className="field-error" role="alert">
                    {quickCreateErrors.contactRole}
                  </small>
                ) : null}
              </label>
            </div>

            {quickCreateErrors.form ? (
              <div className="form-alert error">{quickCreateErrors.form}</div>
            ) : null}

            <div className="client-create-dialog-actions">
              <button
                className="toolbar-button compact"
                type="button"
                onClick={closeQuickCreateDialog}
                disabled={isCreatingClient}
              >
                Cancel
              </button>
              <button
                className="primary-button compact"
                type="submit"
                disabled={isCreatingClient}
              >
                <Plus size={17} />
                {isCreatingClient ? "Creating..." : "Create Client"}
              </button>
            </div>
            </form>
          </div>
        </ViewportPortal>
      ) : null}
    </div>
  );
}
