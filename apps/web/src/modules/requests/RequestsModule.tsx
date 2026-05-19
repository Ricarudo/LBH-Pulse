"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit3,
  Eye,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  StickyNote,
  UserCheck,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { ActivityRecord } from "@/types/activity";
import { RequestsMobileView } from "./RequestsMobileView";
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

type RequestView =
  | "All Open"
  | "My Requests"
  | "Unassigned"
  | "Missing Info"
  | "Site Visits"
  | "Ready for Quote"
  | "Converted / Closed";

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

type ActivityListResponse = {
  activities: ActivityRecord[];
};

const requestViews: RequestView[] = [
  "All Open",
  "My Requests",
  "Unassigned",
  "Missing Info",
  "Site Visits",
  "Ready for Quote",
  "Converted / Closed"
];

const today = new Date().toISOString().slice(0, 10);

function createFormState(
  request?: RequestRecord,
  defaultAssignedToId = ""
): RequestFormState {
  return {
    title: request?.title ?? "",
    requestType: request?.requestType ?? "Quote Request",
    source: request?.source ?? "Call",
    serviceCategory: request?.serviceCategory ?? "Access Control",
    status: request?.status ?? "Received",
    priority: request?.priority ?? "Normal",
    companyName: request?.companyName ?? "",
    contactName: request?.contactName ?? "",
    contactEmail: request?.contactEmail ?? "",
    contactPhone: request?.contactPhone ?? "",
    siteName: request?.siteName ?? "",
    siteAddress: request?.siteAddress ?? "",
    city: request?.city ?? "",
    state: request?.state ?? "PR",
    assignedToId: request?.assignedToId ?? defaultAssignedToId,
    receivedDate: request?.receivedDate ?? today,
    dueDate: request?.dueDate ?? "",
    nextAction: request?.nextAction ?? "",
    nextFollowUpAt: request?.nextFollowUpAt ?? "",
    missingInfo: request?.missingInfo ?? "",
    siteVisitNeeded: request?.siteVisitNeeded ?? false,
    siteVisitCompleted: request?.siteVisitCompleted ?? false,
    description: request?.description ?? "",
    internalNotes: request?.internalNotes ?? ""
  };
}

function getStatusClass(status: RequestStatus) {
  if (["No Bid", "Cancelled", "Duplicate"].includes(status)) {
    return "status-pill danger";
  }

  if (
    [
      "Missing Info",
      "Site Visit Required"
    ].includes(status)
  ) {
    return "status-pill warning";
  }

  return "status-pill";
}

function getPriorityClass(priority: RequestPriority) {
  if (priority === "Urgent") {
    return "lead-priority urgent";
  }

  if (priority === "High") {
    return "lead-priority high";
  }

  return "lead-priority";
}

function isOpenRequest(request: RequestRecord) {
  return !["Converted to Quote", "No Bid", "Cancelled", "Duplicate"].includes(
    request.status
  );
}

function needsFollowUp(request: RequestRecord) {
  return (
    isOpenRequest(request) &&
    Boolean(request.nextFollowUpAt) &&
    request.nextFollowUpAt <= today
  );
}

function isReadyForQuote(request: RequestRecord) {
  return request.checklistSummary.readyForQuote || request.status === "Ready for Quote";
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

function getNextAction(request: RequestRecord) {
  if (request.nextAction) {
    return request.nextAction;
  }

  if (!request.assignedToId) {
    return "Assign an owner";
  }

  const missingInfo = request.checklistSummary.missingRequired.length
    ? request.checklistSummary.missingRequired
    : getMissingInfoItems(request);
  if (missingInfo.length > 0) {
    return `Collect ${missingInfo.join(", ")}`;
  }

  if (request.siteVisitNeeded && !request.siteVisitCompleted) {
    return "Complete required site visit";
  }

  if (isReadyForQuote(request)) {
    return "Create quote workspace";
  }

  return request.nextFollowUpAt ? "Follow up with client" : "Set next follow-up";
}

function isAssignedRequest(
  request: RequestRecord,
  assigneeId?: string,
  assigneeName?: string
) {
  if (!assigneeId && !assigneeName) {
    return false;
  }

  return request.assignedToId === assigneeId || request.assignedToName === assigneeName;
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
    throw new Error(
      typeof data.error === "string" ? data.error : "Request failed."
    );
  }

  return data as T;
}

