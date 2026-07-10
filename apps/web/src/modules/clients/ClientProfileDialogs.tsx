"use client";

import { Save, X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildClientContactPayload,
  createBlankClientContactDraft,
  validateClientContactDraft,
  type ClientContactDraft
} from "@/lib/forms/clientContact";
import {
  FormRequestError,
  formJson,
  mapApiErrors,
  normalizeText,
  validateCleanText,
  type FieldErrors
} from "@/lib/forms/sanitization";
import {
  clientSiteTypes,
  preferredContactMethods,
  type ClientRecord,
  type ClientSite
} from "@/types/client";

type ClientResponse = { client: ClientRecord };

type ContactState = ClientContactDraft & {
  siteId: string;
  isPrimary: boolean;
  isBilling: boolean;
  isTechnicalContact: boolean;
  isDecisionMaker: boolean;
};

type SiteField =
  | "siteName"
  | "siteType"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "postalCode"
  | "country"
  | "googleMapsUrl"
  | "operationalHours"
  | "accessInstructions"
  | "parkingInstructions"
  | "securityRequirements"
  | "siteNotes";

type SiteState = Record<SiteField, string> & { isPrimarySite: boolean };

const siteLimits: Record<Exclude<SiteField, "googleMapsUrl">, number> = {
  siteName: 160,
  siteType: 80,
  addressLine1: 2000,
  addressLine2: 2000,
  city: 2000,
  state: 2000,
  postalCode: 2000,
  country: 2000,
  operationalHours: 2000,
  accessInstructions: 2000,
  parkingInstructions: 2000,
  securityRequirements: 2000,
  siteNotes: 2000
};

function blankContact(client: ClientRecord): ContactState {
  return {
    ...createBlankClientContactDraft(),
    siteId: "",
    isPrimary: client.contacts.length === 0,
    isBilling: false,
    isTechnicalContact: false,
    isDecisionMaker: false
  };
}

function blankSite(): SiteState {
  return {
    siteName: "",
    siteType: "Main Office",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "PR",
    postalCode: "",
    country: "Puerto Rico",
    googleMapsUrl: "",
    operationalHours: "",
    accessInstructions: "",
    parkingInstructions: "",
    securityRequirements: "",
    siteNotes: "",
    isPrimarySite: false
  };
}

function siteToState(site: ClientSite): SiteState {
  return {
    siteName: site.siteName,
    siteType: site.siteType || "Main Office",
    addressLine1: site.addressLine1,
    addressLine2: site.addressLine2,
    city: site.city,
    state: site.state || "PR",
    postalCode: site.postalCode,
    country: site.country || "Puerto Rico",
    googleMapsUrl: site.googleMapsUrl,
    operationalHours: site.operationalHours,
    accessInstructions: site.accessInstructions,
    parkingInstructions: site.parkingInstructions,
    securityRequirements: site.securityRequirements,
    siteNotes: site.siteNotes,
    isPrimarySite: site.isPrimarySite
  };
}

function useDialogFocus(
  ref: RefObject<HTMLFormElement | null>,
  onCancel: () => void,
  isSaving: boolean
) {
  const savingRef = useRef(isSaving);
  savingRef.current = isSaving;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const timer = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) {
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !ref.current) return;
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")).filter((item) => item.offsetParent !== null);
      if (!focusable.length) return;
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel, ref]);
}

