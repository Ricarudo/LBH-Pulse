"use client";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Save,
  StickyNote,
  UserCheck
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ActivityRecord } from "@/types/activity";
import type { ClientRecord } from "@/types/client";
import { RequestChecklistSignature } from "./RequestChecklistSignature";
import {
  requestPriorities,
  requestSources,
  requestStatuses,
  requestTypes,
  serviceCategories,
  type RequestAssignee,
  type RequestChecklistItem,
  type RequestPriority,
  type RequestRecord,
  type RequestSource,
  type RequestStatus,
  type RequestType,
  type ServiceCategory
} from "./requestData";

type RequestRouteMode = "new" | "view" | "edit";

type RequestFormState = {
  title: string;
  requestType: RequestType;
  source: RequestSource;
  serviceCategory: ServiceCategory;
  status: RequestStatus;
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

type RequestListResponse = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
};

type RequestResponse = {
  request: RequestRecord;
};

type ClientListResponse = { clients: ClientRecord[] };

type ActivityListResponse = {
  activities: ActivityRecord[];
};

const requestDetailTabs = ["Notes", "Workflow", "Files", "Quote", "Activity"] as const;
type RequestDetailTab = (typeof requestDetailTabs)[number];

const today = new Date().toISOString().slice(0, 10);

function sortChecklistItems(items: RequestChecklistItem[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function groupChecklistItems(items: RequestChecklistItem[]) {
  return items.reduce<Record<string, RequestChecklistItem[]>>((groups, item) => {
    const key = item.group || "Intake";
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}

function checklistItemClass(item: RequestChecklistItem, missingRequired: boolean) {
  return [
    "request-checklist-item",
    item.completed ? "complete" : "",
    !item.applicable ? "muted" : "",
    missingRequired ? "missing" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function checklistItemMeta(item: RequestChecklistItem) {
  return [
    item.required ? "Required" : "Optional",
    !item.applicable ? "Not applicable" : "",
    item.notes
  ]
    .filter(Boolean)
    .join(" - ");
}

function emptyForm(defaultAssignedToId = ""): RequestFormState {
  return {
    title: "",
    requestType: "Quote Request",
    source: "Call",
    serviceCategory: "Access Control",
    status: "Received",
    priority: "Normal",
    clientId: "",
    contactId: "",
    siteId: "",
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    siteName: "",
    siteAddress: "",
    city: "",
    state: "PR",
    assignedToId: defaultAssignedToId,
    receivedDate: today,
    dueDate: "",
    nextAction: "",
    nextFollowUpAt: "",
    missingInfo: "",
    siteVisitNeeded: false,
    siteVisitCompleted: false,
    description: "",
    internalNotes: ""
  };
}

function formFromRequest(request: RequestRecord): RequestFormState {
  return {
    title: request.title,
    requestType: request.requestType,
    source: request.source,
    serviceCategory: request.serviceCategory,
    status: request.status,
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

function getStatusClass(status: RequestStatus) {
  if (["No Bid", "Cancelled", "Duplicate"].includes(status)) {
    return "status-pill danger";
  }

  if (["Missing Info", "Site Visit Required"].includes(status)) {
    return "status-pill warning";
  }

  return "status-pill";
}

function getMissingInfoItems(request: RequestRecord) {
  const items = [];

  if (!request.companyName && !request.contactName) {
    items.push("client or contact");
  }

  if (!request.contactPhone && !request.contactEmail) {
    items.push("contact method");
  }

  if (!request.siteName && !request.siteAddress && !request.siteId) {
    items.push("site/location");
  }

  if (request.missingInfo) {
    items.push(request.missingInfo);
  }

  return Array.from(new Set(items));
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
    throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  }

  return data as T;
}

function getNextAction(request: RequestRecord) {
  if (request.nextAction) {
    return request.nextAction;
  }

  if (!request.assignedToId) {
    return "Assign an owner";
  }

  if (request.checklistSummary.missingRequired.length) {
    return `Collect ${request.checklistSummary.missingRequired.join(", ")}`;
  }

  if (request.siteVisitNeeded && !request.siteVisitCompleted) {
    return "Complete required site visit";
  }

  return request.checklistSummary.readyForQuote ? "Create quote workspace" : "Set next follow-up";
}

export function RequestRouteWorkspace({
  mode,
  requestId
}: {
  mode: RequestRouteMode;
  requestId?: string;
}) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canWriteCrm = canRole(user?.role, "crm:write");
  const canWriteActivity = canRole(user?.role, "crm:activity:write");
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [formState, setFormState] = useState<RequestFormState>(emptyForm(user?.id ?? ""));
  const [isLoading, setIsLoading] = useState(mode !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [recordActivities, setRecordActivities] = useState<ActivityRecord[]>([]);
  const [activeDetailTab, setActiveDetailTab] = useState<RequestDetailTab>("Notes");

  const isForm = mode === "new" || mode === "edit";

  const loadRecordActivity = useCallback(async (currentRequestId: string) => {
    try {
      const data = await requestJson<ActivityListResponse>(
        `/api/activity?relatedEntityType=Request&relatedEntityId=${currentRequestId}&take=25`,
        { cache: "no-store" }
      );
      setRecordActivities(data.activities);
    } catch {
      setRecordActivities([]);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [listData, clientData] = await Promise.all([
          requestJson<RequestListResponse>("/api/requests", { cache: "no-store" }),
          requestJson<ClientListResponse>("/api/clients", { cache: "no-store" })
        ]);
        setAssignees(listData.assignees);
        setClients(clientData.clients);

        if (requestId) {
          const data = await requestJson<RequestResponse>(`/api/requests/${requestId}`, {
            cache: "no-store"
          });
          setRequest(data.request);
          setFormState(formFromRequest(data.request));
          void loadRecordActivity(requestId);
        } else {
          setFormState(emptyForm(user?.id ?? ""));
          setRecordActivities([]);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load request.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [loadRecordActivity, requestId, user?.id]);

  const checklistBuckets = useMemo(() => {
    const sortedItems = sortChecklistItems(request?.checklistItems ?? []);
    const todo = sortedItems.filter((item) => item.applicable && !item.completed);
    const done = sortedItems.filter((item) => item.completed);
    const inactive = sortedItems.filter((item) => !item.applicable && !item.completed);

    return {
      todo,
      done,
      inactive,
      todoGroups: groupChecklistItems(todo),
      doneGroups: groupChecklistItems(done),
      inactiveGroups: groupChecklistItems(inactive)
    };
  }, [request?.checklistItems]);

  const selectedClient = clients.find((client) => client.id === formState.clientId);

  function selectClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    if (!client) {
      setFormState({ ...formState, clientId: "", contactId: "", siteId: "" });
      return;
    }
    // Persist canonical IDs and readable snapshots together for history and search.
    const contact = client.primaryContact.id ? client.primaryContact : client.contacts[0];
    const site = client.sites.find((item) => item.isPrimarySite) ?? client.sites[0];
    setFormState({
      ...formState,
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
    });
  }

  function selectContact(contactId: string) {
    const contact = selectedClient?.contacts.find((item) => item.id === contactId);
    setFormState({
      ...formState,
      contactId,
      contactName: contact?.name ?? formState.contactName,
      contactEmail: contact?.email ?? formState.contactEmail,
      contactPhone: contact?.phone ?? contact?.mobile ?? formState.contactPhone
    });
  }

  function selectSite(siteId: string) {
    const site = selectedClient?.sites.find((item) => item.id === siteId);
    setFormState({
      ...formState,
      siteId,
      siteName: site?.siteName ?? formState.siteName,
      siteAddress: site?.address ?? formState.siteAddress,
      city: site?.city ?? formState.city,
      state: site?.state ?? formState.state
    });
  }

  const missingRequiredLabels = useMemo(
    () => new Set(request?.checklistSummary.missingRequired ?? []),
    [request?.checklistSummary.missingRequired]
  );

  const intakeMissingItems = useMemo(() => (request ? getMissingInfoItems(request) : []), [request]);

  const checklistProgress = request?.checklistSummary.total
    ? Math.round((request.checklistSummary.completed / request.checklistSummary.total) * 100)
    : 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWriteCrm) {
      setMessage("Your role does not allow saving requests.");
      return;
    }

    if (!formState.title || (!formState.companyName && !formState.contactName)) {
      setMessage("Request title and company or contact are required.");
      return;
    }

    try {
      setIsSaving(true);
      const data = await requestJson<RequestResponse>(
        mode === "edit" && requestId ? `/api/requests/${requestId}` : "/api/requests",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          body: JSON.stringify(formState)
        }
      );
      router.push(`/requests/${data.request.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save this request.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleChecklistItem(item: RequestChecklistItem) {
    if (!request || !canWriteActivity) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/checklist/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !item.completed, notes: item.notes })
        }
      );
      setRequest(data.request);
      await loadRecordActivity(data.request.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update checklist.");
    }
  }

  async function updateStatus(status: RequestStatus) {
    if (!request || !canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setRequest(data.request);
      await loadRecordActivity(data.request.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update status.");
    }
  }

  async function convertRequest() {
    if (!request || !canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(`/workspace-api/requests/${request.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ createQuote: true })
      });
      setRequest(data.request);
      await loadRecordActivity(data.request.id);
      setMessage(
        data.request.relatedQuoteNumber
          ? `Converted to ${data.request.relatedQuoteNumber}.`
          : "Request marked converted."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to convert request.");
    }
  }

  async function addNote() {
    if (!request || !canWriteActivity || !noteText.trim()) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/activities`, {
        method: "POST",
        body: JSON.stringify({
          type: "Note",
          title: "Note added",
          body: noteText,
          actor: user?.name ?? "Pulse User"
        })
      });
      setRequest(data.request);
      setNoteText("");
      await loadRecordActivity(data.request.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add note.");
    }
  }

  async function addTask() {
    if (!request || !canWriteActivity || !taskTitle.trim()) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle,
          dueAt: request.nextFollowUpAt || request.dueDate || today,
          owner: request.assignedToName || "Unassigned"
        })
      });
      setRequest(data.request);
      setTaskTitle("");
      await loadRecordActivity(data.request.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add follow-up.");
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (!request || !canWriteActivity) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !completed })
        }
      );
      setRequest(data.request);
      await loadRecordActivity(data.request.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update follow-up.");
    }
  }

  function renderChecklistGroups(groups: Record<string, RequestChecklistItem[]>, emptyMessage: string) {
    const entries = Object.entries(groups);

    if (!entries.length) {
      return <p className="lead-notes request-empty-note">{emptyMessage}</p>;
    }

    return entries.map(([group, items]) => (
      <div className="request-checklist-group" key={group}>
        <h4>{group}</h4>
        {items.map((item) => {
          const missingRequired = item.required && !item.completed && missingRequiredLabels.has(item.label);

          return (
            <button
              key={item.id}
              className={checklistItemClass(item, missingRequired)}
              type="button"
              onClick={() => toggleChecklistItem(item)}
              disabled={!canWriteActivity || !item.applicable}
            >
              {item.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
              <span className="request-checklist-item-content">
                <strong>{item.label}</strong>
                {item.description ? <span className="request-checklist-description">{item.description}</span> : null}
                <small>{checklistItemMeta(item)}</small>
                <RequestChecklistSignature item={item} compact />
              </span>
            </button>
          );
        })}
      </div>
    ));
  }

  if (isLoading) {
    return <div className="lead-empty-state">Loading request...</div>;
  }

  if (isForm) {
    return (
      <section className="request-route-page">
        <div className="request-route-heading">
          <Link className="toolbar-button compact" href="/requests">
            <ArrowLeft size={16} />
            Queue
          </Link>
          <div>
            <span>Requests / Intake</span>
            <h1>{mode === "new" ? "New Request" : "Edit Request"}</h1>
          </div>
        </div>

        <form className="request-route-form" onSubmit={save}>
          <div className="lead-form-grid">
            <label>
              Request title
              <input value={formState.title} onChange={(event) => setFormState({ ...formState, title: event.target.value })} />
            </label>
            <label>
              Type
              <select value={formState.requestType} onChange={(event) => setFormState({ ...formState, requestType: event.target.value as RequestType })}>
                {requestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>
              Source
              <select value={formState.source} onChange={(event) => setFormState({ ...formState, source: event.target.value as RequestSource })}>
                {requestSources.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </label>
            <label>
              Category
              <select value={formState.serviceCategory} onChange={(event) => setFormState({ ...formState, serviceCategory: event.target.value as ServiceCategory })}>
                {serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value as RequestStatus })}>
                {requestStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={formState.priority} onChange={(event) => setFormState({ ...formState, priority: event.target.value as RequestPriority })}>
                {requestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </label>
            <label>
              Client account
              <select value={formState.clientId} onChange={(event) => selectClient(event.target.value)}>
                <option value="">Unlinked / new prospect</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.displayName}</option>)}
              </select>
            </label>
            <label>
              Company name
              <input value={formState.companyName} onChange={(event) => setFormState({ ...formState, companyName: event.target.value, clientId: "", contactId: "", siteId: "" })} />
            </label>
            <label>
              Contact record
              <select value={formState.contactId} onChange={(event) => selectContact(event.target.value)} disabled={!selectedClient}>
                <option value="">No linked contact</option>
                {(selectedClient?.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
              </select>
            </label>
            <label>
              Contact name
              <input value={formState.contactName} onChange={(event) => setFormState({ ...formState, contactName: event.target.value, contactId: "" })} />
            </label>
            <label>
              Email
              <input value={formState.contactEmail} onChange={(event) => setFormState({ ...formState, contactEmail: event.target.value })} />
            </label>
            <label>
              Phone
              <input value={formState.contactPhone} onChange={(event) => setFormState({ ...formState, contactPhone: event.target.value })} />
            </label>
            <label>
              Site record
              <select value={formState.siteId} onChange={(event) => selectSite(event.target.value)} disabled={!selectedClient}>
                <option value="">No linked site</option>
                {(selectedClient?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName}</option>)}
              </select>
            </label>
            <label>
              Site name
              <input value={formState.siteName} onChange={(event) => setFormState({ ...formState, siteName: event.target.value, siteId: "" })} />
            </label>
            <label>
              Address
              <input value={formState.siteAddress} onChange={(event) => setFormState({ ...formState, siteAddress: event.target.value })} />
            </label>
            <label>
              City
              <input value={formState.city} onChange={(event) => setFormState({ ...formState, city: event.target.value })} />
            </label>
            <label>
              State
              <input value={formState.state} onChange={(event) => setFormState({ ...formState, state: event.target.value })} />
            </label>
            <label>
              Owner
              <select value={formState.assignedToId} onChange={(event) => setFormState({ ...formState, assignedToId: event.target.value })}>
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                ))}
              </select>
            </label>
            <label>
              Received
              <input type="date" value={formState.receivedDate} onChange={(event) => setFormState({ ...formState, receivedDate: event.target.value })} />
            </label>
            <label>
              Due
              <input type="date" value={formState.dueDate} onChange={(event) => setFormState({ ...formState, dueDate: event.target.value })} />
            </label>
            <label>
              Follow-up
              <input type="date" value={formState.nextFollowUpAt} onChange={(event) => setFormState({ ...formState, nextFollowUpAt: event.target.value })} />
            </label>
            <label className="full-span">
              Next action
              <input value={formState.nextAction} onChange={(event) => setFormState({ ...formState, nextAction: event.target.value })} />
            </label>
            <label className="full-span">
              Missing information
              <input value={formState.missingInfo} onChange={(event) => setFormState({ ...formState, missingInfo: event.target.value })} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={formState.siteVisitNeeded} onChange={(event) => setFormState({ ...formState, siteVisitNeeded: event.target.checked })} />
              Site visit required
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={formState.siteVisitCompleted} onChange={(event) => setFormState({ ...formState, siteVisitCompleted: event.target.checked })} />
              Site visit completed
            </label>
            <label className="full-span">
              Description
              <textarea value={formState.description} onChange={(event) => setFormState({ ...formState, description: event.target.value })} />
            </label>
            <label className="full-span">
              Internal notes
              <textarea value={formState.internalNotes} onChange={(event) => setFormState({ ...formState, internalNotes: event.target.value })} />
            </label>
          </div>

          {message ? <div className="form-alert error">{message}</div> : null}
          <div className="request-preview-actions">
            <button className="primary-button" type="submit" disabled={isSaving || !canWriteCrm}>
              <Save size={17} />
              {isSaving ? "Saving..." : "Save Request"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  if (!request) {
    return (
      <div className="lead-empty-state">
        <strong>Request not found.</strong>
        <Link className="toolbar-button compact" href="/requests">Back to queue</Link>
      </div>
    );
  }

  const siteSummary =
    [request.siteName, request.siteAddress, request.city, request.state].filter(Boolean).join(", ") ||
    "Not captured";
  const quoteActionDisabled =
    Boolean(request.relatedQuoteId) || !canWriteCrm || !request.checklistSummary.readyForQuote;

  return (
    <section className="request-route-page request-route-page-cockpit">
      <div className="request-route-heading">
        <Link className="toolbar-button compact" href="/requests">
          <ArrowLeft size={16} />
          Queue
        </Link>
        <div>
          <span>{request.requestNumber}</span>
          <h1>{request.title}</h1>
          <div className="request-preview-badges">
            <span className={getStatusClass(request.status)}>{request.status}</span>
            <span className="request-inline-flags">{request.serviceCategory}</span>
            <span className="lead-priority">{request.priority}</span>
          </div>
        </div>
        <div className="request-route-heading-actions">
          <Link className="toolbar-button compact" href={`/requests/${request.id}/edit`}>
            <Edit3 size={16} />
            Edit
          </Link>
          <button className="primary-button compact" type="button" onClick={convertRequest} disabled={!canWriteCrm || !request.checklistSummary.readyForQuote || Boolean(request.relatedQuoteId)}>
            <UserCheck size={17} />
            Send to Quote
          </button>
        </div>
      </div>

      <div className="request-command-strip" aria-label="Request summary">
        <div><span>Client</span><strong>{request.companyName || "Not captured"}</strong></div>
        <div><span>Contact</span><strong>{request.contactName || "Not captured"}</strong></div>
        <div><span>Email</span><strong><Mail size={14} /> {request.contactEmail || "Not captured"}</strong></div>
        <div><span>Phone</span><strong><Phone size={14} /> {request.contactPhone || "Not captured"}</strong></div>
        <div><span>Site</span><strong><MapPin size={14} /> {siteSummary}</strong></div>
        <div><span>Owner</span><strong>{request.assignedToName || "Unassigned"}</strong></div>
        <div><span>Source</span><strong>{request.source}</strong></div>
        <div><span>Type</span><strong>{request.requestType}</strong></div>
        <div><span>Received</span><strong><CalendarClock size={14} /> {request.receivedDate || "Not captured"}</strong></div>
        <div><span>Due</span><strong>{request.dueDate || "Not set"}</strong></div>
        <div><span>Follow-up</span><strong>{request.nextFollowUpAt || "Not set"}</strong></div>
      </div>

      <div className="request-cockpit-grid">
        <section className="request-checklist-workspace" aria-labelledby="request-checklist-heading">
          <div className="request-checklist-workspace-heading">
            <div>
              <span>Checklist</span>
              <h2 id="request-checklist-heading">{request.checklistSummary.templateName}</h2>
            </div>
            <strong>{checklistBuckets.todo.length} open</strong>
          </div>

          <div className="request-checklist-board">
            <section className="request-checklist-column">
              <div className="request-checklist-column-heading">
                <h3>To do</h3>
                <span>{checklistBuckets.todo.length}</span>
              </div>
              <div className="request-checklist">
                {renderChecklistGroups(checklistBuckets.todoGroups, "No open checklist items.")}
              </div>
            </section>

            <section className="request-checklist-column done">
              <div className="request-checklist-column-heading">
                <h3>Done</h3>
                <span>{checklistBuckets.done.length}</span>
              </div>
              <div className="request-checklist">
                {renderChecklistGroups(checklistBuckets.doneGroups, "Nothing has been completed yet.")}
              </div>
            </section>
          </div>

          {checklistBuckets.inactive.length ? (
            <section className="request-checklist-inactive">
              <div className="request-checklist-column-heading">
                <h3>Not applicable</h3>
                <span>{checklistBuckets.inactive.length}</span>
              </div>
              <div className="request-checklist inactive">
                {renderChecklistGroups(checklistBuckets.inactiveGroups, "No inactive checklist items.")}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="request-side-rail" aria-label="Request cockpit">
          <section className="request-side-card">
            <span>Next Action</span>
            <strong>{getNextAction(request)}</strong>
            <small>Due: {request.dueDate || "Not set"} - Follow-up: {request.nextFollowUpAt || "Not set"}</small>
          </section>

          <section className={request.checklistSummary.readyForQuote ? "request-side-card readiness ready" : "request-side-card readiness"}>
            <span>Readiness</span>
            <strong>{request.checklistSummary.readyForQuote ? "Ready for Quote" : `${request.checklistSummary.missingRequired.length} required missing`}</strong>
            <div className="request-progress-track" aria-label={`${checklistProgress}% checklist complete`}>
              <span style={{ width: `${checklistProgress}%` }} />
            </div>
            <small>
              {request.checklistSummary.completed}/{request.checklistSummary.total} complete - {request.checklistSummary.requiredCompleted}/{request.checklistSummary.requiredTotal} required
            </small>
          </section>

          <section className="request-side-card">
            <span>Missing Required</span>
            {request.checklistSummary.missingRequired.length ? (
              <div className="request-tag-list compact">
                {request.checklistSummary.missingRequired.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : (
              <p className="lead-notes">All required checklist items are complete.</p>
            )}
          </section>

          <section className="request-side-card">
            <span>Follow-Ups</span>
            <div className="task-composer">
              <input
                placeholder="Add follow-up task..."
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                disabled={!canWriteActivity}
              />
              <button type="button" onClick={addTask} disabled={!canWriteActivity || !taskTitle.trim()}>Add</button>
            </div>
            <div className="task-list compact">
              {request.tasks.length ? (
                request.tasks.map((task) => (
                  <button key={task.id} className="task-row" type="button" onClick={() => toggleTask(task.id, task.completed)} disabled={!canWriteActivity}>
                    {task.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.owner} - {task.dueAt || "No due date"}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="lead-notes">No follow-ups are assigned yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="request-secondary-panel">
        <div className="lead-view-tabs request-detail-tabs" role="tablist" aria-label="Request detail sections">
          {requestDetailTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeDetailTab === tab}
              className={activeDetailTab === tab ? "lead-view-tab active" : "lead-view-tab"}
              onClick={() => setActiveDetailTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="request-detail-tab-panel">
          {activeDetailTab === "Notes" ? (
            <div className="request-tab-grid">
              <section className="lead-section">
                <h3>Intake Details</h3>
                <p className="lead-notes">{request.description || "No request description yet."}</p>
              </section>
              <section className="lead-section">
                <h3>Missing Information</h3>
                {intakeMissingItems.length ? (
                  <div className="request-tag-list">
                    {intakeMissingItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="lead-notes">No missing intake information is flagged.</p>
                )}
              </section>
              <section className="lead-section">
                <h3>Internal Notes</h3>
                <p className="lead-notes">{request.internalNotes || "No internal notes yet."}</p>
                <textarea
                  placeholder="Add a note to the timeline..."
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  disabled={!canWriteActivity}
                />
                <button className="toolbar-button compact" type="button" onClick={addNote} disabled={!canWriteActivity || !noteText.trim()}>
                  <StickyNote size={16} />
                  Add Note
                </button>
              </section>
            </div>
          ) : null}

          {activeDetailTab === "Workflow" ? (
            <section className="lead-section">
              <h3>Workflow Status</h3>
              <div className="status-action-grid">
                {requestStatuses.map((status) => (
                  <button
                    key={status}
                    className={status === request.status ? "active" : ""}
                    type="button"
                    onClick={() => updateStatus(status)}
                    disabled={!canWriteCrm}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {activeDetailTab === "Files" ? (
            <section className="lead-section">
              <h3>Files / Drawings</h3>
              <LifecycleDocuments
                stage="request"
                recordId={request.id}
                documents={request.documents}
                canWrite={canWriteCrm}
                onChange={(documents) => setRequest({ ...request, documents })}
              />
            </section>
          ) : null}

          {activeDetailTab === "Quote" ? (
            <section className="lead-section">
              <h3>Related Quote</h3>
              <div className="request-next-action-card">
                <strong>{request.relatedQuoteNumber || "No quote workspace linked yet"}</strong>
                <button className="toolbar-button compact" type="button" disabled={quoteActionDisabled} onClick={convertRequest}>
                  Create Quote Workspace
                </button>
              </div>
            </section>
          ) : null}

          {activeDetailTab === "Activity" ? (
            <section className="lead-section">
              <h3>Activity Timeline</h3>
              <ActivityTimeline activities={recordActivities} emptyMessage="No shared activity has been recorded for this request yet." />
            </section>
          ) : null}
        </div>
      </section>

      {message ? <div className="lead-toast">{message}</div> : null}
    </section>
  );
}
