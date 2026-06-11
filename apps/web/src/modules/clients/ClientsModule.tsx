"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
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
  clientTypes,
  formatMoney,
  type ClientCreatePayload,
  type ClientIndustry,
  type ClientRecord,
  type ClientStatus,
  type ClientType
} from "./clientData";

type ClientListResponse = {
  clients: ClientRecord[];
};

type ClientCreateResponse = {
  client: ClientRecord;
};

type ApiIssue = {
  path?: Array<string | number>;
  message?: string;
};

type ApiErrorBody = {
  error?: string;
  fields?: Record<string, string>;
  issues?: ApiIssue[];
};

class ClientRequestError extends Error {
  fields: Record<string, string>;
  issues: ApiIssue[];

  constructor(message: string, fields?: Record<string, string>, issues?: ApiIssue[]) {
    super(message);
    this.name = "ClientRequestError";
    this.fields = fields ?? {};
    this.issues = issues ?? [];
  }
}

type QuickCreateForm = {
  clientName: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: string;
};

type QuickCreateField = keyof QuickCreateForm;
type QuickCreateErrors = Partial<Record<QuickCreateField | "form", string>>;

const quickCreateLimits = {
  clientName: 160,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
  contactRole: 120
};

const unsafeFreeTextPattern = /[<>]|javascript\s*:/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createBlankQuickCreateForm(): QuickCreateForm {
  return {
    clientName: "",
    industry: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    contactRole: ""
  };
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

function normalizeText(value: string, collapseSpaces = false) {
  const trimmed = value.trim();
  return collapseSpaces ? trimmed.replace(/\s+/g, " ") : trimmed;
}

function normalizeEmail(value: string) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value: string) {
  return normalizeText(value, true);
}

function hasUnsafeFreeText(value: string) {
  return unsafeFreeTextPattern.test(value);
}

function isClientIndustry(value: string): value is ClientIndustry {
  return clientIndustries.includes(value as ClientIndustry);
}

function validateTextField(
  errors: QuickCreateErrors,
  field: QuickCreateField,
  value: string,
  limit: number
) {
  if (value.length > limit) {
    errors[field] = `Must be ${limit} characters or less.`;
    return;
  }

  if (hasUnsafeFreeText(value)) {
    errors[field] = "Remove HTML or script content.";
  }
}

function validateQuickCreateForm(form: QuickCreateForm) {
  const normalized: QuickCreateForm = {
    clientName: normalizeText(form.clientName, true),
    industry: normalizeText(form.industry),
    contactName: normalizeText(form.contactName, true),
    contactEmail: normalizeEmail(form.contactEmail),
    contactPhone: normalizePhone(form.contactPhone),
    contactRole: normalizeText(form.contactRole, true)
  };
  const errors: QuickCreateErrors = {};

  if (!normalized.clientName) {
    errors.clientName = "Client Name is required.";
  } else {
    validateTextField(
      errors,
      "clientName",
      normalized.clientName,
      quickCreateLimits.clientName
    );
  }

  if (!normalized.industry) {
    errors.industry = "Client Industry is required.";
  } else if (!isClientIndustry(normalized.industry)) {
    errors.industry = "Select a valid client industry.";
  }

  validateTextField(
    errors,
    "contactName",
    normalized.contactName,
    quickCreateLimits.contactName
  );
  validateTextField(
    errors,
    "contactPhone",
    normalized.contactPhone,
    quickCreateLimits.contactPhone
  );
  validateTextField(
    errors,
    "contactRole",
    normalized.contactRole,
    quickCreateLimits.contactRole
  );

  if (normalized.contactEmail.length > quickCreateLimits.contactEmail) {
    errors.contactEmail = `Must be ${quickCreateLimits.contactEmail} characters or less.`;
  } else if (
    normalized.contactEmail &&
    !emailPattern.test(normalized.contactEmail)
  ) {
    errors.contactEmail = "Enter a valid email address.";
  }

  return { normalized, errors };
}

