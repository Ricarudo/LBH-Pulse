"use client";

import {
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  ShieldAlert,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { ViewportPortal } from "@/components/ViewportPortal";
import { canUser } from "@pulse/contracts/auth";
import {
  clientIndustries,
  clientLanguages,
  clientOwners,
  clientPaymentTerms,
  clientSources,
  clientStatuses,
  preferredContactMethods,
  type ClientContact,
  type ClientRecord,
  type ClientStatus
} from "@pulse/contracts/clients";

type ClientEditWorkspaceProps = {
  clientId: string;
};

type ClientResponse = {
  client: ClientRecord;
};

type ApiErrorResponse = {
  error?: string;
  fields?: Record<string, string>;
};

type ClientEditState = {
  updatedAt: string;
  legalName: string;
  displayName: string;
  industry: string;
  website: string;
  status: ClientStatus;
  accountOwner: string;
  source: string;
  taxId: string;
  paymentTerms: string;
  preferredCurrency: string;
  preferredLanguage: string;
  invoiceRequirements: string;
  insuranceRequirements: string;
  purchaseOrderRequired: boolean;
  brandPreferences: string;
  technologyPreferences: string;
  generalNotes: string;
  preferredVendors: string;
  preferredCameraBrand: string;
  preferredAccessControlBrand: string;
  preferredNetworkBrand: string;
  preferredCablingBrand: string;
  standardTechnologies: string;
  documentationRequirements: string;
  serviceProfileText: string;
};

type ContactFormState = {
  id: string;
  name: string;
  role: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  preferredContactMethod: string;
  notes: string;
  isPrimary: boolean;
  isBilling: boolean;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
};

type ContactModalMode = "add" | "edit";

type ContactModalState = {
  mode: ContactModalMode;
  contact: ContactFormState;
};

const unsafeFreeTextPattern = /[<>]|javascript\s*:/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\-\s]*(?:(?:x|ext\.?)\s?\d{1,8})?$/i;

const contactLimits = {
  name: 160,
  role: 80,
  title: 120,
  department: 2000,
  email: 254,
  phone: 40,
  notes: 2000
};

function clientToFormState(client: ClientRecord): ClientEditState {
  return {
    updatedAt: client.updatedAt,
    legalName: client.legalName,
    displayName: client.displayName,
    industry: client.industry,
    website: client.website,
    status: client.status,
    accountOwner: client.accountOwner,
    source: client.source,
    taxId: client.taxId,
    paymentTerms: client.paymentTerms,
    preferredCurrency: client.preferredCurrency,
    preferredLanguage: client.preferredLanguage,
    invoiceRequirements: client.invoiceRequirements,
    insuranceRequirements: client.insuranceRequirements,
    purchaseOrderRequired: client.purchaseOrderRequired,
    brandPreferences: client.brandPreferences,
    technologyPreferences: client.technologyPreferences,
    generalNotes: client.generalNotes,
    preferredVendors: client.preferredVendors,
    preferredCameraBrand: client.preferredCameraBrand,
    preferredAccessControlBrand: client.preferredAccessControlBrand,
    preferredNetworkBrand: client.preferredNetworkBrand,
    preferredCablingBrand: client.preferredCablingBrand,
    standardTechnologies: client.standardTechnologies,
    documentationRequirements: client.documentationRequirements,
    serviceProfileText: client.serviceProfile.join(", ")
  };
}

function blankContact(): ContactFormState {
  return {
    id: "",
    name: "",
    role: "Primary",
    title: "",
    department: "",
    email: "",
    phone: "",
    preferredContactMethod: "Email",
    notes: "",
    isPrimary: false,
    isBilling: false,
    isPrimaryContact: false,
    isBillingContact: false,
    isTechnicalContact: false,
    isDecisionMaker: false
  };
}