function assigneeLabel(assignee: RequestAssignee) {
  return `${assignee.name} (${assignee.roleLabel})`;
}

export function RequestsModule() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [activeView, setActiveView] = useState<RequestView>("All Open");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | RequestStatus>("All");
  const [sourceFilter, setSourceFilter] = useState<"All" | RequestSource>("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] =
    useState<"All" | RequestPriority>("All");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<RequestFormState>(createFormState());
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [conversionOpen, setConversionOpen] = useState(false);
  const [createQuoteOnConvert, setCreateQuoteOnConvert] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("Loading requests from Pulse database...");
  const [recordActivities, setRecordActivities] = useState<ActivityRecord[]>([]);

  const selectedRequest =
    requests.find((request) => request.id === selectedRequestId) ?? null;
  const canWriteCrm = canRole(user?.role, "crm:write");
  const canWriteActivity = canRole(user?.role, "crm:activity:write");

  function openRequestDetail(requestId: string) {
    router.push(`/requests/${requestId}`);
  }

  function previewRequest(requestId: string) {
    setSelectedRequestId(requestId);
  }

  function handleRequestRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, requestId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openRequestDetail(requestId);
  }

  const loadRecordActivity = useCallback(async (requestId: string) => {
    try {
      const data = await requestJson<ActivityListResponse>(
        `/api/activity?relatedEntityType=Request&relatedEntityId=${requestId}&take=25`,
        { cache: "no-store" }
      );
      setRecordActivities(data.activities);
    } catch {
      setRecordActivities([]);
    }
  }, []);

  useEffect(() => {
    async function loadRequests() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await requestJson<RequestListResponse>("/api/requests", {
          cache: "no-store"
        });
        setRequests(data.requests);
        setAssignees(data.assignees);
        setToast("Requests are connected to the Pulse Request domain.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load requests from the API.";
        setLoadError(message);
        setToast(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadRequests();
  }, []);

  useEffect(() => {
    if (
      selectedRequestId &&
      !requests.some((request) => request.id === selectedRequestId)
    ) {
      setSelectedRequestId("");
    }
  }, [requests, selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest?.id) {
      setRecordActivities([]);
      return;
    }

    void loadRecordActivity(selectedRequest.id);
  }, [loadRecordActivity, selectedRequest?.id]);

  const metrics = useMemo(() => {
    const open = requests.filter(isOpenRequest);

    return {
      open: open.length,
      needsFollowUp: requests.filter(needsFollowUp).length,
      missingRequired: open.filter(
        (request) => request.checklistSummary.missingRequired.length > 0
      ).length,
      siteVisits: open.filter(
        (request) => request.siteVisitNeeded && !request.siteVisitCompleted
      ).length,
      readyForQuote: requests.filter(isReadyForQuote).length,
      unassigned: open.filter((request) => !request.assignedToId).length
    };
  }, [requests]);

  const desktopSummaryCards = useMemo(
    () => [
      {
        label: "New",
        value: requests.filter((request) => request.status === "Received").length,
        hint: "Received"
      },
      {
        label: "Needs Info",
        value: requests.filter(
          (request) =>
            request.status === "Missing Info" ||
            request.checklistSummary.missingRequired.length > 0
        ).length,
        hint: "Missing intake"
      },
      {
        label: "Ready for Quote",
        value: metrics.readyForQuote,
        hint: "Qualified"
      },
      {
        label: "Overdue",
        value: metrics.needsFollowUp,
        hint: "Follow-ups"
      }
    ],
    [metrics.needsFollowUp, metrics.readyForQuote, requests]
  );

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const searchHaystack = [
        request.requestNumber,
        request.title,
        request.companyName,
        request.contactName,
        request.contactEmail,
        request.contactPhone,
        request.siteName,
        request.siteAddress,
        request.city,
        request.state,
        request.description,
        request.internalNotes,
        request.missingInfo,
        request.serviceCategory
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchHaystack.includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "All" || request.status === statusFilter;
      const matchesSource = sourceFilter === "All" || request.source === sourceFilter;
      const matchesOwner =
        assigneeFilter === "All" ||
        (assigneeFilter === "Unassigned"
          ? !request.assignedToId
          : request.assignedToId === assigneeFilter);
      const matchesPriority =
        priorityFilter === "All" || request.priority === priorityFilter;

      let matchesView = true;
      if (activeView === "All Open") {
        matchesView = isOpenRequest(request);
      } else if (activeView === "My Requests") {
        matchesView = isAssignedRequest(request, user?.id, user?.name);
      } else if (activeView === "Unassigned") {
        matchesView = !request.assignedToId;
      } else if (activeView === "Missing Info") {
        matchesView =
          request.status === "Missing Info" ||
          request.checklistSummary.missingRequired.length > 0;
      } else if (activeView === "Site Visits") {
        matchesView = request.siteVisitNeeded && !request.siteVisitCompleted;
      } else if (activeView === "Ready for Quote") {
        matchesView = isReadyForQuote(request);
      } else if (activeView === "Converted / Closed") {
        matchesView = ["No Bid", "Cancelled", "Duplicate", "Converted to Quote"].includes(
          request.status
        );
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSource &&
        matchesOwner &&
        matchesPriority &&
        matchesView
      );
    });
  }, [
    activeView,
    assigneeFilter,
    priorityFilter,
    requests,
    searchTerm,
    sourceFilter,
    statusFilter,
    user?.id,
    user?.name
  ]);

  function replaceRequest(updatedRequest: RequestRecord) {
    setRequests((current) =>
      current.map((request) =>
        request.id === updatedRequest.id ? updatedRequest : request
      )
    );
    setSelectedRequestId(updatedRequest.id);
  }

  function openCreateForm() {
    if (!canWriteCrm) {
      setToast("Your role does not allow creating requests.");
      return;
    }

    setFormMode("create");
    setFormState(createFormState(undefined, user?.id ?? ""));
  }

  function openEditForm(request: RequestRecord) {
    if (!canWriteCrm) {
      setToast("Your role does not allow editing requests.");
      return;
    }

    setFormMode("edit");
    setFormState(createFormState(request));
  }

  async function refreshSelectedRequestActivity() {
    if (selectedRequest?.id) {
      await loadRecordActivity(selectedRequest.id);
    }
  }

  async function saveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.title || (!formState.companyName && !formState.contactName)) {
      setToast("Request title and company or contact are required.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = { ...formState };

      if (formMode === "edit" && selectedRequest) {
        const data = await requestJson<RequestResponse>(
          `/api/requests/${selectedRequest.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload)
          }
        );
        replaceRequest(data.request);
        await loadRecordActivity(data.request.id);
        setToast(`${data.request.requestNumber} updated.`);
      } else {
        const data = await requestJson<RequestResponse>("/api/requests", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setRequests((current) => [data.request, ...current]);
        setSelectedRequestId(data.request.id);
        setActiveView("All Open");
        setToast(`${data.request.requestNumber} created.`);
      }

      setFormMode(null);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to save this request."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateRequestStatus(status: RequestStatus) {
    if (!canWriteCrm || !selectedRequest) {
      return;
    }

    await updateRequestStatusFor(selectedRequest, status);
  }

  async function updateRequestStatusFor(request: RequestRecord, status: RequestStatus) {
    if (!canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        }
      );
      replaceRequest(data.request);
      if (selectedRequest?.id === data.request.id || request.id === selectedRequestId) {
        await loadRecordActivity(data.request.id);
      }
      setToast(`${data.request.requestNumber} moved to ${status}.`);
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to update status."
      );
    }
  }

  async function updateRequestAssignment(assignedToId: string) {
    if (!canWriteCrm || !selectedRequest) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${selectedRequest.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ assignedToId })
        }
      );
      replaceRequest(data.request);
      await refreshSelectedRequestActivity();
      setToast(
        assignedToId
          ? `${data.request.requestNumber} assigned to ${data.request.assignedToName}.`
          : `${data.request.requestNumber} is now unassigned.`
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Unable to update request assignment."
      );
    }
  }

  async function addNote() {
    if (!canWriteActivity || !selectedRequest) {
      return;
    }

    if (!noteText.trim()) {
      setToast("Write a note before adding it to the timeline.");
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${selectedRequest.id}/activities`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "Note",
            title: "Note added",
            body: noteText.trim(),
            actor: user?.name ?? "Pulse System"
          })
        }
      );
      replaceRequest(data.request);
      await refreshSelectedRequestActivity();
      setNoteText("");
      setToast("Note added to request timeline.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add note.");
    }
  }

  async function addTask() {
    if (!canWriteActivity || !selectedRequest) {
      return;
    }

    if (!taskTitle.trim()) {
      setToast("Add a task title first.");
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${selectedRequest.id}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: taskTitle.trim(),
            dueAt: selectedRequest.nextFollowUpAt || selectedRequest.dueDate || today,
            owner: selectedRequest.assignedToName || "Unassigned"
          })
        }
      );
      replaceRequest(data.request);
      await refreshSelectedRequestActivity();
      setTaskTitle("");
      setToast("Follow-up task added.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to add task.");
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (!canWriteActivity || !selectedRequest) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${selectedRequest.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !completed })
        }
      );
      replaceRequest(data.request);
      await refreshSelectedRequestActivity();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update task.");
    }
  }

  async function toggleChecklistItem(item: RequestChecklistItem) {
    if (!canWriteActivity || !selectedRequest) {
      return;
    }

    await toggleChecklistItemFor(selectedRequest, item);
  }

  async function toggleChecklistItemFor(
    request: RequestRecord,
    item: RequestChecklistItem
  ) {
    if (!canWriteActivity) {
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
      replaceRequest(data.request);
      if (selectedRequest?.id === data.request.id || request.id === selectedRequestId) {
        await loadRecordActivity(data.request.id);
      }
      setToast(
        !item.completed
          ? `Completed ${item.label}.`
          : `Reopened ${item.label}.`
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Unable to update checklist item."
      );
    }
  }

  async function convertRequest() {
    if (!canWriteCrm || !selectedRequest) {
      return;
    }

    await convertRequestFor(selectedRequest);
  }

  async function convertRequestFor(request: RequestRecord) {
    if (!canWriteCrm) {
      return;
    }

    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/convert`,
        {
          method: "POST",
          body: JSON.stringify({
            createQuote: createQuoteOnConvert
          })
        }
      );
      replaceRequest(data.request);
      if (selectedRequest?.id === data.request.id || request.id === selectedRequestId) {
        await loadRecordActivity(data.request.id);
      }
      setConversionOpen(false);
      setToast(
        data.request.relatedQuoteNumber
          ? `${data.request.requestNumber} converted to ${data.request.relatedQuoteNumber}.`
          : `${data.request.requestNumber} marked converted.`
      );
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Unable to convert this request."
      );
    }
  }

  return (
    <div className="leads-module">
      <RequestsMobileView
        requests={requests}
        filteredRequests={filteredRequests}
        selectedRequest={selectedRequest}
        selectedRequestId={selectedRequestId}
        assignees={assignees}
        isLoading={isLoading}
        loadError={loadError}
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        sourceFilter={sourceFilter}
        assigneeFilter={assigneeFilter}
        priorityFilter={priorityFilter}
        capabilities={{
          canCreate: canWriteCrm,
          canUpdateStatus: canWriteCrm,
          canUpdateChecklist: canWriteActivity,
          canConvert: canWriteCrm
        }}
        getNextAction={getNextAction}
        onSearchChange={setSearchTerm}
        onStatusFilterChange={setStatusFilter}
        onSourceFilterChange={setSourceFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        onPriorityFilterChange={setPriorityFilter}
        onCreateRequest={openCreateForm}
      />

      <section className="requests-desktop-summary" aria-label="Request intake summary">
        <div className="requests-context-label">
          <span>Requests / Intake Queue</span>
          <Link className="primary-button compact" href="/requests/new">
            <Plus size={17} />
            New Request
          </Link>
        </div>
        <div className="requests-summary-grid">
          {desktopSummaryCards.map((card) => (
            <button
              key={card.label}
              className="requests-summary-card"
              type="button"
              onClick={() => {
                if (card.label === "New") {
                  setStatusFilter("Received");
                } else if (card.label === "Needs Info") {
                  setActiveView("Missing Info");
                } else if (card.label === "Ready for Quote") {
                  setActiveView("Ready for Quote");
                } else {
                  setActiveView("All Open");
                }
              }}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <em>{card.hint}</em>
            </button>
          ))}
        </div>
      </section>

      <div className="lead-view-tabs" role="tablist" aria-label="Request views">
        {requestViews.map((view) => (
          <button
            key={view}
            type="button"
            className={activeView === view ? "lead-view-tab active" : "lead-view-tab"}
            onClick={() => setActiveView(view)}
          >
            {view}
          </button>
        ))}
      </div>

      <section
        className={selectedRequest ? "lead-workspace detail-open" : "lead-workspace"}
      >
        <div className="lead-list-panel">
          <div className="lead-list-toolbar">
            <label className="lead-search">
              <Search size={17} />
              <input
                placeholder="Search requests, companies, contacts, service categories..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <div className="lead-filter-row">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | RequestStatus)}>
                <option value="All">All statuses</option>
                {requestStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "All" | RequestSource)}>
                <option value="All">All sources</option>
                {requestSources.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                <option value="All">All owners</option>
                <option value="Unassigned">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assigneeLabel(assignee)}</option>
                ))}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "All" | RequestPriority)}>
                <option value="All">All priorities</option>
                {requestPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </div>
          </div>

          {loadError ? <div className="lead-empty-state">{loadError}</div> : null}

          <div className="lead-list-meta">
            <span>Showing {filteredRequests.length} of {requests.length} requests</span>
          </div>

          <table className="lead-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Client / Site</th>
                <th>Category</th>
                <th>Status / Priority</th>
                <th>Checklist</th>
                <th>Owner</th>
                <th>Next Action</th>
                <th>Due / Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => {
                const checklistLabel = `${request.checklistSummary.completed}/${request.checklistSummary.total}`;

                return (
                  <tr
                    key={request.id}
                    className={request.id === selectedRequest?.id ? "selected" : ""}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${request.requestNumber}`}
                    onClick={() => openRequestDetail(request.id)}
                    onKeyDown={(event) => handleRequestRowKeyDown(event, request.id)}
                  >
                    <td data-label="Request">
                      <strong>{request.title}</strong>
                      <span>{request.requestNumber}</span>
                    </td>
                    <td data-label="Client / Site">
                      <strong>{request.companyName || "Unknown / new prospect"}</strong>
                      <span>{request.siteName || request.siteAddress || request.contactName || "Site not captured"}</span>
                    </td>
                    <td data-label="Category">
                      {request.serviceCategory}
                      <span>{request.requestType}</span>
                    </td>
                    <td data-label="Status / Priority">
                      <span className={getStatusClass(request.status)}>{request.status}</span>
                      <span className={getPriorityClass(request.priority)}>{request.priority}</span>
                    </td>
                    <td data-label="Checklist">
                      <strong>{checklistLabel}</strong>
                      <span>{request.checklistSummary.requiredCompleted}/{request.checklistSummary.requiredTotal} required</span>
                    </td>
                    <td data-label="Owner">{request.assignedToName || "Unassigned"}</td>
                    <td data-label="Next Action"><strong>{getNextAction(request)}</strong></td>
                    <td data-label="Due / Follow-up">
                      <strong>{request.dueDate || "No due date"}</strong>
                      <span>{request.nextFollowUpAt ? `Follow-up ${request.nextFollowUpAt}` : "No follow-up"}</span>
                    </td>
                    <td data-label="Actions">
                      <button
                        className="toolbar-button compact"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          previewRequest(request.id);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        aria-label={`Preview ${request.requestNumber}`}
                      >
                        <Eye size={16} />
                        Preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!isLoading && filteredRequests.length === 0 ? (
            <div className="lead-empty-state">
              <strong>No requests match this view.</strong>
              <span>Adjust the filters or create a new request.</span>
            </div>
          ) : null}
        </div>

        <aside
          className="lead-detail-panel"
          aria-label="Request details"
          style={selectedRequest ? undefined : { display: "none" }}
        >
          {selectedRequest ? (
            <>
              <div className="lead-detail-header">
                <div>
                  <p>{selectedRequest.requestNumber}</p>
                  <h2>{selectedRequest.title}</h2>
                  <span className={getStatusClass(selectedRequest.status)}>{selectedRequest.status}</span>
                </div>
                <div className="lead-detail-actions">
                  <Link className="toolbar-button compact" href={`/requests/${selectedRequest.id}`}>
                    <ArrowRight size={16} />
                    Open Full Request
                  </Link>
                  <button className="toolbar-button compact" type="button" onClick={() => openEditForm(selectedRequest)} disabled={!canWriteCrm}>
                    <Edit3 size={16} />
                    Edit
                  </button>
                  <button className="toolbar-button compact" type="button" onClick={() => setConversionOpen(true)} disabled={!canWriteCrm || selectedRequest.status === "Converted to Quote"}>
                    <UserCheck size={17} />
                    Convert
                  </button>
                  <button className="icon-button" type="button" aria-label="Close request details" onClick={() => setSelectedRequestId("")}>
                    <X size={17} />
                  </button>
                </div>
              </div>

              <div className="lead-detail-grid">
                <div>
                  <span>Directory Company</span>
                  <strong>{selectedRequest.companyName || "Not captured"}</strong>
                </div>
                <div>
                  <span>Contact</span>
                  <strong>{selectedRequest.contactName || "Not captured"}</strong>
                </div>
                <div>
                  <span>Request Type</span>
                  <strong>{selectedRequest.requestType}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedRequest.source}</strong>
                </div>
                <div>
                  <span>Service Category</span>
                  <strong>{selectedRequest.serviceCategory}</strong>
                </div>
                <div className="lead-assignment-field">
                  <span>Assigned Person</span>
                  {canWriteCrm ? (
                    <select value={selectedRequest.assignedToId ?? ""} onChange={(event) => void updateRequestAssignment(event.target.value)}>
                      <option value="">Unassigned</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>{assigneeLabel(assignee)}</option>
                      ))}
                    </select>
                  ) : (
                    <strong>{selectedRequest.assignedToName || "Unassigned"}</strong>
                  )}
                </div>
              </div>

              <div className="lead-contact-card">
                <p><Mail size={15} /> {selectedRequest.contactEmail || "No email captured"}</p>
                <p><Phone size={15} /> {selectedRequest.contactPhone || "No phone captured"}</p>
                <p>
                  <MapPin size={15} />{" "}
                  {[selectedRequest.siteName, selectedRequest.siteAddress, selectedRequest.city, selectedRequest.state]
                    .filter(Boolean)
                    .join(", ") || "No site captured"}
                </p>
                <p><CalendarClock size={15} /> Next follow-up: {selectedRequest.nextFollowUpAt || "Not set"}</p>
              </div>

              <section className="lead-section">
                <h3>Next Action</h3>
                <div className="request-next-action-card">
                  <strong>{getNextAction(selectedRequest)}</strong>
                  <span>Due: {selectedRequest.dueDate || "Not set"} - Received: {selectedRequest.receivedDate || "Not captured"}</span>
                </div>
              </section>

              <section className="lead-section">
                <h3>Intake Checklist</h3>
                <div className={selectedRequest.checklistSummary.readyForQuote ? "request-readiness-card ready" : "request-readiness-card"}>
                  <strong>
                    {selectedRequest.checklistSummary.readyForQuote
                      ? "Ready for Quote"
                      : `${selectedRequest.checklistSummary.missingRequired.length} required item(s) missing`}
                  </strong>
                  <span>
                    {selectedRequest.checklistSummary.completed}/{selectedRequest.checklistSummary.total} complete from {selectedRequest.checklistSummary.templateName}
                  </span>
                </div>
                {selectedRequest.checklistSummary.missingRequired.length ? (
                  <div className="request-tag-list">
                    {selectedRequest.checklistSummary.missingRequired.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                <div className="request-checklist">
                  {Object.entries(
                    selectedRequest.checklistItems.reduce<Record<string, RequestChecklistItem[]>>(
                      (groups, item) => {
                        const key = item.group || "Intake";
                        groups[key] = [...(groups[key] ?? []), item];
                        return groups;
                      },
                      {}
                    )
                  ).map(([group, items]) => (
                    <div className="request-checklist-group" key={group}>
                      <h4>{group}</h4>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          className={
                            item.completed
                              ? "request-checklist-item complete"
                              : item.applicable
                                ? "request-checklist-item"
                                : "request-checklist-item muted"
                          }
                          type="button"
                          onClick={() => toggleChecklistItem(item)}
                          disabled={!canWriteActivity || !item.applicable}
                        >
                          {item.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                          <span>
                            <strong>{item.label}</strong>
                            <small>
                              {item.required ? "Required" : "Optional"}
                              {!item.applicable ? " - not applicable" : ""}
                              {item.notes ? ` - ${item.notes}` : ""}
                            </small>
                            <RequestChecklistSignature item={item} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </section>

              <section className="lead-section">
                <h3>Intake Details</h3>
                <p className="lead-notes">{selectedRequest.description || "No request description yet."}</p>
              </section>

              <section className="lead-section">
                <h3>Missing Information</h3>
                {getMissingInfoItems(selectedRequest).length ? (
                  <div className="request-tag-list">
                    {getMissingInfoItems(selectedRequest).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="lead-notes">No missing intake information is flagged.</p>
                )}
              </section>

              <section className="lead-section">
                <h3>Workflow Status</h3>
                <div className="status-action-grid">
                  {[
                    "Received",
                    "Reviewing",
                    "Missing Info",
                    "Site Visit Required",
                    "Ready for Quote",
                    "No Bid",
                    "Cancelled",
                    "Duplicate"
                  ].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateRequestStatus(status as RequestStatus)}
                      disabled={!canWriteCrm}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section className="lead-section">
                <h3>Internal Notes</h3>
                <p className="lead-notes">{selectedRequest.internalNotes || "No internal notes yet."}</p>
                <textarea placeholder="Add a note to the timeline..." value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canWriteActivity} />
                <button className="toolbar-button compact" type="button" onClick={addNote} disabled={!canWriteActivity}>
                  <StickyNote size={16} />
                  Add Note
                </button>
              </section>

              <section className="lead-section">
                <h3>Follow-Ups</h3>
                <div className="task-composer">
                  <input placeholder="Add follow-up task..." value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} disabled={!canWriteActivity} />
                  <button type="button" onClick={addTask} disabled={!canWriteActivity}>Add</button>
                </div>
                <div className="task-list">
                  {selectedRequest.tasks.map((task) => (
                    <button key={task.id} className="task-row" type="button" onClick={() => toggleTask(task.id, task.completed)} disabled={!canWriteActivity}>
                      {task.completed ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}
                      <span>
                        <strong>{task.title}</strong>
                        <small>{task.owner} - {task.dueAt || "No due date"}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="lead-section">
                <h3>Files / Drawings</h3>
                {selectedRequest.files.length ? (
                  <div className="request-tag-list">
                    {selectedRequest.files.map((file) => <span key={file}>{file}</span>)}
                  </div>
                ) : (
                  <p className="lead-notes">No files are indexed yet. Upload and drawing package handling are planned for a later file model.</p>
                )}
              </section>

              <section className="lead-section">
                <h3>Related Quote</h3>
                <div className="request-next-action-card">
                  <strong>{selectedRequest.relatedQuoteNumber || "No quote workspace linked yet"}</strong>
                  <button className="toolbar-button compact" type="button" disabled={Boolean(selectedRequest.relatedQuoteId) || !canWriteCrm || !selectedRequest.checklistSummary.readyForQuote} onClick={() => setConversionOpen(true)}>
                    Create Quote Workspace
                  </button>
                </div>
              </section>

              <section className="lead-section">
                <h3>Activity Timeline</h3>
                <ActivityTimeline activities={recordActivities} emptyMessage="No shared activity has been recorded for this request yet." />
              </section>
            </>
          ) : (
            <div className="lead-empty-state detail">
              <strong>{isLoading ? "Loading request details..." : "No request selected."}</strong>
              <span>{isLoading ? "Pulse is reading from the local database." : "Create a request to begin."}</span>
            </div>
          )}
        </aside>
      </section>

      <section className="lead-reporting-panel">
        <div>
          <h3>Request Analytics Preview</h3>
          <p>Live MVP reporting from persisted request status counts. Advanced analytics can move into dedicated API summaries later.</p>
        </div>
        <div className="mini-bars">
          {requestStatuses.slice(0, 8).map((status) => {
            const count = requests.filter((request) => request.status === status).length;
            return (
              <div key={status}>
                <span>{status}</span>
                <strong style={{ width: `${Math.max(8, count * 42)}px` }} />
                <em>{count}</em>
              </div>
            );
          })}
        </div>
      </section>

      <div className="lead-toast">{toast}</div>

      {formMode ? (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true">
          <form className="lead-form-modal" onSubmit={saveRequest}>
            <div className="modal-heading">
              <div>
                <h2>{formMode === "edit" ? "Edit Request" : "Create Request"}</h2>
                <p>Capture what came in, who owns it, and the next action.</p>
              </div>
              <button type="button" onClick={() => setFormMode(null)} aria-label="Close form">
                <X size={20} />
              </button>
            </div>

            <div className="lead-form-grid">
              <label>
                Request title
                <input value={formState.title} onChange={(event) => setFormState({ ...formState, title: event.target.value })} />
              </label>
              <label>
                Request type
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
                Service category
                <select value={formState.serviceCategory} onChange={(event) => setFormState({ ...formState, serviceCategory: event.target.value as ServiceCategory })}>
                  {serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                Company
                <input value={formState.companyName} onChange={(event) => setFormState({ ...formState, companyName: event.target.value })} />
              </label>
              <label>
                Contact person
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
                Site/location
                <input value={formState.siteName} onChange={(event) => setFormState({ ...formState, siteName: event.target.value })} />
              </label>
              <label>
                Site address
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
                Assigned person
                <select value={formState.assignedToId} onChange={(event) => setFormState({ ...formState, assignedToId: event.target.value })}>
                  <option value="">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>{assigneeLabel(assignee)}</option>
                  ))}
                </select>
              </label>
              <label>
                Received date
                <input type="date" value={formState.receivedDate} onChange={(event) => setFormState({ ...formState, receivedDate: event.target.value })} />
              </label>
              <label>
                Due date
                <input type="date" value={formState.dueDate} onChange={(event) => setFormState({ ...formState, dueDate: event.target.value })} />
              </label>
              <label>
                Next follow-up
                <input type="date" value={formState.nextFollowUpAt} onChange={(event) => setFormState({ ...formState, nextFollowUpAt: event.target.value })} />
              </label>
              <label className="lead-form-wide">
                Next action
                <input value={formState.nextAction} onChange={(event) => setFormState({ ...formState, nextAction: event.target.value })} />
              </label>
              <label className="lead-form-wide">
                Missing information
                <input value={formState.missingInfo} onChange={(event) => setFormState({ ...formState, missingInfo: event.target.value })} />
              </label>
              <label>
                Site visit needed
                <input type="checkbox" checked={formState.siteVisitNeeded} onChange={(event) => setFormState({ ...formState, siteVisitNeeded: event.target.checked })} />
              </label>
              <label>
                Site visit completed
                <input type="checkbox" checked={formState.siteVisitCompleted} onChange={(event) => setFormState({ ...formState, siteVisitCompleted: event.target.checked })} />
              </label>
              <label className="lead-form-wide">
                Description
                <textarea value={formState.description} onChange={(event) => setFormState({ ...formState, description: event.target.value })} />
              </label>
              <label className="lead-form-wide">
                Internal notes
                <textarea value={formState.internalNotes} onChange={(event) => setFormState({ ...formState, internalNotes: event.target.value })} />
              </label>
            </div>

            <div className="modal-actions">
              <button className="toolbar-button compact" type="button" onClick={() => setFormMode(null)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                <Save size={17} />
                {isSaving ? "Saving..." : "Save Request"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {conversionOpen && selectedRequest ? (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true">
          <section className="conversion-modal">
            <div className="modal-heading">
              <div>
                <h2>Create Quote Workspace</h2>
                <p>{selectedRequest.requestNumber} will be linked to a draft quote record.</p>
              </div>
              <button type="button" onClick={() => setConversionOpen(false)} aria-label="Close conversion">
                <X size={20} />
              </button>
            </div>

            <div className="conversion-summary">
              <div>
                <ClipboardCheck size={22} />
                <span>
                  <strong>Convert request</strong>
                  <small>Financial work remains in the Quotes module.</small>
                </span>
              </div>
              <label>
                <input type="checkbox" checked={createQuoteOnConvert} onChange={(event) => setCreateQuoteOnConvert(event.target.checked)} />
                Create draft quote record
              </label>
              <p>
                Pulse will preserve intake history and mark this request as Converted to Quote.
              </p>
            </div>

            <div className="modal-actions">
              <button className="toolbar-button compact" type="button" onClick={() => setConversionOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" onClick={convertRequest}>
                Convert Request
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
