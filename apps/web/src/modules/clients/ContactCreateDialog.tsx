"use client";

import { Save, X } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import {
  buildClientContactPayload,
  clientContactFields,
  clientContactLimits,
  createBlankClientContactDraft,
  validateClientContactDraft,
  type ClientContactDraft,
  type ClientContactField
} from "@/lib/forms/clientContact";
import {
  type FieldErrors,
  FormRequestError,
  formJson,
  mapApiErrors
} from "@/lib/forms/sanitization";
import {
  preferredContactMethods,
  type ClientRecord
} from "@/types/client";

type ContactCreateField = ClientContactField | "clientId" | "siteId";
type ContactCreateErrors = FieldErrors<ContactCreateField>;

type ContactCreateState = ClientContactDraft & {
  clientId: string;
  siteId: string;
  isPrimary: boolean;
  isBilling: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
};

type ClientResponse = {
  client: ClientRecord;
};

function blankContact(): ContactCreateState {
  return {
    ...createBlankClientContactDraft(),
    clientId: "",
    siteId: "",
    isPrimary: false,
    isBilling: false,
    isTechnicalContact: false,
    isDecisionMaker: false
  };
}

function apiFieldFromPath(path: string): ContactCreateField | "form" {
  const field = path.split(".").at(-1) ?? path;

  if (field === "siteId") {
    return "siteId";
  }

  return clientContactFields.includes(field as ClientContactField)
    ? (field as ClientContactField)
    : "form";
}

function fieldErrorId(field: ContactCreateField) {
  return `contact-create-${field}-error`;
}