function contactToFormState(contact: ClientContact): ContactFormState {
  const isPrimary = contact.isPrimary || contact.isPrimaryContact;
  const isBilling = contact.isBilling || contact.isBillingContact;

  return {
    id: contact.id,
    name: contact.name,
    role: contact.role || "Primary",
    title: contact.title,
    department: contact.department,
    email: contact.email,
    phone: contact.phone || contact.mobile,
    preferredContactMethod: contact.preferredContactMethod || "Email",
    notes: contact.notes,
    isPrimary,
    isBilling,
    isPrimaryContact: isPrimary,
    isBillingContact: isBilling,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker
  };
}

function normalizeText(value: string, collapseSpaces = false) {
  const trimmed = value.trim();
  return collapseSpaces ? trimmed.replace(/\s+/g, " ") : trimmed;
}

function compactValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  return value?.trim() || "Not captured";
}

function contactFlags(contact: ClientContact | ContactFormState) {
  return [
    contact.isPrimary || contact.isPrimaryContact ? "Primary" : "",
    contact.isBilling || contact.isBillingContact ? "Billing Contact" : "",
    contact.isTechnicalContact ? "Technical Contact" : "",
    contact.isDecisionMaker ? "Decision Maker" : ""
  ].filter(Boolean);
}

function splitContactName(name: string) {
  const [firstName = "", ...lastNameParts] = name.split(" ");
  return {
    firstName,
    lastName: lastNameParts.join(" ")
  };
}

function validateContactForm(contact: ContactFormState) {
  const normalized: ContactFormState = {
    ...contact,
    name: normalizeText(contact.name, true),
    role: normalizeText(contact.role, true),
    title: normalizeText(contact.title, true),
    department: normalizeText(contact.department, true),
    email: normalizeText(contact.email).toLowerCase(),
    phone: normalizeText(contact.phone, true),
    preferredContactMethod: normalizeText(contact.preferredContactMethod, true) || "Email",
    notes: normalizeText(contact.notes)
  };
  const errors: Record<string, string> = {};

  if (!normalized.name) {
    errors.name = "Contact name is required.";
  }

  if (!normalized.email && !normalized.phone) {
    errors.email = "Provide an email or phone.";
  }

  for (const [field, limit] of Object.entries(contactLimits)) {
    const value = normalized[field as keyof ContactFormState];
    if (typeof value === "string" && value.length > limit) {
      errors[field] = `Must be ${limit} characters or less.`;
    }
  }

  for (const field of ["name", "role", "title", "department", "email", "phone", "notes"] as const) {
    if (unsafeFreeTextPattern.test(normalized[field])) {
      errors[field] = "Remove HTML or script content.";
    }
  }

  if (normalized.email && !emailPattern.test(normalized.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (
    normalized.phone &&
    (!phonePattern.test(normalized.phone) || normalized.phone.replace(/\D/g, "").length < 7)
  ) {
    errors.phone = "Enter a valid phone number.";
  }

  return { normalized, errors };
}

function contactPayload(contact: ContactFormState) {
  const splitName = splitContactName(contact.name);
  const isPrimary = contact.isPrimary || contact.isPrimaryContact;
  const isBilling = contact.isBilling || contact.isBillingContact;

  return {
    name: contact.name,
    role: contact.role || "Primary",
    firstName: splitName.firstName || "Unknown",
    lastName: splitName.lastName,
    title: contact.title,
    department: contact.department,
    email: contact.email,
    phone: contact.phone,
    mobile: "",
    preferredContactMethod: contact.preferredContactMethod || (contact.email ? "Email" : "Phone"),
    isPrimary,
    isBilling,
    isPrimaryContact: isPrimary,
    isBillingContact: isBilling,
    isTechnicalContact: contact.isTechnicalContact,
    isDecisionMaker: contact.isDecisionMaker,
    notes: contact.notes
  };
}

async function requestClient(clientId: string) {
  const response = await fetch(`/api/clients/${clientId}`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as ClientResponse & ApiErrorResponse;

  if (!response.ok || !data.client) {
    throw new Error(data.error || "Unable to load this client.");
  }

  return data.client;
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorResponse;

  if (!response.ok) {
    const error = new Error(data.error || "Request failed.") as Error & {
      fields?: Record<string, string>;
    };
    error.fields = data.fields;
    throw error;
  }

  return data;
}

function FieldError({ name, errors }: { name: string; errors: Record<string, string> }) {
  const message = errors[name];
  return message ? <span className="field-error">{message}</span> : null;
}

function TextField({
  label,
  name,
  value,
  errors,
  onChange,
  type = "text",
  wide = false,
  maxLength
}: {
  label: string;
  name: string;
  value: string;
  errors: Record<string, string>;
  onChange: (value: string) => void;
  type?: string;
  wide?: boolean;
  maxLength?: number;
}) {
  return (
    <label className={wide ? "client-form-wide" : undefined}>
      {label}
      <input
        aria-invalid={Boolean(errors[name])}
        maxLength={maxLength}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError name={name} errors={errors} />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  value,
  errors,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  errors: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="client-form-wide">
      {label}
      <textarea
        aria-invalid={Boolean(errors[name])}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError name={name} errors={errors} />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  errors,
  options,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  errors: Record<string, string>;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-invalid={Boolean(errors[name])}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option || "blank"} value={option}>
            {option || "Not captured"}
          </option>
        ))}
      </select>
      <FieldError name={name} errors={errors} />
    </label>
  );
}