export function ClientProfileContactDialog({
  client,
  onCancel,
  onSaved
}: {
  client: ClientRecord;
  onCancel: () => void;
  onSaved: (client: ClientRecord, contactName: string) => void;
}) {
  const [contact, setContact] = useState<ContactState>(() => blankContact(client));
  const [errors, setErrors] = useState<FieldErrors<keyof ContactState>>({});
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  useDialogFocus(dialogRef, onCancel, isSaving);
  const primaryContact = client.contacts.find((item) => item.isPrimary || item.isPrimaryContact);

  function update<K extends keyof ContactState>(key: K, value: ContactState[K]) {
    setContact((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const validation = validateClientContactDraft(contact);
    const nextErrors = { ...validation.errors } as FieldErrors<keyof ContactState>;
    setContact((current) => ({ ...current, ...validation.normalized }));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      setIsSaving(true);
      const response = await formJson<ClientResponse>(
        `/api/clients/${client.id}/contacts`,
        {
          method: "POST",
          body: JSON.stringify(buildClientContactPayload(validation.normalized, {
            siteId: contact.siteId,
            primary: contact.isPrimary,
            billing: contact.isBilling,
            technical: contact.isTechnicalContact,
            decisionMaker: contact.isDecisionMaker
          }))
        },
        "Unable to add this point of contact."
      );
      onSaved(response.client, validation.normalized.name);
    } catch (error) {
      setErrors(error instanceof FormRequestError ? mapApiErrors(error, (path) => path.split(".").at(-1) as keyof ContactState) : { form: error instanceof Error ? error.message : "Unable to add this point of contact." });
    } finally {
      setIsSaving(false);
    }
  }

  return createPortal(
    <div className="client-profile-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isSaving && onCancel()}>
      <form ref={dialogRef} className="client-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-contact-dialog-title" onSubmit={submit}>
        <div className="client-profile-dialog-heading">
          <div><span>Point of Contact</span><h2 id="profile-contact-dialog-title">Add contact</h2></div>
          <button className="icon-button" type="button" aria-label="Close add contact dialog" disabled={isSaving} onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="client-form-grid">
          <label className="client-form-wide">Name <small className="required-hint">Required</small><input value={contact.name} autoComplete="name" aria-invalid={Boolean(errors.name)} onChange={(event) => update("name", event.target.value)} />{errors.name ? <small className="field-error">{errors.name}</small> : null}</label>
          <label>Title<input value={contact.title} autoComplete="organization-title" aria-invalid={Boolean(errors.title)} onChange={(event) => update("title", event.target.value)} />{errors.title ? <small className="field-error">{errors.title}</small> : null}</label>
          <label>Email<input type="email" inputMode="email" value={contact.email} autoComplete="email" aria-invalid={Boolean(errors.email)} onChange={(event) => update("email", event.target.value)} />{errors.email ? <small className="field-error">{errors.email}</small> : null}</label>
          <label>Phone<input type="tel" inputMode="tel" value={contact.phone} autoComplete="tel" aria-invalid={Boolean(errors.phone)} onChange={(event) => update("phone", event.target.value)} />{errors.phone ? <small className="field-error">{errors.phone}</small> : null}</label>
        </div>
        <label className="client-checkbox client-profile-dialog-primary"><input type="checkbox" checked={contact.isPrimary} onChange={(event) => update("isPrimary", event.target.checked)} />Primary contact</label>
        {contact.isPrimary && primaryContact ? <p className="client-contact-primary-helper">This will replace {primaryContact.name} as the primary contact.</p> : null}
        <details className="client-profile-dialog-details">
          <summary>More details</summary>
          <div className="client-form-grid">
            <label>Role<input value={contact.role} onChange={(event) => update("role", event.target.value)} /></label>
            <label>Department<input value={contact.department} onChange={(event) => update("department", event.target.value)} /></label>
            <label>Preferred method<select value={contact.preferredContactMethod} onChange={(event) => update("preferredContactMethod", event.target.value)}>{preferredContactMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label>Related site<select value={contact.siteId} onChange={(event) => update("siteId", event.target.value)}><option value="">No specific site</option>{client.sites.map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}</select></label>
            <label className="client-form-wide">Notes<textarea value={contact.notes} onChange={(event) => update("notes", event.target.value)} /></label>
          </div>
          <div className="client-checkbox-grid client-contact-modal-flags">
            <label className="client-checkbox"><input type="checkbox" checked={contact.isBilling} onChange={(event) => update("isBilling", event.target.checked)} />Billing contact</label>
            <label className="client-checkbox"><input type="checkbox" checked={contact.isTechnicalContact} onChange={(event) => update("isTechnicalContact", event.target.checked)} />Technical contact</label>
            <label className="client-checkbox"><input type="checkbox" checked={contact.isDecisionMaker} onChange={(event) => update("isDecisionMaker", event.target.checked)} />Decision maker</label>
          </div>
        </details>
        {errors.form ? <div className="form-alert error" role="alert">{errors.form}</div> : null}
        <div className="client-profile-dialog-actions"><button className="toolbar-button compact" type="button" disabled={isSaving} onClick={onCancel}>Cancel</button><button className="primary-button compact" type="submit" disabled={isSaving}><Save size={16} />{isSaving ? "Saving..." : "Add Contact"}</button></div>
      </form>
    </div>,
    document.body
  );
}

export function ClientProfileSiteDialog({
  client,
  site,
  onCancel,
  onSaved
}: {
  client: ClientRecord;
  site?: ClientSite;
  onCancel: () => void;
  onSaved: (client: ClientRecord, siteName: string) => void;
}) {
  const [form, setForm] = useState<SiteState>(() => site ? siteToState(site) : blankSite());
  const [errors, setErrors] = useState<FieldErrors<SiteField>>({});
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  useDialogFocus(dialogRef, onCancel, isSaving);
  const primarySite = client.sites.find((item) => item.isPrimarySite);
  const isEdit = Boolean(site?.id);

  function update<K extends keyof SiteState>(key: K, value: SiteState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  function validate() {
    const normalized = { ...form };
    (Object.keys(siteLimits) as Array<keyof typeof siteLimits>).forEach((field) => {
      normalized[field] = normalizeText(normalized[field], field === "siteName");
    });
    normalized.googleMapsUrl = normalizeText(normalized.googleMapsUrl, true);
    const nextErrors: FieldErrors<SiteField> = {};
    if (!normalized.siteName) nextErrors.siteName = "Site name is required.";
    (Object.keys(siteLimits) as Array<keyof typeof siteLimits>).forEach((field) => validateCleanText(nextErrors, field, normalized[field], siteLimits[field]));
    validateCleanText(nextErrors, "googleMapsUrl", normalized.googleMapsUrl, 2048);
    return { normalized, errors: nextErrors };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const validation = validate();
    setForm(validation.normalized);
    setErrors(validation.errors);
    if (Object.keys(validation.errors).length) return;
    try {
      setIsSaving(true);
      const response = await formJson<ClientResponse>(
        isEdit ? `/api/clients/${client.id}/sites/${site?.id}` : `/api/clients/${client.id}/sites`,
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify({ localId: "", ...validation.normalized }) },
        `Unable to ${isEdit ? "update" : "add"} this site.`
      );
      onSaved(response.client, validation.normalized.siteName);
    } catch (error) {
      setErrors(error instanceof FormRequestError ? mapApiErrors(error, (path) => path.split(".").at(-1) as SiteField) : { form: error instanceof Error ? error.message : "Unable to save this site." });
    } finally {
      setIsSaving(false);
    }
  }

  const field = (label: string, name: SiteField, wide = false) => <label className={wide ? "client-form-wide" : undefined}>{label}<input value={form[name]} aria-invalid={Boolean(errors[name])} onChange={(event) => update(name, event.target.value)} />{errors[name] ? <small className="field-error">{errors[name]}</small> : null}</label>;

  return createPortal(
    <div className="client-profile-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isSaving && onCancel()}>
      <form ref={dialogRef} className="client-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-site-dialog-title" onSubmit={submit}>
        <div className="client-profile-dialog-heading"><div><span>Client Site</span><h2 id="profile-site-dialog-title">{isEdit ? "Edit site" : "Add site"}</h2></div><button className="icon-button" type="button" aria-label="Close site dialog" disabled={isSaving} onClick={onCancel}><X size={18} /></button></div>
        <div className="client-form-grid">
          <label>Site name <small className="required-hint">Required</small><input value={form.siteName} aria-invalid={Boolean(errors.siteName)} onChange={(event) => update("siteName", event.target.value)} />{errors.siteName ? <small className="field-error">{errors.siteName}</small> : null}</label>
          <label>Site type<select value={form.siteType} onChange={(event) => update("siteType", event.target.value)}>{clientSiteTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          {field("Address line 1", "addressLine1", true)}
          {field("City", "city")}
          {field("State", "state")}
          {field("Postal code", "postalCode")}
          {field("Country", "country")}
        </div>
        <label className="client-checkbox client-profile-dialog-primary"><input type="checkbox" checked={form.isPrimarySite} onChange={(event) => update("isPrimarySite", event.target.checked)} />Primary site</label>
        {form.isPrimarySite && primarySite && primarySite.id !== site?.id ? <p className="client-contact-primary-helper">This will replace {primarySite.siteName} as the primary site.</p> : null}
        <details className="client-profile-dialog-details" open={isEdit ? undefined : false}>
          <summary>More site details</summary>
          <div className="client-form-grid">
            {field("Address line 2", "addressLine2", true)}
            {field("Google Maps URL", "googleMapsUrl", true)}
            {field("Operational hours", "operationalHours")}
            {field("Access instructions", "accessInstructions")}
            {field("Parking instructions", "parkingInstructions")}
            {field("Security requirements", "securityRequirements")}
            <label className="client-form-wide">Site notes<textarea value={form.siteNotes} onChange={(event) => update("siteNotes", event.target.value)} /></label>
          </div>
        </details>
        {errors.form ? <div className="form-alert error" role="alert">{errors.form}</div> : null}
        <div className="client-profile-dialog-actions"><button className="toolbar-button compact" type="button" disabled={isSaving} onClick={onCancel}>Cancel</button><button className="primary-button compact" type="submit" disabled={isSaving}><Save size={16} />{isSaving ? "Saving..." : isEdit ? "Save Site" : "Add Site"}</button></div>
      </form>
    </div>,
    document.body
  );
}
