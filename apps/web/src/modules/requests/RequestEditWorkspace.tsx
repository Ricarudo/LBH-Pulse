"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Save,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ClientRecord } from "@/types/client";
import {
  requestPriorities,
  requestSources,
  requestTypes,
  serviceCategories,
  type RequestAssignee,
  type RequestPriority,
  type RequestRecord,
  type RequestSource,
  type RequestType,
  type ServiceCategory
} from "./requestData";

type EditFormState = {
  title: string;
  requestType: RequestType;
  source: RequestSource;
  serviceCategory: ServiceCategory;
  priority: RequestPriority;
  clientId: string;
  contactId: string;
  siteId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  siteName: string;
  siteAddress: string;
  city: string;
  state: string;
  assignedToId: string;
  receivedDate: string;
  dueDate: string;
  nextAction: string;
  nextFollowUpAt: string;
  missingInfo: string;
  siteVisitNeeded: boolean;
  siteVisitCompleted: boolean;
  description: string;
  internalNotes: string;
};

type RequestResponse = { request: RequestRecord };
type RequestListResponse = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
};
type ClientListResponse = { clients: ClientRecord[] };
type EditErrors = Partial<Record<keyof EditFormState | "form", string>>;

const editSections = [
  { id: "request-basics", label: "Request basics" },
  { id: "client-site", label: "Client, contact & site" },
  { id: "ownership-scheduling", label: "Ownership & scheduling" },
  { id: "intake-context", label: "Site visit & context" }
] as const;

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
      typeof data.error === "string" ? data.error : "Request failed."
    );
  }
  return data as T;
}

function formFromRequest(request: RequestRecord): EditFormState {
  return {
    title: request.title,
    requestType: request.requestType,
    source: request.source,
    serviceCategory: request.serviceCategory,
    priority: request.priority,
    clientId: request.clientId ?? "",
    contactId: request.contactId ?? "",
    siteId: request.siteId ?? "",
    companyName: request.companyName,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    contactPhone: request.contactPhone,
    siteName: request.siteName,
    siteAddress: request.siteAddress,
    city: request.city,
    state: request.state,
    assignedToId: request.assignedToId ?? "",
    receivedDate: request.receivedDate,
    dueDate: request.dueDate,
    nextAction: request.nextAction,
    nextFollowUpAt: request.nextFollowUpAt,
    missingInfo: request.missingInfo,
    siteVisitNeeded: request.siteVisitNeeded,
    siteVisitCompleted: request.siteVisitCompleted,
    description: request.description,
    internalNotes: request.internalNotes
  };
}

function validate(form: EditFormState): EditErrors {
  const errors: EditErrors = {};
  if (!form.title.trim()) errors.title = "Request title is required.";
  if (!form.companyName.trim() && !form.contactName.trim()) {
    errors.companyName = "Add a company or contact name.";
  }
  if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
    errors.contactEmail = "Enter a valid email address.";
  }
  if (
    form.siteVisitCompleted &&
    !form.siteVisitNeeded
  ) {
    errors.siteVisitCompleted =
      "Mark the site visit as required before recording it complete.";
  }
  return errors;
}