function splitContactName(contactName: string) {
  const [firstName = "", ...lastNameParts] = contactName.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

function buildQuickCreatePayload(form: QuickCreateForm): ClientCreatePayload {
  const contactProvided = Boolean(
    form.contactName || form.contactEmail || form.contactPhone || form.contactRole
  );
  const contacts: ClientCreatePayload["contacts"] = [];

  if (contactProvided) {
    const { firstName, lastName } = splitContactName(form.contactName);

    contacts.push({
      firstName,
      lastName,
      title: form.contactRole,
      department: "",
      email: form.contactEmail,
      phone: form.contactPhone,
      mobile: "",
      preferredContactMethod: form.contactEmail
        ? "Email"
        : form.contactPhone
          ? "Phone"
          : "Email",
      isPrimaryContact: true,
      isBillingContact: false,
      isTechnicalContact: false,
      isDecisionMaker: false,
      notes: ""
    });
  }

  return {
    legalName: form.clientName,
    displayName: form.clientName,
    clientType: "Commercial",
    industry: form.industry,
    website: "",
    status: "Prospect",
    accountOwner: "Unassigned",
    mainPhone: "",
    mainEmail: "",
    taxId: "",
    paymentTerms: "",
    billingEmail: "",
    preferredCurrency: "USD",
    preferredLanguage: "English",
    brandPreferences: "",
    technologyPreferences: "",
    generalNotes: "",
    preferredVendors: "",
    preferredCameraBrand: "",
    preferredAccessControlBrand: "",
    preferredNetworkBrand: "",
    preferredCablingBrand: "",
    standardTechnologies: "",
    documentationRequirements: "",
    invoiceRequirements: "",
    insuranceRequirements: "",
    purchaseOrderRequired: false,
    sites: [],
    contacts,
    serviceProfile: []
  };
}

function popupFieldFromApiPath(path: string): QuickCreateField | "form" {
  if (path === "displayName" || path === "legalName") {
    return "clientName";
  }

  if (path === "industry") {
    return "industry";
  }

  if (path.startsWith("contacts.0.")) {
    const contactField = path.replace("contacts.0.", "");

    if (contactField === "firstName" || contactField === "lastName") {
      return "contactName";
    }

    if (contactField === "email") {
      return "contactEmail";
    }

    if (contactField === "phone" || contactField === "mobile") {
      return "contactPhone";
    }

    if (contactField === "title") {
      return "contactRole";
    }
  }

  return "form";
}

function mapApiErrorsToPopup(error: ClientRequestError): QuickCreateErrors {
  const mapped: QuickCreateErrors = {};

  for (const [path, message] of Object.entries(error.fields)) {
    const field = popupFieldFromApiPath(path);
    mapped[field] ??= message;
  }

  for (const issue of error.issues) {
    if (!issue.message || !issue.path) {
      continue;
    }

    const field = popupFieldFromApiPath(issue.path.map(String).join("."));
    mapped[field] ??= issue.message;
  }

  if (!Object.keys(mapped).length) {
    mapped.form = error.message;
  }

  return mapped;
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    throw new ClientRequestError(
      typeof data.error === "string" ? data.error : "Client request failed.",
      data.fields,
      data.issues
    );
  }

  return data as T;
}

export function ClientsModule() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | ClientType>("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState(createBlankQuickCreateForm);
  const [quickCreateErrors, setQuickCreateErrors] = useState<QuickCreateErrors>({});
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const clientNameInputRef = useRef<HTMLInputElement>(null);

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

    const { normalized, errors } = validateQuickCreateForm(quickCreateForm);
    setQuickCreateForm(normalized);

    if (Object.keys(errors).length) {
      setQuickCreateErrors(errors);
      return;
    }

    try {
      setIsCreatingClient(true);
      setQuickCreateErrors({});
      const data = await requestJson<ClientCreateResponse>("/api/clients", {
        method: "POST",
        body: JSON.stringify(buildQuickCreatePayload(normalized))
      });

      router.push(`/clients/${data.client.id}`);
    } catch (error) {
      if (error instanceof ClientRequestError) {
        setQuickCreateErrors(mapApiErrorsToPopup(error));
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
        <div>
          <p className="eyebrow">Directory / Clients</p>
          <h2>Clients</h2>
        </div>
        <div className="clients-hero-actions">
          <Link className="toolbar-button compact" href="/directory">
            <ArrowLeft size={16} />
            Directory
          </Link>
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
      ) : null}
    </div>
  );
}