function SectionCard({
  title,
  icon,
  actions,
  children
}: {
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="client-edit-section-card">
      <div className="client-edit-section-heading">
        <div>
          {icon}
          <h3>{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ContactBadgeRow({ contact }: { contact: ClientContact | ContactFormState }) {
  const flags = contactFlags(contact);

  if (!flags.length) {
    return null;
  }

  return (
    <div className="client-edit-contact-badges">
      {flags.map((flag) => (
        <span className="client-edit-contact-badge" key={flag}>
          {flag}
        </span>
      ))}
    </div>
  );
}

function ContactModal({
  state,
  existingPrimaryName,
  errors,
  isSaving,
  onChange,
  onCancel,
  onSave
}: {
  state: ContactModalState;
  existingPrimaryName: string;
  errors: Record<string, string>;
  isSaving: boolean;
  onChange: (contact: ContactFormState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const contact = state.contact;
  const replacingPrimary =
    (contact.isPrimary || contact.isPrimaryContact) &&
    existingPrimaryName &&
    existingPrimaryName !== contact.name;

  return (
    <ViewportPortal>
      <div className="client-contact-modal-backdrop" role="presentation">
        <div
          aria-labelledby="client-contact-modal-title"
          aria-modal="true"
          className="client-contact-modal"
          role="dialog"
        >
        <div className="client-contact-modal-heading">
          <div>
            <span>{state.mode === "add" ? "New Point of Contact" : "Point of Contact"}</span>
            <h3 id="client-contact-modal-title">
              {state.mode === "add" ? "Add Contact" : "Edit Contact"}
            </h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close contact modal" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="client-form-grid">
          <TextField
            label="Name"
            name="name"
            value={contact.name}
            errors={errors}
            maxLength={160}
            onChange={(value) => onChange({ ...contact, name: value })}
            wide
          />
          <TextField
            label="Title / role"
            name="title"
            value={contact.title}
            errors={errors}
            maxLength={120}
            onChange={(value) => onChange({ ...contact, title: value })}
          />
          <TextField
            label="Role"
            name="role"
            value={contact.role}
            errors={errors}
            maxLength={80}
            onChange={(value) => onChange({ ...contact, role: value })}
          />
          <TextField
            label="Department"
            name="department"
            value={contact.department}
            errors={errors}
            maxLength={2000}
            onChange={(value) => onChange({ ...contact, department: value })}
          />
          <TextField
            label="Email"
            name="email"
            value={contact.email}
            errors={errors}
            maxLength={254}
            type="email"
            onChange={(value) => onChange({ ...contact, email: value })}
          />
          <TextField
            label="Phone"
            name="phone"
            value={contact.phone}
            errors={errors}
            maxLength={40}
            onChange={(value) => onChange({ ...contact, phone: value })}
          />
          <SelectField
            label="Preferred contact method"
            name="preferredContactMethod"
            value={contact.preferredContactMethod}
            errors={errors}
            options={preferredContactMethods}
            onChange={(value) => onChange({ ...contact, preferredContactMethod: value })}
          />
          <TextAreaField
            label="Notes"
            name="notes"
            value={contact.notes}
            errors={errors}
            onChange={(value) => onChange({ ...contact, notes: value })}
          />
        </div>

        <div className="client-checkbox-grid client-contact-modal-flags">
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isPrimary || contact.isPrimaryContact}
              onChange={(event) =>
                onChange({
                  ...contact,
                  isPrimary: event.target.checked,
                  isPrimaryContact: event.target.checked
                })
              }
            />
            Primary contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isBilling || contact.isBillingContact}
              onChange={(event) =>
                onChange({
                  ...contact,
                  isBilling: event.target.checked,
                  isBillingContact: event.target.checked
                })
              }
            />
            Billing contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isTechnicalContact}
              onChange={(event) =>
                onChange({ ...contact, isTechnicalContact: event.target.checked })
              }
            />
            Technical contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isDecisionMaker}
              onChange={(event) =>
                onChange({ ...contact, isDecisionMaker: event.target.checked })
              }
            />
            Decision maker
          </label>
        </div>

        {replacingPrimary ? (
          <p className="client-contact-primary-helper">
            This will replace the current primary contact.
          </p>
        ) : null}
        {errors.form ? <div className="form-alert error">{errors.form}</div> : null}

        <div className="client-contact-modal-actions">
          <button className="toolbar-button compact" type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button className="primary-button compact" type="button" onClick={onSave} disabled={isSaving}>
            <Save size={16} />
            {isSaving ? "Saving..." : "Save Contact"}
          </button>
        </div>
        </div>
      </div>
    </ViewportPortal>
  );
}

export function ClientEditWorkspace({ clientId }: ClientEditWorkspaceProps) {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [formState, setFormState] = useState<ClientEditState | null>(null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoadingClient, setIsLoadingClient] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactModal, setContactModal] = useState<ContactModalState | null>(null);

  const profileHref = `/clients/${client?.id ?? clientId}`;
  const canEdit = canUser(user, "clients:write");
  const primaryContact = useMemo(
    () => contacts.find((contact) => contact.isPrimary || contact.isPrimaryContact),
    [contacts]
  );

  useEffect(() => {
    if (isUserLoading || !canEdit) {
      return;
    }

    async function loadClient() {
      try {
        setIsLoadingClient(true);
        setLoadError("");
        const nextClient = await requestClient(clientId);
        setClient(nextClient);
        setContacts(nextClient.contacts);
        setFormState(clientToFormState(nextClient));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load this client.");
      } finally {
        setIsLoadingClient(false);
      }
    }

    void loadClient();
  }, [canEdit, clientId, isUserLoading]);

  function updateForm<K extends keyof ClientEditState>(key: K, value: ClientEditState[K]) {
    setFormState((current) => (current ? { ...current, [key]: value } : current));
  }

  function openAddContactModal() {
    setContactErrors({});
    setContactModal({ mode: "add", contact: blankContact() });
  }

  function openEditContactModal(contact: ClientContact) {
    setContactErrors({});
    setContactModal({ mode: "edit", contact: contactToFormState(contact) });
  }

  function closeContactModal() {
    if (!isSavingContact) {
      setContactModal(null);
      setContactErrors({});
    }
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState || isSavingClient) {
      return;
    }

    setIsSavingClient(true);
    setFieldErrors({});
    setMessage("");

    const payload = {
      updatedAt: formState.updatedAt,
      legalName: formState.legalName,
      displayName: formState.displayName,
      industry: formState.industry,
      website: formState.website,
      status: formState.status,
      accountOwner: formState.accountOwner,
      source: formState.source,
      taxId: formState.taxId,
      paymentTerms: formState.paymentTerms,
      preferredCurrency: formState.preferredCurrency,
      preferredLanguage: formState.preferredLanguage,
      invoiceRequirements: formState.invoiceRequirements,
      insuranceRequirements: formState.insuranceRequirements,
      purchaseOrderRequired: formState.purchaseOrderRequired,
      brandPreferences: formState.brandPreferences,
      technologyPreferences: formState.technologyPreferences,
      generalNotes: formState.generalNotes,
      preferredVendors: formState.preferredVendors,
      preferredCameraBrand: formState.preferredCameraBrand,
      preferredAccessControlBrand: formState.preferredAccessControlBrand,
      preferredNetworkBrand: formState.preferredNetworkBrand,
      preferredCablingBrand: formState.preferredCablingBrand,
      standardTechnologies: formState.standardTechnologies,
      documentationRequirements: formState.documentationRequirements,
      serviceProfile: formState.serviceProfileText
        .split(",")
        .map((service) => service.trim())
        .filter(Boolean)
    };

    try {
      const response = await requestJson<ClientResponse>(`/api/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setClient(response.client);
      setContacts(response.client.contacts);
      setFormState(clientToFormState(response.client));
      setMessage("Client changes saved.");
    } catch (error) {
      if (error instanceof Error && "fields" in error) {
        setFieldErrors((error.fields as Record<string, string> | undefined) ?? {});
      }
      setMessage(error instanceof Error ? error.message : "Unable to save this client.");
    } finally {
      setIsSavingClient(false);
    }
  }

  async function saveContact() {
    if (!contactModal || isSavingContact) {
      return;
    }

    const { normalized, errors } = validateContactForm(contactModal.contact);
    setContactModal({ ...contactModal, contact: normalized });
    setContactErrors(errors);

    if (Object.keys(errors).length) {
      return;
    }

    try {
      setIsSavingContact(true);
      const isEdit = contactModal.mode === "edit" && normalized.id;
      const endpoint = isEdit
        ? `/api/clients/${clientId}/contacts/${normalized.id}`
        : `/api/clients/${clientId}/contacts`;
      const method = isEdit ? "PATCH" : "POST";
      const response = await requestJson<ClientResponse>(endpoint, {
        method,
        body: JSON.stringify(contactPayload(normalized))
      });

      setClient(response.client);
      setContacts(response.client.contacts);
      setContactModal(null);
      setContactErrors({});
      setMessage(isEdit ? "Contact updated." : "Contact added.");
    } catch (error) {
      const nextErrors =
        error instanceof Error && "fields" in error
          ? ((error.fields as Record<string, string> | undefined) ?? {})
          : {};
      setContactErrors(
        Object.keys(nextErrors).length
          ? nextErrors
          : { form: error instanceof Error ? error.message : "Unable to save this contact." }
      );
    } finally {
      setIsSavingContact(false);
    }
  }

  if (isUserLoading) {
    return <div className="lead-empty-state">Checking client edit access...</div>;
  }

  if (!canEdit) {
    return (
      <section className="lead-empty-state detail">
        <ShieldAlert size={22} />
        <strong>Client management access is required to edit clients.</strong>
        <span>Client records are read-only for your current role.</span>
        <Link className="toolbar-button compact" href={`/clients/${clientId}`}>
          Back to profile
        </Link>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="lead-empty-state detail">
        <strong>{loadError}</strong>
        <Link className="toolbar-button compact" href={`/clients/${clientId}`}>
          Back to profile
        </Link>
      </section>
    );
  }

  if (isLoadingClient || !formState) {
    return <div className="lead-empty-state">Loading client edit form...</div>;
  }

  return (
    <>
      <form className="client-edit-page" onSubmit={saveClient}>
        <section className="client-edit-header">
          <Link className="toolbar-button compact" href={profileHref}>
            <ArrowLeft size={16} />
            Back to Client
          </Link>
          <div>
            <span>{client?.clientNumber}</span>
            <h1>Edit Client</h1>
          </div>
          <div className="client-edit-header-actions">
            <Link className="toolbar-button compact" href={profileHref}>
              Cancel
            </Link>
            <button className="primary-button compact" type="submit" disabled={isSavingClient}>
              <Save size={16} />
              {isSavingClient ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>

        {message ? (
          <div className={fieldErrors.form ? "form-alert error" : "form-alert"}>{message}</div>
        ) : null}
        {fieldErrors.form ? <div className="form-alert error">{fieldErrors.form}</div> : null}

        <div className="client-edit-section-stack">
          <SectionCard title="Company Info" icon={<Building2 size={18} />}>
            <div className="client-edit-grid">
              <TextField
                label="Legal name"
                name="legalName"
                value={formState.legalName}
                errors={fieldErrors}
                maxLength={160}
                onChange={(value) => updateForm("legalName", value)}
              />
              <TextField
                label="Display name"
                name="displayName"
                value={formState.displayName}
                errors={fieldErrors}
                maxLength={160}
                onChange={(value) => updateForm("displayName", value)}
              />
              <SelectField
                label="Status"
                name="status"
                value={formState.status}
                errors={fieldErrors}
                options={clientStatuses}
                onChange={(value) => updateForm("status", value as ClientStatus)}
              />
              <SelectField
                label="Industry"
                name="industry"
                value={formState.industry}
                errors={fieldErrors}
                options={clientIndustries}
                onChange={(value) => updateForm("industry", value)}
              />
              <SelectField
                label="Owner"
                name="accountOwner"
                value={formState.accountOwner}
                errors={fieldErrors}
                options={clientOwners}
                onChange={(value) => updateForm("accountOwner", value)}
              />
              <SelectField
                label="Source"
                name="source"
                value={formState.source}
                errors={fieldErrors}
                options={clientSources}
                onChange={(value) => updateForm("source", value)}
              />
              <SelectField
                label="Language"
                name="preferredLanguage"
                value={formState.preferredLanguage}
                errors={fieldErrors}
                options={clientLanguages}
                onChange={(value) => updateForm("preferredLanguage", value)}
              />
              <TextField
                label="Website"
                name="website"
                value={formState.website}
                errors={fieldErrors}
                maxLength={2048}
                onChange={(value) => updateForm("website", value)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Billing Details" icon={<CreditCard size={18} />}>
            <div className="client-edit-grid">
              <SelectField
                label="Payment terms"
                name="paymentTerms"
                value={formState.paymentTerms}
                errors={fieldErrors}
                options={clientPaymentTerms}
                onChange={(value) => updateForm("paymentTerms", value)}
              />
              <TextField
                label="Preferred currency"
                name="preferredCurrency"
                value={formState.preferredCurrency}
                errors={fieldErrors}
                maxLength={12}
                onChange={(value) => updateForm("preferredCurrency", value)}
              />
              <TextField
                label="Tax ID"
                name="taxId"
                value={formState.taxId}
                errors={fieldErrors}
                maxLength={2000}
                onChange={(value) => updateForm("taxId", value)}
              />
              <label className="client-checkbox client-edit-checkbox">
                <input
                  type="checkbox"
                  checked={formState.purchaseOrderRequired}
                  onChange={(event) => updateForm("purchaseOrderRequired", event.target.checked)}
                />
                Purchase order required
              </label>
              <TextAreaField
                label="Invoice requirements"
                name="invoiceRequirements"
                value={formState.invoiceRequirements}
                errors={fieldErrors}
                onChange={(value) => updateForm("invoiceRequirements", value)}
              />
              <TextAreaField
                label="Insurance requirements"
                name="insuranceRequirements"
                value={formState.insuranceRequirements}
                errors={fieldErrors}
                onChange={(value) => updateForm("insuranceRequirements", value)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Contacts"
            icon={<UserRound size={18} />}
            actions={
              <button className="toolbar-button compact" type="button" onClick={openAddContactModal}>
                <Plus size={16} />
                Add Contact
              </button>
            }
          >
            {contacts.length ? (
              <div className="client-edit-contact-list">
                {contacts.map((contact) => (
                  <article className="client-edit-contact-card" key={contact.id || contact.name}>
                    <div className="client-edit-contact-avatar" aria-hidden="true">
                      <UserRound size={17} />
                    </div>
                    <div className="client-edit-contact-main">
                      <div className="client-edit-contact-title">
                        <strong>{contact.name}</strong>
                        <span>{[contact.title, contact.role].filter(Boolean).join(" / ") || "No title captured"}</span>
                      </div>
                      {contact.department ? <span>{contact.department}</span> : null}
                      <div className="client-edit-contact-meta">
                        <span>
                          <Mail size={14} />
                          {compactValue(contact.email)}
                        </span>
                        <span>
                          <Phone size={14} />
                          {compactValue(contact.phone || contact.mobile)}
                        </span>
                        <span>{compactValue(contact.preferredContactMethod)}</span>
                      </div>
                      <ContactBadgeRow contact={contact} />
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Edit ${contact.name}`}
                      onClick={() => openEditContactModal(contact)}
                    >
                      <Pencil size={17} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="client-edit-empty-state">
                <span>No contacts have been added yet.</span>
                <button className="toolbar-button compact" type="button" onClick={openAddContactModal}>
                  <Plus size={16} />
                  Add Contact
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Technology Preferences" icon={<FileText size={18} />}>
            <div className="client-edit-grid">
              <TextField
                label="Service profile"
                name="serviceProfile"
                value={formState.serviceProfileText}
                errors={fieldErrors}
                onChange={(value) => updateForm("serviceProfileText", value)}
                wide
              />
              <TextField
                label="Preferred vendors"
                name="preferredVendors"
                value={formState.preferredVendors}
                errors={fieldErrors}
                onChange={(value) => updateForm("preferredVendors", value)}
                wide
              />
              <TextField
                label="Preferred camera platform"
                name="preferredCameraBrand"
                value={formState.preferredCameraBrand}
                errors={fieldErrors}
                onChange={(value) => updateForm("preferredCameraBrand", value)}
              />
              <TextField
                label="Preferred access control platform"
                name="preferredAccessControlBrand"
                value={formState.preferredAccessControlBrand}
                errors={fieldErrors}
                onChange={(value) => updateForm("preferredAccessControlBrand", value)}
              />
              <TextField
                label="Preferred network brand"
                name="preferredNetworkBrand"
                value={formState.preferredNetworkBrand}
                errors={fieldErrors}
                onChange={(value) => updateForm("preferredNetworkBrand", value)}
              />
              <TextField
                label="Preferred cabling brand"
                name="preferredCablingBrand"
                value={formState.preferredCablingBrand}
                errors={fieldErrors}
                onChange={(value) => updateForm("preferredCablingBrand", value)}
              />
              <TextField
                label="Standard technologies"
                name="standardTechnologies"
                value={formState.standardTechnologies}
                errors={fieldErrors}
                onChange={(value) => updateForm("standardTechnologies", value)}
                wide
              />
              <TextAreaField
                label="Technology preferences"
                name="technologyPreferences"
                value={formState.technologyPreferences}
                errors={fieldErrors}
                onChange={(value) => updateForm("technologyPreferences", value)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Notes / Documentation" icon={<FileText size={18} />}>
            <div className="client-edit-grid">
              <TextAreaField
                label="Important notes"
                name="generalNotes"
                value={formState.generalNotes}
                errors={fieldErrors}
                onChange={(value) => updateForm("generalNotes", value)}
              />
              <TextAreaField
                label="Brand preferences"
                name="brandPreferences"
                value={formState.brandPreferences}
                errors={fieldErrors}
                onChange={(value) => updateForm("brandPreferences", value)}
              />
              <TextAreaField
                label="Documentation requirements"
                name="documentationRequirements"
                value={formState.documentationRequirements}
                errors={fieldErrors}
                onChange={(value) => updateForm("documentationRequirements", value)}
              />
            </div>
          </SectionCard>
        </div>
      </form>

      {contactModal ? (
        <ContactModal
          state={contactModal}
          existingPrimaryName={primaryContact?.name ?? ""}
          errors={contactErrors}
          isSaving={isSavingContact}
          onChange={(contact) => setContactModal({ ...contactModal, contact })}
          onCancel={closeContactModal}
          onSave={saveContact}
        />
      ) : null}
    </>
  );
}
