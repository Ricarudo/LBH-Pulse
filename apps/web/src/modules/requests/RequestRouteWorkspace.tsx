"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Save,
  UserCheck
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
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

const today = new Date().toISOString().slice(0, 10);

function emptyForm(defaultAssignedToId = ""): RequestFormState {
  return {
    title: "",
    requestType: "Quote Request",
    source: "Call",
    serviceCategory: "Access Control",
    status: "Received",
    priority: "Normal",
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
  const [formState, setFormState] = useState<RequestFormState>(emptyForm(user?.id ?? ""));
  const [isLoading, setIsLoading] = useState(mode !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isForm = mode === "new" || mode === "edit";

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const listData = await requestJson<RequestListResponse>("/api/requests", {
          cache: "no-store"
        });
        setAssignees(listData.assignees);

        if (requestId) {
          const data = await requestJson<RequestResponse>(`/api/requests/${requestId}`, {
            cache: "no-store"
          });
          setRequest(data.request);
          setFormState(formFromRequest(data.request));
        } else {
          setFormState(emptyForm(user?.id ?? ""));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load request.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [requestId, user?.id]);

  const checklistGroups = useMemo(() => {
    return (request?.checklistItems ?? []).reduce<Record<string, RequestChecklistItem[]>>(
      (groups, item) => {
        const key = item.group || "Intake";
        groups[key] = [...(groups[key] ?? []), item];
        return groups;
      },
      {}
    );
  }, [request?.checklistItems]);

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update status.");
    }
  }

  async function convertRequest() {
    if (!request || !canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ createQuote: true })
      });
      setRequest(data.request);
      setMessage(
        data.request.relatedQuoteNumber
          ? `Converted to ${data.request.relatedQuoteNumber}.`
          : "Request marked converted."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to convert request.");
    }
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
              Client
              <input value={formState.companyName} onChange={(event) => setFormState({ ...formState, companyName: event.target.value })} />
            </label>
            <label>
              Contact
              <input value={formState.contactName} onChange={(event) => setFormState({ ...formState, contactName: event.target.value })} />
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
              Site
              <input value={formState.siteName} onChange={(event) => setFormState({ ...formState, siteName: event.target.value })} />
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

  return (
    <section className="request-route-page">
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

      <div className="request-route-grid">
        <section className="lead-detail-panel always-visible">
          <div className="lead-detail-grid">
            <div><span>Client</span><strong>{request.companyName || "Not captured"}</strong></div>
            <div><span>Contact</span><strong>{request.contactName || "Not captured"}</strong></div>
            <div><span>Site</span><strong>{[request.siteName, request.siteAddress, request.city].filter(Boolean).join(", ") || "Not captured"}</strong></div>
            <div><span>Owner</span><strong>{request.assignedToName || "Unassigned"}</strong></div>
            <div><span>Source</span><strong>{request.source}</strong></div>
            <div><span>Type</span><strong>{request.requestType}</strong></div>
          </div>

          <section className="lead-section">
            <h3>Next Action</h3>
            <div className="request-next-action-card">
              <strong>{getNextAction(request)}</strong>
              <span>Due: {request.dueDate || "Not set"} - Follow-up: {request.nextFollowUpAt || "Not set"}</span>
            </div>
          </section>

          <section className="lead-section">
            <h3>Intake Details</h3>
            <p className="lead-notes">{request.description || "No request description yet."}</p>
          </section>
        </section>

        <section className="lead-detail-panel always-visible">
          <section className="lead-section">
            <h3>Checklist</h3>
            <div className={request.checklistSummary.readyForQuote ? "request-readiness-card ready" : "request-readiness-card"}>
              <strong>{request.checklistSummary.readyForQuote ? "Ready for Quote" : `${request.checklistSummary.missingRequired.length} required item(s) missing`}</strong>
              <span>{request.checklistSummary.completed}/{request.checklistSummary.total} complete from {request.checklistSummary.templateName}</span>
            </div>
            <div className="request-checklist">
              {Object.entries(checklistGroups).map(([group, items]) => (
                <div className="request-checklist-group" key={group}>
                  <h4>{group}</h4>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={item.completed ? "request-checklist-item complete" : item.applicable ? "request-checklist-item" : "request-checklist-item muted"}
                      type="button"
                      onClick={() => toggleChecklistItem(item)}
                      disabled={!canWriteActivity || !item.applicable}
                    >
                      {item.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.required ? "Required" : "Optional"}</small>
                        <RequestChecklistSignature item={item} />
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="lead-section">
            <h3>Workflow Status</h3>
            <div className="status-action-grid">
              {requestStatuses.map((status) => (
                <button key={status} type="button" onClick={() => updateStatus(status)} disabled={!canWriteCrm}>
                  {status}
                </button>
              ))}
            </div>
          </section>
        </section>
      </div>

      {message ? <div className="lead-toast">{message}</div> : null}
    </section>
  );
}
