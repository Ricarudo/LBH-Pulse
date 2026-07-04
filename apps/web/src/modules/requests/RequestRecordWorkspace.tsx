"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Edit3,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Save,
  Send,
  StickyNote,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { formatWorkspaceDate } from "@/lib/formatting";
import type { ActivityRecord } from "@/types/activity";
import { RequestChecklistSignature } from "./RequestChecklistSignature";
import {
  requestPriorities,
  type RequestAssignee,
  type RequestChecklistItem,
  type RequestPriority,
  type RequestRecord,
  type RequestStatus
} from "./requestData";

type RequestResponse = { request: RequestRecord };
type RequestListResponse = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
};
type ActivityListResponse = { activities: ActivityRecord[] };
type SupportingTab = "details" | "files" | "activity";

type ActionDraft = {
  assignedToId: string;
  nextAction: string;
  nextFollowUpAt: string;
  dueDate: string;
  priority: RequestPriority;
};

const terminalStatuses: RequestStatus[] = ["No Bid", "Cancelled", "Duplicate"];
const supportingTabs: Array<{ id: SupportingTab; label: string }> = [
  { id: "details", label: "Details" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" }
];
const today = new Date().toISOString().slice(0, 10);

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

function actionDraftFromRequest(request: RequestRecord): ActionDraft {
  return {
    assignedToId: request.assignedToId ?? "",
    nextAction: request.nextAction,
    nextFollowUpAt: request.nextFollowUpAt,
    dueDate: request.dueDate,
    priority: request.priority
  };
}

function formatDate(value: string) {
  return formatWorkspaceDate(value) || "Not set";
}

function statusTone(status: RequestStatus) {
  if (status === "Ready for Quote" || status === "Converted to Quote") {
    return "success";
  }
  if (status === "Missing Info" || status === "Site Visit Required") {
    return "warning";
  }
  if (terminalStatuses.includes(status)) {
    return "neutral";
  }
  return "info";
}

function priorityTone(priority: RequestPriority) {
  if (priority === "Urgent") return "danger";
  if (priority === "High") return "warning";
  return "neutral";
}

function siteSummary(request: RequestRecord) {
  return (
    [request.siteName, request.siteAddress, request.city, request.state]
      .filter(Boolean)
      .join(", ") || "Site not captured"
  );
}

function getNextAction(request: RequestRecord) {
  if (request.nextAction) return request.nextAction;
  if (!request.assignedToId) return "Assign an owner";
  if (request.checklistSummary.missingRequired.length) {
    return `Resolve ${request.checklistSummary.missingRequired[0]}`;
  }
  if (request.siteVisitNeeded && !request.siteVisitCompleted) {
    return "Complete required site visit";
  }
  return request.checklistSummary.readyForQuote
    ? "Create quote workspace"
    : "Set next follow-up";
}

function groupItems(items: RequestChecklistItem[]) {
  return items.reduce<Record<string, RequestChecklistItem[]>>((groups, item) => {
    const group = item.group || "Intake";
    groups[group] = [...(groups[group] ?? []), item];
    return groups;
  }, {});
}

export function RequestRecordWorkspace({
  requestId,
  returnTo
}: {
  requestId: string;
  returnTo: string;
}) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canWriteCrm = canRole(user?.role, "crm:write");
  const canWriteActivity = canRole(user?.role, "crm:activity:write");
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [activeTab, setActiveTab] = useState<SupportingTab>("details");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [pendingChecklistIds, setPendingChecklistIds] = useState<string[]>([]);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<string[]>([]);
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [closeStatus, setCloseStatus] = useState<RequestStatus | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const tabRefs = useRef<Record<SupportingTab, HTMLButtonElement | null>>({
    details: null,
    files: null,
    activity: null
  });

  const recordHref = `/requests/${requestId}?returnTo=${encodeURIComponent(returnTo)}`;
  const editHref = `/requests/${requestId}/edit?returnTo=${encodeURIComponent(returnTo)}`;

  const loadActivities = useCallback(async () => {
    try {
      const data = await requestJson<ActivityListResponse>(
        `/api/activity?relatedEntityType=Request&relatedEntityId=${requestId}&take=25`,
        { cache: "no-store" }
      );
      setActivities(data.activities);
    } catch {
      setActivities([]);
    }
  }, [requestId]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError("");
        const [requestData, listData] = await Promise.all([
          requestJson<RequestResponse>(`/api/requests/${requestId}`, {
            cache: "no-store"
          }),
          requestJson<RequestListResponse>("/api/requests", {
            cache: "no-store"
          })
        ]);
        setRequest(requestData.request);
        setActionDraft(actionDraftFromRequest(requestData.request));
        setAssignees(listData.assignees);
        await loadActivities();
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load request."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [loadActivities, requestId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (conversionOpen) setConversionOpen(false);
      else if (closeStatus) setCloseStatus(null);
      else setMoreOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeStatus, conversionOpen]);

  const checklistState = useMemo(() => {
    const sourceItems = request?.checklistInstances.length
      ? request.checklistInstances.filter((instance) => instance.active).flatMap((instance) => instance.items)
      : request?.checklistItems ?? [];
    const sorted = [...sourceItems].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)
    );
    const openRequired = sorted.filter(
      (item) => item.applicable && item.required && !item.completed
    );
    const optional = sorted.filter(
      (item) => item.applicable && !item.required && !item.completed
    );
    const completed = sorted.filter((item) => item.completed);
    const inactive = sorted.filter((item) => !item.applicable && !item.completed);
    const itemLabels = new Set(sorted.map((item) => item.label));
    const systemBlockers = (request?.checklistSummary.missingRequired ?? []).filter(
      (label) => !itemLabels.has(label)
    );
    return { openRequired, optional, completed, inactive, systemBlockers };
  }, [request]);

  const actionDirty = Boolean(
    request &&
      actionDraft &&
      JSON.stringify(actionDraft) !==
        JSON.stringify(actionDraftFromRequest(request))
  );
  const isClosed = Boolean(request && terminalStatuses.includes(request.status));
  const isConverted = request?.status === "Converted to Quote";
  const recordLocked = isClosed || isConverted;
  const blockerCount = request?.checklistSummary.missingRequired.length ?? 0;

  function replaceRequest(updated: RequestRecord) {
    setRequest(updated);
    setActionDraft(actionDraftFromRequest(updated));
  }

  async function saveActionPanel() {
    if (!request || !actionDraft || !canWriteCrm || !actionDirty) return;
    try {
      setIsSavingAction(true);
      setError("");
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(actionDraft)
        }
      );
      replaceRequest(data.request);
      await loadActivities();
      setToast("Action and ownership updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to update request."
      );
    } finally {
      setIsSavingAction(false);
    }
  }

  async function toggleChecklistItem(item: RequestChecklistItem) {
    if (!request || !canWriteActivity || recordLocked || pendingChecklistIds.includes(item.id)) {
      return;
    }
    const previous = request;
    setPendingChecklistIds((current) => [...current, item.id]);
    setRequest({
      ...request,
      checklistItems: request.checklistItems.map((current) =>
        current.id === item.id
          ? { ...current, completed: !current.completed }
          : current
      ),
      checklistInstances: request.checklistInstances.map((instance) => ({
        ...instance,
        items: instance.items.map((current) =>
          current.id === item.id ? { ...current, completed: !current.completed } : current
        )
      }))
    });
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/checklist/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            completed: !item.completed,
            notes: checklistNotes[item.id] ?? item.notes
          })
        }
      );
      replaceRequest(data.request);
      await loadActivities();
      setToast(item.completed ? "Checklist item reopened." : "Checklist item completed.");
    } catch (toggleError) {
      setRequest(previous);
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update checklist."
      );
    } finally {
      setPendingChecklistIds((current) =>
        current.filter((id) => id !== item.id)
      );
    }
  }

  async function saveChecklistNote(item: RequestChecklistItem) {
    if (!request || !canWriteActivity || recordLocked || pendingChecklistIds.includes(item.id)) {
      return;
    }
    try {
      setPendingChecklistIds((current) => [...current, item.id]);
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/checklist/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            completed: item.completed,
            notes: checklistNotes[item.id] ?? item.notes
          })
        }
      );
      replaceRequest(data.request);
      await loadActivities();
      setToast("Checklist note saved.");
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : "Unable to save checklist note."
      );
    } finally {
      setPendingChecklistIds((current) =>
        current.filter((id) => id !== item.id)
      );
    }
  }

  async function addTask() {
    if (!request || !canWriteActivity || !taskTitle.trim()) return;
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            title: taskTitle.trim(),
            dueAt: request.nextFollowUpAt || request.dueDate || today,
            owner: request.assignedToName || "Unassigned"
          })
        }
      );
      replaceRequest(data.request);
      setTaskTitle("");
      await loadActivities();
      setToast("Follow-up task added.");
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Unable to add task.");
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (!request || !canWriteActivity) return;
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !completed })
        }
      );
      replaceRequest(data.request);
      await loadActivities();
    } catch (taskError) {
      setError(
        taskError instanceof Error ? taskError.message : "Unable to update task."
      );
    }
  }

  async function addActivityNote() {
    if (!request || !canWriteActivity || !noteText.trim()) return;
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/activities`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "Note",
            title: "Note added",
            body: noteText.trim(),
            actor: user?.name ?? "Pulse User"
          })
        }
      );
      replaceRequest(data.request);
      setNoteText("");
      await loadActivities();
      setToast("Activity note added.");
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "Unable to add note.");
    }
  }

  async function closeRequest() {
    if (!request || !closeStatus || !closeReason.trim()) return;
    try {
      setIsChangingStatus(true);
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: closeStatus,
            reason: closeReason.trim()
          })
        }
      );
      replaceRequest(data.request);
      setCloseStatus(null);
      setCloseReason("");
      await loadActivities();
      setToast(`Request moved to ${data.request.status}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to close request."
      );
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function reopenRequest() {
    if (!request || !isClosed) return;
    try {
      setIsChangingStatus(true);
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "Reviewing" })
        }
      );
      replaceRequest(data.request);
      await loadActivities();
      setToast(`Request reopened as ${data.request.status}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to reopen request."
      );
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function convertRequest() {
    if (!request || !request.checklistSummary.readyForQuote) return;
    try {
      setIsConverting(true);
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/convert`,
        {
          method: "POST",
          body: JSON.stringify({ createQuote: true })
        }
      );
      replaceRequest(data.request);
      setConversionOpen(false);
      await loadActivities();
      setToast(
        data.request.relatedQuoteNumber
          ? `Created ${data.request.relatedQuoteNumber}.`
          : "Request converted."
      );
    } catch (conversionError) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Unable to create quote."
      );
    } finally {
      setIsConverting(false);
    }
  }

  function handleQuoteAction() {
    if (!request) return;
    if (!request.checklistSummary.readyForQuote) {
      const firstBlocker =
        document.querySelector<HTMLElement>("[data-request-blocker]") ??
        document.getElementById("request-action-panel");
      firstBlocker?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => firstBlocker?.focus(), 350);
      return;
    }
    setConversionOpen(true);
  }

  function selectTab(tab: SupportingTab) {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: SupportingTab) {
    const index = supportingTabs.findIndex((item) => item.id === tab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(supportingTabs[(index + 1) % supportingTabs.length].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab(
        supportingTabs[(index - 1 + supportingTabs.length) % supportingTabs.length].id
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(supportingTabs[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(supportingTabs[supportingTabs.length - 1].id);
    }
  }

  function renderChecklistItems(items: RequestChecklistItem[]) {
    const grouped = groupItems(items);
    return Object.entries(grouped).map(([group, groupItems]) => (
      <section className="record-checklist-group" key={group}>
        <h3>{group}</h3>
        <div>
          {groupItems.map((item) => {
            const expanded = expandedChecklistIds.includes(item.id);
            const pending = pendingChecklistIds.includes(item.id);
            const noteValue = checklistNotes[item.id] ?? item.notes;
            return (
              <article
                className={[
                  "record-checklist-item",
                  item.completed ? "complete" : "",
                  item.required ? "required" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={item.id}
                data-request-blocker={!item.completed && item.required ? "" : undefined}
                tabIndex={!item.completed && item.required ? -1 : undefined}
              >
                <button
                  className="record-checklist-toggle"
                  type="button"
                  onClick={() => void toggleChecklistItem(item)}
                  disabled={!canWriteActivity || recordLocked || !item.applicable || pending}
                  aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.label}`}
                >
                  {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                <button
                  className="record-checklist-content"
                  type="button"
                  onClick={() => {
                    setExpandedChecklistIds((current) =>
                      expanded
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id]
                    );
                    setChecklistNotes((current) => ({
                      ...current,
                      [item.id]: current[item.id] ?? item.notes
                    }));
                  }}
                  aria-expanded={expanded}
                >
                  <span>
                    <strong>{item.label}</strong>
                    {item.description ? <small>{item.description}</small> : null}
                    <em>{item.required ? "Required" : "Optional"}</em>
                    <RequestChecklistSignature item={item} compact />
                  </span>
                  <ChevronDown size={18} />
                </button>
                {expanded ? (
                  <div className="record-checklist-note">
                    <label>
                      Item note
                      <textarea
                        value={noteValue}
                        onChange={(event) =>
                          setChecklistNotes((current) => ({
                            ...current,
                            [item.id]: event.target.value
                          }))
                        }
                        disabled={!canWriteActivity || recordLocked || pending}
                        placeholder="Add context, a reference, or what was confirmed..."
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveChecklistNote(item)}
                      disabled={
                        !canWriteActivity || recordLocked || pending || noteValue === item.notes
                      }
                    >
                      <Save size={15} />
                      Save note
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    ));
  }

  if (isLoading) {
    return (
      <section className="request-record-skeleton" aria-label="Loading request">
        <div />
        <div />
        <div />
      </section>
    );
  }

  if (!request || error && !actionDraft) {
    return (
      <section className="request-record-empty">
        <AlertTriangle size={24} />
        <strong>{error || "Request not found."}</strong>
        <Link href={returnTo}>Back to queue</Link>
      </section>
    );
  }

  return (
    <section className="request-record-page">
      <header className="request-record-header">
        <Link className="request-back-link" href={returnTo}>
          <ArrowLeft size={17} />
          Queue
        </Link>
        <div className="request-record-identity">
          <span>{request.requestNumber}</span>
          <h1>{request.title}</h1>
          <div>
            <span className={`record-status tone-${statusTone(request.status)}`}>
              {request.status}
            </span>
            <span className={`record-priority tone-${priorityTone(request.priority)}`}>
              {request.priority}
            </span>
            {request.serviceCategories.map((category) => <span className="record-category" key={category}>{category}</span>)}
          </div>
        </div>
        <div className="request-record-actions">
          <Link className="record-secondary-action" href={editHref}>
            <Edit3 size={16} />
            Edit details
          </Link>
          {isClosed ? (
            <button
              className="record-primary-action"
              type="button"
              onClick={() => void reopenRequest()}
              disabled={!canWriteCrm || isChangingStatus}
            >
              <RotateCcw size={16} />
              Reopen request
            </button>
          ) : isConverted ? (
            <Link className="record-primary-action" href="/quotes">
              <FileText size={16} />
              {request.relatedQuoteNumber || "View quotes"}
            </Link>
          ) : (
            <button
              className="record-primary-action"
              type="button"
              onClick={handleQuoteAction}
              disabled={!canWriteCrm}
            >
              <Send size={16} />
              {request.checklistSummary.readyForQuote
                ? "Create draft quote"
                : `Resolve ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`}
            </button>
          )}
          {!isConverted ? (
            <div className="record-more-menu">
              <button
                type="button"
                aria-label="More request actions"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <MoreHorizontal size={18} />
              </button>
              {moreOpen ? (
                <div role="menu">
                  {terminalStatuses.map((status) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={status}
                      onClick={() => {
                        setMoreOpen(false);
                        setCloseStatus(status);
                      }}
                      disabled={!canWriteCrm || request.status === status}
                    >
                      Move to {status}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="request-highlight-panel" aria-label="Request highlights">
        <div>
          <span>Client / site</span>
          <strong>{request.companyName || "New prospect"}</strong>
          <small><MapPin size={14} /> {siteSummary(request)}</small>
        </div>
        <div>
          <span>Contact</span>
          <strong>{request.contactName || "Not captured"}</strong>
          <small>
            {request.contactEmail ? <Mail size={14} /> : <Phone size={14} />}
            {request.contactEmail || request.contactPhone || "No contact method"}
          </small>
        </div>
        <div>
          <span>Owner</span>
          <strong>{request.assignedToName || "Unassigned"}</strong>
          <small><UserRound size={14} /> {request.assignedToRole || "Needs assignment"}</small>
        </div>
        <div>
          <span>Timing</span>
          <strong>{request.dueDate ? `Due ${formatDate(request.dueDate)}` : "No due date"}</strong>
          <small><CalendarClock size={14} /> {request.nextFollowUpAt ? `Follow-up ${formatDate(request.nextFollowUpAt)}` : "No follow-up"}</small>
        </div>
      </section>

      {error ? (
        <div className="request-record-alert" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={17} />
          </button>
        </div>
      ) : null}

      <div className="request-record-workspace">
        <section className="request-progress-workspace" id="request-blockers">
          <div className="request-progress-heading">
            <div>
              <span>Progress to quote</span>
              <h2>{request.checklistSummary.templateName}</h2>
              <p>
                Complete required intake and resolve record blockers before handoff.
              </p>
            </div>
            <div className={request.checklistSummary.readyForQuote ? "ready" : ""}>
              <strong>
                {request.checklistSummary.requiredCompleted}/
                {request.checklistSummary.requiredTotal}
              </strong>
              <span>required complete</span>
            </div>
          </div>
          <div
            className="record-progress-track"
            role="progressbar"
            aria-label="Required checklist progress"
            aria-valuemin={0}
            aria-valuemax={request.checklistSummary.requiredTotal || 1}
            aria-valuenow={request.checklistSummary.requiredCompleted}
          >
            <span
              style={{
                width: `${
                  request.checklistSummary.requiredTotal
                    ? Math.round(
                        (request.checklistSummary.requiredCompleted /
                          request.checklistSummary.requiredTotal) *
                          100
                      )
                    : 0
                }%`
              }}
            />
          </div>

          {checklistState.systemBlockers.length ? (
            <section className="record-system-blockers">
              <h3>Record blockers</h3>
              <div>
                {checklistState.systemBlockers.map((blocker) => (
                  <Link
                    key={blocker}
                    href={
                      blocker === "Internal owner assigned"
                        ? "#request-action-panel"
                        : `${editHref}#${
                            blocker.includes("Contact") ||
                            blocker.includes("Client")
                              ? "client-site"
                              : blocker.includes("Service")
                                ? "request-basics"
                                : "intake-context"
                          }`
                    }
                    data-request-blocker
                  >
                    <AlertTriangle size={17} />
                    <span>
                      <strong>{blocker}</strong>
                      <small>Resolve this requirement</small>
                    </span>
                    <ChevronRight size={17} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="record-checklist-instances">
            {request.checklistInstances.filter((instance) => instance.active).map((instance) => {
              const open = instance.items.filter((item) => item.applicable && item.required && !item.completed);
              const optional = instance.items.filter((item) => item.applicable && !item.required && !item.completed);
              const completed = instance.items.filter((item) => item.completed);
              const inactive = instance.items.filter((item) => !item.applicable && !item.completed);
              return <section className="record-checklist-instance" key={instance.id}>
                <div className="record-checklist-instance-heading">
                  <div><span>{instance.matchType === "CORE" ? "Core" : instance.matchType === "TRADE" ? "Trade" : instance.matchType === "REQUEST_TYPE" ? "Request type" : "Legacy"}</span><h3>{instance.templateName}</h3>{instance.matchValue ? <small>{instance.matchValue}</small> : null}</div>
                  <strong>{instance.summary.requiredCompleted}/{instance.summary.requiredTotal}</strong>
                </div>
                <section className="record-open-checklist">
                  <div className="record-section-heading"><h3>Required to do</h3><span>{open.length} open</span></div>
                  {open.length ? renderChecklistItems(open) : <div className="record-checklist-empty"><CheckCircle2 size={21} /><strong>All required items in this checklist are complete.</strong></div>}
                </section>
                {optional.length ? <details className="record-checklist-disclosure"><summary><span>Optional items</span><strong>{optional.length}</strong></summary>{renderChecklistItems(optional)}</details> : null}
                {completed.length ? <details className="record-checklist-disclosure"><summary><span>Completed</span><strong>{completed.length}</strong></summary>{renderChecklistItems(completed)}</details> : null}
                {inactive.length ? <details className="record-checklist-disclosure"><summary><span>Not applicable</span><strong>{inactive.length}</strong></summary>{renderChecklistItems(inactive)}</details> : null}
              </section>;
            })}
          </div>
          {request.checklistInstances.some((instance) => !instance.active) ? <details className="record-checklist-disclosure retired"><summary><span>Retired checklist history</span><strong>{request.checklistInstances.filter((instance) => !instance.active).length}</strong></summary>{request.checklistInstances.filter((instance) => !instance.active).map((instance) => <section className="record-checklist-instance retired" key={instance.id}><div className="record-checklist-instance-heading"><div><span>Retired</span><h3>{instance.templateName}</h3></div></div>{renderChecklistItems(instance.items)}</section>)}</details> : null}
        </section>

        <aside className="request-action-rail">
          <section className="request-action-panel" id="request-action-panel" tabIndex={-1}>
            <div className="record-section-heading">
              <div>
                <span>Current move</span>
                <h2>Action and ownership</h2>
              </div>
              {actionDirty ? <em>Unsaved</em> : <Check size={17} />}
            </div>
            <label>
              Next action
              <textarea
                value={actionDraft?.nextAction ?? ""}
                onChange={(event) =>
                  setActionDraft((current) =>
                    current ? { ...current, nextAction: event.target.value } : current
                  )
                }
                placeholder={getNextAction(request)}
                disabled={!canWriteCrm || recordLocked}
              />
            </label>
            <label>
              Owner
              <select
                value={actionDraft?.assignedToId ?? ""}
                onChange={(event) =>
                  setActionDraft((current) =>
                    current
                      ? { ...current, assignedToId: event.target.value }
                      : current
                  )
                }
                disabled={!canWriteCrm || recordLocked}
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                ))}
              </select>
            </label>
            <div className="request-action-date-grid">
              <label>
                Follow-up
                <input
                  type="date"
                  value={actionDraft?.nextFollowUpAt ?? ""}
                  onChange={(event) =>
                    setActionDraft((current) =>
                      current
                        ? { ...current, nextFollowUpAt: event.target.value }
                        : current
                    )
                  }
                  disabled={!canWriteCrm || recordLocked}
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={actionDraft?.dueDate ?? ""}
                  onChange={(event) =>
                    setActionDraft((current) =>
                      current ? { ...current, dueDate: event.target.value } : current
                    )
                  }
                  disabled={!canWriteCrm || recordLocked}
                />
              </label>
            </div>
            <label>
              Priority
              <select
                value={actionDraft?.priority ?? request.priority}
                onChange={(event) =>
                  setActionDraft((current) =>
                    current
                      ? {
                          ...current,
                          priority: event.target.value as RequestPriority
                        }
                      : current
                  )
                }
                disabled={!canWriteCrm || recordLocked}
              >
                {requestPriorities.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <div className="request-action-panel-buttons">
              <button
                type="button"
                onClick={() => setActionDraft(actionDraftFromRequest(request))}
                disabled={!actionDirty || isSavingAction}
              >
                Reset
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => void saveActionPanel()}
                disabled={!actionDirty || isSavingAction}
              >
                <Save size={15} />
                {isSavingAction ? "Saving..." : "Save changes"}
              </button>
            </div>
          </section>

          <section className="request-followup-panel">
            <div className="record-section-heading">
              <div>
                <span>Follow-ups</span>
                <h2>Tasks</h2>
              </div>
              <strong>{request.tasks.filter((task) => !task.completed).length}</strong>
            </div>
            <div className="record-task-composer">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Add follow-up task"
                disabled={!canWriteActivity}
              />
              <button
                type="button"
                onClick={() => void addTask()}
                disabled={!canWriteActivity || !taskTitle.trim()}
              >
                Add
              </button>
            </div>
            <div className="record-task-list">
              {request.tasks.length ? (
                request.tasks.map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    className={task.completed ? "complete" : ""}
                    onClick={() => void toggleTask(task.id, task.completed)}
                    disabled={!canWriteActivity}
                  >
                    {task.completed ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
                    <span>
                      <strong>{task.title}</strong>
                      <small>{task.owner} · {task.dueAt ? formatDate(task.dueAt) : "No due date"}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p>No follow-up tasks yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="request-supporting-panel">
        <div className="request-supporting-tabs" role="tablist" aria-label="Request supporting information">
          {supportingTabs.map((tab) => (
            <button
              key={tab.id}
              id={`request-tab-${tab.id}`}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`request-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
              {tab.id === "files" && request.documents.length ? (
                <span>{request.documents.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div
          id={`request-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`request-tab-${activeTab}`}
          tabIndex={0}
          className="request-supporting-content"
        >
          {activeTab === "details" ? (
            <div className="request-details-grid">
              <section>
                <span>Client and site</span>
                <h3>{request.companyName || "New prospect"}</h3>
                <p>{siteSummary(request)}</p>
                <small>{request.requestType} · {request.source}</small>
              </section>
              <section>
                <span>Contact</span>
                <h3>{request.contactName || "Not captured"}</h3>
                <p>{request.contactEmail || "No email"}</p>
                <small>{request.contactPhone || "No phone"}</small>
              </section>
              <section className="wide">
                <span>Intake description</span>
                <p>{request.description || "No intake description has been added."}</p>
              </section>
              <section className="wide">
                <span>Internal summary</span>
                <p>{request.internalNotes || "No internal summary has been added."}</p>
              </section>
              {request.missingInfo ? (
                <section className="wide warning">
                  <span>Additional missing information</span>
                  <p>{request.missingInfo}</p>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === "files" ? (
            <LifecycleDocuments
              stage="request"
              recordId={request.id}
              documents={request.documents}
              canWrite={canWriteCrm}
              onChange={(documents) => setRequest({ ...request, documents })}
            />
          ) : null}

          {activeTab === "activity" ? (
            <div className="request-activity-panel">
              <div className="record-note-composer">
                <label>
                  Add activity note
                  <textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Record an update, client conversation, or decision..."
                    disabled={!canWriteActivity}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void addActivityNote()}
                  disabled={!canWriteActivity || !noteText.trim()}
                >
                  <StickyNote size={16} />
                  Add note
                </button>
              </div>
              <ActivityTimeline
                activities={activities}
                emptyMessage="No shared activity has been recorded for this request yet."
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="request-mobile-action-bar">
        <Link href={editHref}><Edit3 size={17} /> Edit</Link>
        {!isConverted && !isClosed ? (
          <button type="button" onClick={handleQuoteAction}>
            <Send size={17} />
            {request.checklistSummary.readyForQuote ? "Create quote" : "Resolve blockers"}
          </button>
        ) : isClosed ? (
          <button type="button" onClick={() => void reopenRequest()}>
            <RotateCcw size={17} />
            Reopen
          </button>
        ) : (
          <Link href="/quotes"><FileText size={17} /> View quote</Link>
        )}
      </div>

      {toast ? (
        <div className="lead-toast" role="status" aria-live="polite">{toast}</div>
      ) : null}

      {closeStatus ? (
        <div className="record-dialog-backdrop">
          <section className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="close-request-title">
            <div className="record-dialog-heading">
              <span><AlertTriangle size={19} /></span>
              <div>
                <h2 id="close-request-title">Move to {closeStatus}</h2>
                <p>Explain why this request is leaving active intake.</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={() => setCloseStatus(null)}>
                <X size={19} />
              </button>
            </div>
            <label>
              Reason
              <textarea
                autoFocus
                value={closeReason}
                onChange={(event) => setCloseReason(event.target.value)}
                placeholder="Add a concise reason for the activity history..."
              />
            </label>
            <div className="record-dialog-actions">
              <button type="button" onClick={() => setCloseStatus(null)}>Cancel</button>
              <button
                className="danger"
                type="button"
                onClick={() => void closeRequest()}
                disabled={!closeReason.trim() || isChangingStatus}
              >
                {isChangingStatus ? "Saving..." : `Confirm ${closeStatus}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {conversionOpen ? (
        <div className="record-dialog-backdrop">
          <section className="record-dialog" role="dialog" aria-modal="true" aria-labelledby="convert-request-title">
            <div className="record-dialog-heading">
              <span className="success"><CheckCircle2 size={19} /></span>
              <div>
                <h2 id="convert-request-title">Create draft quote?</h2>
                <p>{request.requestNumber} is ready for handoff.</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={() => setConversionOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="record-conversion-summary">
              <strong>{request.companyName || request.title}</strong>
              <span>{request.serviceCategory} · Owner: {request.assignedToName || "Unassigned"}</span>
              <p>The checklist and activity history remain attached to this request.</p>
            </div>
            <div className="record-dialog-actions">
              <button type="button" onClick={() => setConversionOpen(false)}>Cancel</button>
              <button
                className="primary"
                type="button"
                onClick={() => void convertRequest()}
                disabled={isConverting}
              >
                {isConverting ? "Creating..." : "Create draft quote"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