function TextField({
  label,
  field,
  value,
  errors,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  required = false,
  wide = false
}: {
  label: string;
  field: ClientContactField;
  value: string;
  errors: ContactCreateErrors;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
  required?: boolean;
  wide?: boolean;
}) {
  const error = errors[field];
  const errorId = fieldErrorId(field);

  return (
    <label className={wide ? "client-form-wide" : undefined}>
      <span>
        {label}
        {required ? <small className="required-hint"> Required</small> : null}
      </span>
      <input
        name={field}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        maxLength={clientContactLimits[field]}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}

export function ContactCreateDialog({
  clients,
  onCancel,
  onCreated
}: {
  clients: ClientRecord[];
  onCancel: () => void;
  onCreated: (client: ClientRecord, contactName: string) => void;
}) {
  const [contact, setContact] = useState<ContactCreateState>(blankContact);
  const [errors, setErrors] = useState<ContactCreateErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const clientSelectRef = useRef<HTMLSelectElement | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const busyRef = useRef(false);
  busyRef.current = isSaving;

  const selectedClient =
    clients.find((client) => client.id === contact.clientId) ?? null;
  const existingPrimary = selectedClient?.contacts.find(
    (item) => item.isPrimary || item.isPrimaryContact
  );

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(
      () => clientSelectRef.current?.focus(),
      0
    );

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        onCancel();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
        )
      ).filter((element) => element.offsetParent !== null);

      if (!focusable.length) {
        return;
      }

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

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel]);

  function updateContact<K extends keyof ContactCreateState>(
    field: K,
    value: ContactCreateState[K]
  ) {
    setContact((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function selectClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    setContact((current) => ({
      ...current,
      clientId,
      siteId: "",
      isPrimary: client ? client.contacts.length === 0 : false
    }));
    setErrors((current) => ({
      ...current,
      clientId: undefined,
      siteId: undefined,
      form: undefined
    }));
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    const validation = validateClientContactDraft(contact);
    const nextErrors: ContactCreateErrors = { ...validation.errors };
    const client = clients.find((item) => item.id === contact.clientId);

    if (!client) {
      nextErrors.clientId = "Select the client account for this contact.";
    }

    if (
      contact.siteId &&
      !client?.sites.some((site) => site.id === contact.siteId)
    ) {
      nextErrors.siteId = "Select a site that belongs to this client.";
    }

    setContact((current) => ({ ...current, ...validation.normalized }));
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length || !client) {
      window.setTimeout(() => {
        dialogRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      }, 0);
      return;
    }

    const existingIds = new Set(client.contacts.map((item) => item.id));

    try {
      setIsSaving(true);
      setErrors({});
      const data = await formJson<ClientResponse>(
        `/api/clients/${client.id}/contacts`,
        {
          method: "POST",
          body: JSON.stringify(
            buildClientContactPayload(validation.normalized, {
              siteId: contact.siteId,
              primary: contact.isPrimary,
              billing: contact.isBilling,
              technical: contact.isTechnicalContact,
              decisionMaker: contact.isDecisionMaker
            })
          )
        },
        "Unable to create this contact."
      );
      const createdContact =
        data.client.contacts.find((item) => !existingIds.has(item.id)) ??
        data.client.contacts.find(
          (item) => item.name === validation.normalized.name
        );

      onCreated(
        data.client,
        createdContact?.name ?? validation.normalized.name
      );
    } catch (error) {
      setErrors(
        error instanceof FormRequestError
          ? mapApiErrors(error, apiFieldFromPath)
          : {
              form:
                error instanceof Error
                  ? error.message
                  : "Unable to create this contact."
            }
      );
    } finally {
      setIsSaving(false);
    }
  }

  return createPortal(
    <div
      className="client-contact-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onCancel();
        }
      }}
    >
      <form
        ref={dialogRef}
        aria-labelledby="contact-create-title"
        aria-modal="true"
        className="client-contact-modal contact-create-dialog"
        role="dialog"
        onSubmit={submitContact}
      >
        <div className="client-contact-modal-heading">
          <div>
            <span>Directory Contact</span>
            <h3 id="contact-create-title">Add New Contact</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close contact dialog"
            disabled={isSaving}
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>

        <p className="contact-create-intro">
          Choose the client relationship first, then capture a verified contact
          method.
        </p>

        <div className="client-form-grid">
          <label className="client-form-wide">
            <span>
              Client account
              <small className="required-hint"> Required</small>
            </span>
            <select
              ref={clientSelectRef}
              name="clientId"
              value={contact.clientId}
              aria-invalid={Boolean(errors.clientId)}
              aria-describedby={
                errors.clientId ? fieldErrorId("clientId") : undefined
              }
              onChange={(event) => selectClient(event.target.value)}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName} ({client.clientNumber})
                </option>
              ))}
            </select>
            {errors.clientId ? (
              <small className="field-error" id={fieldErrorId("clientId")}>
                {errors.clientId}
              </small>
            ) : null}
          </label>

          <label className="client-form-wide">
            Related site
            <select
              name="siteId"
              value={contact.siteId}
              disabled={!selectedClient}
              aria-invalid={Boolean(errors.siteId)}
              aria-describedby={
                errors.siteId ? fieldErrorId("siteId") : undefined
              }
              onChange={(event) => updateContact("siteId", event.target.value)}
            >
              <option value="">No specific site</option>
              {(selectedClient?.sites ?? []).map((site) => (
                <option key={site.id} value={site.id}>
                  {site.siteName}
                </option>
              ))}
            </select>
            {errors.siteId ? (
              <small className="field-error" id={fieldErrorId("siteId")}>
                {errors.siteId}
              </small>
            ) : null}
          </label>

          <TextField
            label="Name"
            field="name"
            value={contact.name}
            errors={errors}
            autoComplete="name"
            required
            wide
            onChange={(value) => updateContact("name", value)}
          />
          <TextField
            label="Title"
            field="title"
            value={contact.title}
            errors={errors}
            autoComplete="organization-title"
            onChange={(value) => updateContact("title", value)}
          />
          <TextField
            label="Role"
            field="role"
            value={contact.role}
            errors={errors}
            onChange={(value) => updateContact("role", value)}
          />
          <TextField
            label="Department"
            field="department"
            value={contact.department}
            errors={errors}
            autoComplete="organization"
            onChange={(value) => updateContact("department", value)}
          />
          <label>
            Preferred contact method
            <select
              name="preferredContactMethod"
              value={contact.preferredContactMethod}
              aria-invalid={Boolean(errors.preferredContactMethod)}
              aria-describedby={
                errors.preferredContactMethod
                  ? fieldErrorId("preferredContactMethod")
                  : undefined
              }
              onChange={(event) =>
                updateContact("preferredContactMethod", event.target.value)
              }
            >
              {preferredContactMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            {errors.preferredContactMethod ? (
              <small
                className="field-error"
                id={fieldErrorId("preferredContactMethod")}
              >
                {errors.preferredContactMethod}
              </small>
            ) : null}
          </label>
          <TextField
            label="Email"
            field="email"
            value={contact.email}
            errors={errors}
            type="email"
            inputMode="email"
            autoComplete="email"
            onChange={(value) => updateContact("email", value)}
          />
          <TextField
            label="Phone"
            field="phone"
            value={contact.phone}
            errors={errors}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            onChange={(value) => updateContact("phone", value)}
          />
          <label className="client-form-wide">
            Notes
            <textarea
              name="notes"
              value={contact.notes}
              maxLength={clientContactLimits.notes}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={
                errors.notes ? fieldErrorId("notes") : undefined
              }
              onChange={(event) => updateContact("notes", event.target.value)}
            />
            {errors.notes ? (
              <small className="field-error" id={fieldErrorId("notes")}>
                {errors.notes}
              </small>
            ) : null}
          </label>
        </div>

        <p className="contact-method-helper">
          Enter at least one valid contact method: email or phone.
        </p>

        <div className="client-checkbox-grid client-contact-modal-flags">
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isPrimary}
              onChange={(event) =>
                updateContact("isPrimary", event.target.checked)
              }
            />
            Primary contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isBilling}
              onChange={(event) =>
                updateContact("isBilling", event.target.checked)
              }
            />
            Billing contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isTechnicalContact}
              onChange={(event) =>
                updateContact("isTechnicalContact", event.target.checked)
              }
            />
            Technical contact
          </label>
          <label className="client-checkbox">
            <input
              type="checkbox"
              checked={contact.isDecisionMaker}
              onChange={(event) =>
                updateContact("isDecisionMaker", event.target.checked)
              }
            />
            Decision maker
          </label>
        </div>

        {contact.isPrimary && existingPrimary ? (
          <p className="client-contact-primary-helper">
            This will replace {existingPrimary.name} as the primary contact.
          </p>
        ) : null}

        {errors.form ? (
          <div className="form-alert error" role="alert">
            {errors.form}
          </div>
        ) : null}

        <div className="client-contact-modal-actions">
          <button
            className="toolbar-button compact"
            type="button"
            disabled={isSaving}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="primary-button compact"
            type="submit"
            disabled={isSaving}
          >
            <Save size={16} />
            {isSaving ? "Saving..." : "Save Contact"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