export function RequestEditWorkspace({
  requestId,
  returnTo
}: {
  requestId: string;
  returnTo: string;
}) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canWriteCrm = canRole(user?.role, "crm:write");
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [errors, setErrors] = useState<EditErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const recordHref = `/requests/${requestId}?returnTo=${encodeURIComponent(returnTo)}`;
  const selectedClient = clients.find((client) => client.id === form?.clientId);
  const isDirty = Boolean(
    request &&
      form &&
      JSON.stringify(form) !== JSON.stringify(formFromRequest(request))
  );

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [requestData, listData, clientData] = await Promise.all([
          requestJson<RequestResponse>(`/api/requests/${requestId}`, {
            cache: "no-store"
          }),
          requestJson<RequestListResponse>("/api/requests", {
            cache: "no-store"
          }),
          requestJson<ClientListResponse>("/api/clients", {
            cache: "no-store"
          })
        ]);
        setRequest(requestData.request);
        setForm(formFromRequest(requestData.request));
        setAssignees(listData.assignees);
        setClients(clientData.clients);
      } catch (loadError) {
        setErrors({
          form:
            loadError instanceof Error
              ? loadError.message
              : "Unable to load request."
        });
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [requestId]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const readinessPercent = useMemo(() => {
    if (!request?.checklistSummary.requiredTotal) return 0;
    return Math.round(
      (request.checklistSummary.requiredCompleted /
        request.checklistSummary.requiredTotal) *
        100
    );
  }, [request]);

  function updateField<K extends keyof EditFormState>(
    field: K,
    value: EditFormState[K]
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function selectClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      setForm((current) =>
        current
          ? { ...current, clientId: "", contactId: "", siteId: "" }
          : current
      );
      return;
    }
    const contact = client.primaryContact.id
      ? client.primaryContact
      : client.contacts[0];
    const site =
      client.sites.find((item) => item.isPrimarySite) ?? client.sites[0];
    setForm((current) =>
      current
        ? {
            ...current,
            clientId: client.id,
            companyName: client.displayName,
            contactId: contact?.id ?? "",
            contactName: contact?.name ?? "",
            contactEmail: contact?.email ?? "",
            contactPhone: contact?.phone ?? contact?.mobile ?? "",
            siteId: site?.id ?? "",
            siteName: site?.siteName ?? "",
            siteAddress: site?.address ?? "",
            city: site?.city ?? "",
            state: site?.state ?? "PR"
          }
        : current
    );
    setErrors({});
  }

  function selectContact(contactId: string) {
    const contact = selectedClient?.contacts.find((item) => item.id === contactId);
    setForm((current) =>
      current
        ? {
            ...current,
            contactId,
            contactName: contact?.name ?? current.contactName,
            contactEmail: contact?.email ?? current.contactEmail,
            contactPhone:
              contact?.phone ?? contact?.mobile ?? current.contactPhone
          }
        : current
    );
  }

  function selectSite(siteId: string) {
    const site = selectedClient?.sites.find((item) => item.id === siteId);
    setForm((current) =>
      current
        ? {
            ...current,
            siteId,
            siteName: site?.siteName ?? current.siteName,
            siteAddress: site?.address ?? current.siteAddress,
            city: site?.city ?? current.city,
            state: site?.state ?? current.state
          }
        : current
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !canWriteCrm) return;
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const firstField = Object.keys(nextErrors)[0];
      document
        .querySelector<HTMLElement>(`[name="${firstField}"]`)
        ?.focus();
      return;
    }

    try {
      setIsSaving(true);
      setErrors({});
      await requestJson<RequestResponse>(`/api/requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify(form)
      });
      router.push(recordHref);
    } catch (saveError) {
      setErrors({
        form:
          saveError instanceof Error
            ? saveError.message
            : "Unable to save request."
      });
    } finally {
      setIsSaving(false);
    }
  }

  function confirmNavigation() {
    return !isDirty || window.confirm("Discard your unsaved request changes?");
  }

  if (isLoading) {
    return (
      <section className="request-edit-skeleton" aria-label="Loading request editor">
        <div />
        <div />
        <div />
      </section>
    );
  }

  if (!request || !form) {
    return (
      <section className="request-record-empty">
        <AlertTriangle size={24} />
        <strong>{errors.form || "Request not found."}</strong>
        <Link href={returnTo}>Back to queue</Link>
      </section>
    );
  }

  return (
    <form className="request-edit-page" onSubmit={save}>
      <header className="request-edit-header">
        <Link href={recordHref} onClick={(event) => {
          if (!confirmNavigation()) event.preventDefault();
        }}>
          <ArrowLeft size={17} />
          Request
        </Link>
        <div>
          <span>{request.requestNumber}</span>
          <h1>Edit request</h1>
          <p>Update record details without manually overriding intake status.</p>
        </div>
        <div>
          <Link href={recordHref} onClick={(event) => {
            if (!confirmNavigation()) event.preventDefault();
          }}>Cancel</Link>
          <button type="submit" disabled={!canWriteCrm || !isDirty || isSaving}>
            <Save size={16} />
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </header>

      {errors.form ? (
        <div className="request-edit-error-summary" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Request could not be saved</strong>
            <span>{errors.form}</span>
          </div>
        </div>
      ) : null}

      <div className="request-edit-layout">
        <nav className="request-edit-nav" aria-label="Edit request sections">
          {editSections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.label}</a>
          ))}
        </nav>

        <div className="request-edit-sections">
          <section id="request-basics">
            <div className="request-edit-section-heading">
              <span><ClipboardList size={18} /></span>
              <div>
                <h2>Request basics</h2>
                <p>Define what came in and how Sales should prioritize it.</p>
              </div>
            </div>
            <div className="request-edit-field-grid">
              <label className="wide">
                Request title
                <input
                  name="title"
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? "edit-title-error" : undefined}
                />
                {errors.title ? <small id="edit-title-error">{errors.title}</small> : null}
              </label>
              <label>
                Request type
                <select value={form.requestType} onChange={(event) => updateField("requestType", event.target.value as RequestType)}>
                  {requestTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Source
                <select value={form.source} onChange={(event) => updateField("source", event.target.value as RequestSource)}>
                  {requestSources.map((source) => <option key={source}>{source}</option>)}
                </select>
              </label>
              <label>
                Service category
                <select value={form.serviceCategory} onChange={(event) => updateField("serviceCategory", event.target.value as ServiceCategory)}>
                  {serviceCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>
                Priority
                <select value={form.priority} onChange={(event) => updateField("priority", event.target.value as RequestPriority)}>
                  {requestPriorities.map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section id="client-site">
            <div className="request-edit-section-heading">
              <span><Building2 size={18} /></span>
              <div>
                <h2>Client, contact and site</h2>
                <p>Link Directory records while preserving the request snapshot.</p>
              </div>
            </div>
            <div className="request-edit-field-grid">
              <label>
                Client account
                <select value={form.clientId} onChange={(event) => selectClient(event.target.value)}>
                  <option value="">Unlinked / new prospect</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.displayName}</option>)}
                </select>
              </label>
              <label>
                Company name
                <input
                  name="companyName"
                  value={form.companyName}
                  onChange={(event) => {
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            companyName: event.target.value,
                            clientId: "",
                            contactId: "",
                            siteId: ""
                          }
                        : current
                    );
                    setErrors((current) => ({
                      ...current,
                      companyName: undefined,
                      form: undefined
                    }));
                  }}
                  aria-invalid={Boolean(errors.companyName)}
                  aria-describedby={errors.companyName ? "edit-company-error" : undefined}
                />
                {errors.companyName ? <small id="edit-company-error">{errors.companyName}</small> : null}
              </label>
              <label>
                Contact record
                <select value={form.contactId} onChange={(event) => selectContact(event.target.value)} disabled={!selectedClient}>
                  <option value="">No linked contact</option>
                  {(selectedClient?.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
              </label>
              <label>
                Contact name
                <input value={form.contactName} onChange={(event) => {
                  updateField("contactName", event.target.value);
                  updateField("contactId", "");
                }} />
              </label>
              <label>
                Email
                <input
                  name="contactEmail"
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => updateField("contactEmail", event.target.value)}
                  aria-invalid={Boolean(errors.contactEmail)}
                />
                {errors.contactEmail ? <small>{errors.contactEmail}</small> : null}
              </label>
              <label>
                Phone
                <input value={form.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} />
              </label>
              <label>
                Site record
                <select value={form.siteId} onChange={(event) => selectSite(event.target.value)} disabled={!selectedClient}>
                  <option value="">No linked site</option>
                  {(selectedClient?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
                </select>
              </label>
              <label>
                Site name
                <input value={form.siteName} onChange={(event) => {
                  updateField("siteName", event.target.value);
                  updateField("siteId", "");
                }} />
              </label>
              <label className="wide">
                Site address
                <input value={form.siteAddress} onChange={(event) => updateField("siteAddress", event.target.value)} />
              </label>
              <label>
                City
                <input value={form.city} onChange={(event) => updateField("city", event.target.value)} />
              </label>
              <label>
                State
                <input value={form.state} onChange={(event) => updateField("state", event.target.value)} />
              </label>
            </div>
          </section>

          <section id="ownership-scheduling">
            <div className="request-edit-section-heading">
              <span><CalendarClock size={18} /></span>
              <div>
                <h2>Ownership and scheduling</h2>
                <p>Set accountability and the next client-facing commitment.</p>
              </div>
            </div>
            <div className="request-edit-field-grid">
              <label>
                Owner
                <select value={form.assignedToId} onChange={(event) => updateField("assignedToId", event.target.value)}>
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
                </select>
              </label>
              <label>
                Received date
                <input type="date" value={form.receivedDate} onChange={(event) => updateField("receivedDate", event.target.value)} />
              </label>
              <label>
                Due date
                <input type="date" value={form.dueDate} onChange={(event) => updateField("dueDate", event.target.value)} />
              </label>
              <label>
                Follow-up date
                <input type="date" value={form.nextFollowUpAt} onChange={(event) => updateField("nextFollowUpAt", event.target.value)} />
              </label>
              <label className="wide">
                Next action
                <input value={form.nextAction} onChange={(event) => updateField("nextAction", event.target.value)} />
              </label>
            </div>
          </section>

          <section id="intake-context">
            <div className="request-edit-section-heading">
              <span><MapPin size={18} /></span>
              <div>
                <h2>Site visit and intake context</h2>
                <p>Capture context that supports qualification and handoff.</p>
              </div>
            </div>
            <div className="request-edit-field-grid">
              <label className="request-edit-check">
                <input
                  type="checkbox"
                  checked={form.siteVisitNeeded}
                  onChange={(event) => updateField("siteVisitNeeded", event.target.checked)}
                />
                <span>
                  <strong>Site visit required</strong>
                  <small>Adds site-visit completion to quote readiness.</small>
                </span>
              </label>
              <label className="request-edit-check">
                <input
                  name="siteVisitCompleted"
                  type="checkbox"
                  checked={form.siteVisitCompleted}
                  onChange={(event) => updateField("siteVisitCompleted", event.target.checked)}
                />
                <span>
                  <strong>Site visit completed</strong>
                  <small>Confirm only after the visit or review is complete.</small>
                </span>
                {errors.siteVisitCompleted ? <em>{errors.siteVisitCompleted}</em> : null}
              </label>
              <label className="wide">
                Additional missing information
                <input value={form.missingInfo} onChange={(event) => updateField("missingInfo", event.target.value)} />
              </label>
              <label className="wide">
                Intake description
                <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </label>
              <label className="wide">
                Internal summary
                <textarea value={form.internalNotes} onChange={(event) => updateField("internalNotes", event.target.value)} />
              </label>
            </div>
          </section>
        </div>

        <aside className="request-edit-summary">
          <span>Readiness</span>
          <strong>
            {request.checklistSummary.readyForQuote
              ? "Ready for quote"
              : `${request.checklistSummary.missingRequired.length} blockers`}
          </strong>
          <div role="progressbar" aria-label="Required checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readinessPercent}>
            <span style={{ width: `${readinessPercent}%` }} />
          </div>
          <p>
            {request.checklistSummary.requiredCompleted}/
            {request.checklistSummary.requiredTotal} required complete
          </p>
          {request.checklistSummary.missingRequired.length ? (
            <ul>
              {request.checklistSummary.missingRequired.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="success"><CheckCircle2 size={16} /> Required intake is complete.</p>
          )}
          <div className="request-edit-summary-actions">
            <Link href={recordHref} onClick={(event) => {
              if (!confirmNavigation()) event.preventDefault();
            }}>Cancel</Link>
            <button type="submit" disabled={!canWriteCrm || !isDirty || isSaving}>
              <Save size={16} />
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
          {isDirty ? <em>Unsaved changes</em> : <span>All changes saved</span>}
        </aside>
      </div>

      <div className="request-edit-mobile-save">
        <Link href={recordHref} onClick={(event) => {
          if (!confirmNavigation()) event.preventDefault();
        }}>Cancel</Link>
        <button type="submit" disabled={!canWriteCrm || !isDirty || isSaving}>
          <Save size={16} />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
