"use client";

import {
  AlertTriangle,
  AtSign,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Edit3,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Save,
  Send,
  Users,
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
import { LifecycleDocuments } from "@/components/LifecycleDocuments";
import { ViewportPortal } from "@/components/ViewportPortal";
import { canUser } from "@pulse/contracts/auth";
import { convertRequestToQuote } from "@/lib/api/requests";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { formatWorkspaceDate } from "@/lib/formatting";
import { RequestChecklistSignature } from "./RequestChecklistSignature";
import {
  requestUpdateFilters,
  type RequestAssignee,
  type RequestChecklistItem,
  type RequestPriority,
  type RequestRecord,
  type RequestStatus,
  type RequestUpdate,
  type RequestUpdateFilter
} from "@pulse/contracts/requests";

type RequestResponse = { request: RequestRecord };
type RequestListResponse = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
  teamMembers?: RequestAssignee[];
};
type RequestRecordTab = "checklist" | "details" | "files" | "updates";

const terminalStatuses: RequestStatus[] = ["No Bid", "Cancelled", "Duplicate"];
const requestRecordTabs: Array<{ id: RequestRecordTab; label: string }> = [
  { id: "checklist", label: "Checklist" },
  { id: "details", label: "Details" },
  { id: "files", label: "Files" },
  { id: "updates", label: "Updates" }
];

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

function groupItems(items: RequestChecklistItem[]) {
  return items.reduce<Record<string, RequestChecklistItem[]>>((groups, item) => {
    const group = item.group || "Intake";
    groups[group] = [...(groups[group] ?? []), item];
    return groups;
  }, {});
}

export function RequestRecordWorkspace({
  requestId,
  returnTo,
  initialTab = "checklist",
  focusUpdateId
}: {
  requestId: string;
  returnTo: string;
  initialTab?: RequestRecordTab;
  focusUpdateId?: string;
}) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canWriteCrm = canUser(user, "requests:write");
  const canWriteActivity = canUser(user, "activity:write");
  const canWriteQuotes = canUser(user, "quotes:write");
  const canViewQuotes = canUser(user, "quotes:read");
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [assignees, setAssignees] = useState<RequestAssignee[]>([]);
  const [teamMembers, setTeamMembers] = useState<RequestAssignee[]>([]);
  const [updates, setUpdates] = useState<RequestUpdate[]>([]);
  const [updateFilter, setUpdateFilter] = useState<RequestUpdateFilter>("all");
  const [updatesCursor, setUpdatesCursor] = useState<string | null>(null);
  const [updatesHasMore, setUpdatesHasMore] = useState(false);
  const [isLoadingUpdates, setIsLoadingUpdates] = useState(false);
  const [activeTab, setActiveTab] = useState<RequestRecordTab>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingChecklistIds, setPendingChecklistIds] = useState<string[]>([]);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<string[]>([]);
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>({});
  const [updateBody, setUpdateBody] = useState("");
  const [isCurrentStepDraft, setIsCurrentStepDraft] = useState(false);
  const [stepAssigneeId, setStepAssigneeId] = useState("");
  const [stepTargetDate, setStepTargetDate] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [supersessionConfirmationOpen, setSupersessionConfirmationOpen] = useState(false);
  const [undoAction, setUndoAction] = useState<{ updateId: string; label: string } | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [closeStatus, setCloseStatus] = useState<RequestStatus | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const tabRefs = useRef<Record<RequestRecordTab, HTMLButtonElement | null>>({
    checklist: null,
    details: null,
    files: null,
    updates: null
  });
  const updateRefs = useRef<Record<string, HTMLElement | null>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const recordHref = `/requests/${requestId}?returnTo=${encodeURIComponent(returnTo)}`;
  const editHref = `/requests/${requestId}/edit?returnTo=${encodeURIComponent(returnTo)}`;

  const loadUpdates = useCallback(async (filter: RequestUpdateFilter, cursor?: string | null) => {
    try {
      setIsLoadingUpdates(true);
      const params = new URLSearchParams({ kind: filter, take: "25" });
      if (cursor) params.set("cursor", cursor);
      const data = await requestJson<{
        updates: RequestUpdate[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(
        `/api/requests/${requestId}/updates?${params.toString()}`,
        { cache: "no-store" }
      );
      setUpdates((current) => cursor ? [...current, ...data.updates] : data.updates);
      setUpdatesCursor(data.nextCursor);
      setUpdatesHasMore(data.hasMore);
    } catch {
      if (!cursor) setUpdates([]);
    } finally {
      setIsLoadingUpdates(false);
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
        setUpdates(requestData.request.updates);
        setAssignees(listData.assignees);
        setTeamMembers(listData.teamMembers ?? listData.assignees);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load request."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [requestId]);

  useEffect(() => {
    if (activeTab !== "updates" || !request) return;
    void loadUpdates(updateFilter);
    if (user?.id && request.unreadMentionCount > 0) {
      void requestJson(`/api/requests/${request.id}/mentions/read`, { method: "POST" })
        .then(() => requestJson<RequestResponse>(`/api/requests/${request.id}`, { cache: "no-store" }))
        .then((data) => {
          setRequest(data.request);
          setUpdates(data.request.updates);
        })
        .catch(() => undefined);
    }
  }, [activeTab, loadUpdates, request?.id, request?.unreadMentionCount, updateFilter, user?.id]);

  useEffect(() => {
    if (activeTab !== "updates" || !focusUpdateId) return;
    const timeout = window.setTimeout(() => {
      const target = updateRefs.current[focusUpdateId];
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [activeTab, focusUpdateId, updates]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (supersessionConfirmationOpen) setSupersessionConfirmationOpen(false);
      else if (conversionOpen) setConversionOpen(false);
      else if (closeStatus) setCloseStatus(null);
      else setMoreOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeStatus, conversionOpen, supersessionConfirmationOpen]);

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

  const isClosed = Boolean(request && terminalStatuses.includes(request.status));
  const isConverted = request?.status === "Converted to Quote";
  const recordLocked = isClosed || isConverted;
  const blockerCount = request?.checklistSummary.missingRequired.length ?? 0;

  function replaceRequest(updated: RequestRecord) {
    setRequest(updated);
    setUpdates(updated.updates);
    setUpdatesCursor(null);
    setUpdatesHasMore(false);
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

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const normalized = mentionQuery.toLowerCase();
    return teamMembers
      .filter((member) =>
        member.name.toLowerCase().includes(normalized) ||
        member.email.toLowerCase().includes(normalized)
      )
      .slice(0, 5);
  }, [mentionQuery, teamMembers]);

  function updateComposerBody(value: string) {
    setUpdateBody(value);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
    setMentionQuery(match ? match[1] : null);
    setMentionIndex(0);
  }

  function insertMention(member: RequestAssignee) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(updateBody);
    if (!match) return;
    const start = match.index + (match[0].startsWith(" ") ? 1 : 0);
    setUpdateBody(`${updateBody.slice(0, start)}@${member.name} `);
    setMentionIds((current) => Array.from(new Set([...current, member.id])));
    setMentionQuery(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionSuggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionIndex((current) => (current + 1) % mentionSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertMention(mentionSuggestions[mentionIndex]);
    }
  }

  async function postUpdate(supersessionConfirmed = false) {
    if (!request || !canWriteActivity || !updateBody.trim() || isPostingUpdate) return;
    if (isCurrentStepDraft && !stepAssigneeId) {
      setError("Choose a responsible assignee for the current step.");
      return;
    }
    if (isCurrentStepDraft && request.currentStep && !supersessionConfirmed) {
      setSupersessionConfirmationOpen(true);
      return;
    }
    try {
      setSupersessionConfirmationOpen(false);
      setIsPostingUpdate(true);
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/updates`, {
        method: "POST",
        body: JSON.stringify({
          kind: isCurrentStepDraft ? "step" : "comment",
          body: updateBody.trim(),
          assigneeId: isCurrentStepDraft ? stepAssigneeId : "",
          targetDate: isCurrentStepDraft ? stepTargetDate : "",
          mentionIds
        })
      });
      replaceRequest(data.request);
      setUpdateBody("");
      setMentionIds([]);
      setMentionQuery(null);
      if (isCurrentStepDraft && data.request.currentStep) {
        setUndoAction({ updateId: data.request.currentStep.id, label: "Undo step replacement" });
      }
      setIsCurrentStepDraft(false);
      setStepTargetDate("");
      setToast(isCurrentStepDraft ? "Current step posted." : "Update posted.");
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Unable to post update.");
    } finally {
      setIsPostingUpdate(false);
    }
  }

  async function completeCurrentStep() {
    if (!request?.currentStep || !canWriteActivity) return;
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/updates/${request.currentStep.id}/complete`,
        { method: "POST", body: JSON.stringify({ completed: true }) }
      );
      replaceRequest(data.request);
      setUndoAction({ updateId: request.currentStep.id, label: "Undo completion" });
      setToast("Current step completed.");
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Unable to complete step.");
    }
  }

  async function undoUpdate() {
    if (!request || !undoAction) return;
    try {
      const data = await requestJson<RequestResponse>(
        `/api/requests/${request.id}/updates/${undoAction.updateId}/undo`,
        { method: "POST" }
      );
      replaceRequest(data.request);
      setUndoAction(null);
      setToast("Update change undone.");
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Unable to undo update.");
    }
  }

  async function changeLead(leadId: string) {
    if (!request || !canWriteCrm) return;
    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/lead`, {
        method: "PATCH",
        body: JSON.stringify({ leadId })
      });
      replaceRequest(data.request);
      setToast(leadId ? "Lead updated." : "Lead cleared.");
    } catch (leadError) {
      setError(leadError instanceof Error ? leadError.message : "Unable to update lead.");
    }
  }

  async function addCollaborator(userId: string) {
    if (!request || !canWriteCrm || !userId) return;
    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/collaborators`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      replaceRequest(data.request);
      setToast("Collaborator added.");
    } catch (collaboratorError) {
      setError(collaboratorError instanceof Error ? collaboratorError.message : "Unable to add collaborator.");
    }
  }

  async function removeCollaborator(userId: string) {
    if (!request || !canWriteCrm) return;
    try {
      const data = await requestJson<RequestResponse>(`/api/requests/${request.id}/collaborators/${userId}`, {
        method: "DELETE"
      });
      replaceRequest(data.request);
      setToast("Collaborator removed.");
    } catch (collaboratorError) {
      setError(collaboratorError instanceof Error ? collaboratorError.message : "Unable to remove collaborator.");
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
      const data = await convertRequestToQuote(request.id, {
        createQuote: true
      });
      replaceRequest(data.request);
      setConversionOpen(false);
      setToast(
        data.request.relatedQuoteNumber
          ? `Created ${data.request.relatedQuoteNumber}.`
          : "Request converted."
      );
      if (data.request.relatedQuoteId) {
        router.push(`/quotes/${data.request.relatedQuoteId}`);
      }
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
      setActiveTab("checklist");
      window.setTimeout(() => {
        const firstBlocker =
          document.querySelector<HTMLElement>("[data-request-blocker]") ??
          document.getElementById("request-action-panel");
        firstBlocker?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => firstBlocker?.focus(), 350);
      }, 0);
      return;
    }
    setConversionOpen(true);
  }

  function selectTab(tab: RequestRecordTab) {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: RequestRecordTab) {
    const index = requestRecordTabs.findIndex((item) => item.id === tab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab(requestRecordTabs[(index + 1) % requestRecordTabs.length].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab(
        requestRecordTabs[(index - 1 + requestRecordTabs.length) % requestRecordTabs.length].id
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(requestRecordTabs[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(requestRecordTabs[requestRecordTabs.length - 1].id);
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
                    <span className="record-checklist-meta-row">
                      <em>{item.required ? "Required" : "Optional"}</em>
                      <em>{pending ? "Saving" : item.completed ? "Complete" : "Open"}</em>
                    </span>
                    <RequestChecklistSignature item={item} compact />
                  </span>
                  <ChevronDown size={18} />
                </button>
                {expanded ? (
                  <div className="record-checklist-note">
                    {item.description ? (
                      <p className="record-checklist-expanded-description">
                        {item.description}
                      </p>
                    ) : null}
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

  function renderCurrentStepCard(className = "") {
    const step = request?.currentStep;
    return (
      <section className={`request-current-step-card ${className}`.trim()} id={className.includes("mobile") ? "request-mobile-current-step-card" : "request-current-step-card"}>
        <div className="record-section-heading">
          <div>
            <span>Current step</span>
            <h2>{step ? step.title || step.body : "No current step"}</h2>
          </div>
          {step ? <span className="request-step-status">Open</span> : null}
        </div>
        {step ? (
          <>
            <p>{step.body}</p>
            <div className="request-current-step-meta">
              <span><UserRound size={14} /> {step.assignee?.name || "Unassigned"}</span>
              <span><CalendarClock size={14} /> {step.targetDate ? formatDate(step.targetDate) : "No target date"}</span>
            </div>
            <button
              className="request-step-complete-button"
              type="button"
              onClick={() => void completeCurrentStep()}
              disabled={!canWriteActivity}
            >
              <CheckCircle2 size={16} /> Complete step
            </button>
          </>
        ) : (
          <p className="request-current-step-empty">Use Updates to promote one responsible, dated step when the request needs a clear next move.</p>
        )}
      </section>
    );
  }

  function renderUpdateComposer(idSuffix: string) {
    const textareaId = `request-update-body-${idSuffix}`;
    return (
      <section className={`request-update-composer ${idSuffix === "mobile" ? "request-mobile-update-composer" : ""}`.trim()}>
        <label htmlFor={textareaId}>
          Add an update
          <textarea
            ref={idSuffix === "desktop" ? composerRef : undefined}
            id={textareaId}
            value={updateBody}
            onChange={(event) => updateComposerBody(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Share context, a decision, or what changed…"
            disabled={!canWriteActivity || isPostingUpdate}
            aria-describedby={`${textareaId}-supporting`}
          />
        </label>
        <p id={`${textareaId}-supporting`} className="request-update-supporting-text">
          Updates are immutable. Add a new update when context changes. Type @ to mention an active Pulse user.
        </p>
        {mentionSuggestions.length ? (
          <div className="request-mention-suggestions" role="listbox" aria-label="Mention suggestions">
            {mentionSuggestions.map((member, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                key={member.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(member)}
              >
                <AtSign size={14} />
                <span><strong>{member.name}</strong><small>{member.email}</small></span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="request-update-composer-footer">
          <button
            type="button"
            className={isCurrentStepDraft ? "request-update-chip active" : "request-update-chip"}
            aria-pressed={isCurrentStepDraft}
            onClick={() => setIsCurrentStepDraft((current) => !current)}
            disabled={!canWriteActivity || isClosed || isConverted}
          >
            <CheckCircle2 size={14} /> Set as current step
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => void postUpdate()}
            disabled={!canWriteActivity || !updateBody.trim() || isPostingUpdate}
          >
            <Send size={15} /> {isPostingUpdate ? "Posting…" : "Post update"}
          </button>
        </div>
        {isCurrentStepDraft ? (
          <div className="request-step-fields">
            <label>
              Responsible assignee <span aria-hidden="true">*</span>
              <select value={stepAssigneeId} onChange={(event) => setStepAssigneeId(event.target.value)} disabled={!canWriteActivity}>
                <option value="">Choose a Pulse user</option>
                {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <label>
              Target date <span className="optional-label">Optional</span>
              <input type="date" value={stepTargetDate} onChange={(event) => setStepTargetDate(event.target.value)} disabled={!canWriteActivity} />
            </label>
          </div>
        ) : null}
      </section>
    );
  }

  function renderTeamPanel() {
    const collaboratorIds = new Set(request?.collaborators.map((collaborator) => collaborator.id) ?? []);
    return (
      <section className="request-team-panel" id="request-team-panel">
        <div className="record-section-heading">
          <div><span>Request team</span><h2>Lead & collaborators</h2></div>
          <Users size={17} />
        </div>
        <label>
          Lead
          <select
            value={request?.lead?.id ?? ""}
            onChange={(event) => void changeLead(event.target.value)}
            disabled={!canWriteCrm || isConverted}
          >
            <option value="">Unassigned</option>
            {assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <div className="request-collaborator-list">
          {request?.collaborators.map((collaborator) => (
            <div className="request-collaborator-row" key={collaborator.id}>
              <span><UserRound size={14} />{collaborator.name}</span>
              <button
                type="button"
                onClick={() => void removeCollaborator(collaborator.id)}
                disabled={!canWriteCrm || (request.currentStep?.assignee?.id === collaborator.id && request.currentStep.stepStatus === "open")}
                aria-label={`Remove ${collaborator.name} from request team`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <label>
          Add collaborator
          <select
            value=""
            onChange={(event) => void addCollaborator(event.target.value)}
            disabled={!canWriteCrm || isConverted}
          >
            <option value="">Choose a Pulse user</option>
            {teamMembers.filter((member) => member.id !== request?.lead?.id && !collaboratorIds.has(member.id)).map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
      </section>
    );
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

  if (!request) {
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
            canViewQuotes ? (
              <Link className="record-primary-action" href={request.relatedQuoteId ? `/quotes/${request.relatedQuoteId}` : "/quotes"}>
                <FileText size={16} />
                {request.relatedQuoteNumber || "View quotes"}
              </Link>
            ) : <span className="status-pill">Converted</span>
          ) : (
            <button
              className="record-primary-action"
              type="button"
              onClick={handleQuoteAction}
              disabled={!canWriteCrm || (request.checklistSummary.readyForQuote && !canWriteQuotes)}
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
          <span>Lead / team</span>
          <strong>{request.lead?.name || "Unassigned"}</strong>
          <small><UserRound size={14} /> {request.collaborators.length ? `${request.collaborators.length} collaborator${request.collaborators.length === 1 ? "" : "s"}` : "No collaborators"}</small>
        </div>
        <div>
          <span>Timing</span>
          <strong>{request.dueDate ? `Due ${formatDate(request.dueDate)}` : "No due date"}</strong>
          <small><CalendarClock size={14} /> {request.currentStep?.targetDate ? `Step target ${formatDate(request.currentStep.targetDate)}` : "No step target"}</small>
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

      {renderCurrentStepCard("request-mobile-current-step")}

      <div className="request-record-workspace">
        <section className="request-supporting-panel request-record-primary-panel">
          <div className="request-supporting-tabs request-record-tabs" role="tablist" aria-label="Request sections">
            {requestRecordTabs.map((tab) => (
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
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              >
                {tab.label}
                {tab.id === "checklist" && blockerCount ? (
                  <span>{blockerCount}</span>
                ) : null}
                {tab.id === "files" && request.documents.length ? (
                  <span>{request.documents.length}</span>
                ) : null}
                {tab.id === "updates" && request.unreadMentionCount ? (
                  <span aria-label={`${request.unreadMentionCount} unread mentions`}>{request.unreadMentionCount}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div
            id={`request-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`request-tab-${activeTab}`}
            tabIndex={0}
            className={
              activeTab === "checklist"
                ? "request-supporting-content request-checklist-tab-content"
                : "request-supporting-content"
            }
          >
            {activeTab === "checklist" ? (
              <div className="request-progress-workspace request-progress-tab" id="request-blockers">
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
                        <div><span>{instance.matchType === "CORE" ? "Core" : instance.matchType === "TRADE" ? "Trade" : "Request type"}</span><h3>{instance.templateName}</h3>{instance.matchValue ? <small>{instance.matchValue}</small> : null}</div>
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
              </div>
            ) : null}

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

            {activeTab === "updates" ? (
              <div className="request-updates-panel">
                {renderUpdateComposer("mobile")}
                <div className="request-updates-toolbar" role="tablist" aria-label="Update filters">
                  {requestUpdateFilters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      role="tab"
                      aria-selected={updateFilter === filter}
                      onClick={() => setUpdateFilter(filter)}
                    >
                      {filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1) + (filter === "system" ? "" : "s")}
                    </button>
                  ))}
                </div>
                {updates.length ? (
                  <ol className="request-update-list">
                    {updates.map((update) => (
                      <li
                        key={update.id}
                        id={`request-update-${update.id}`}
                        ref={(element) => { updateRefs.current[update.id] = element; }}
                        className={`request-update-item kind-${update.kind}${update.stepStatus ? ` status-${update.stepStatus}` : ""}`}
                        tabIndex={-1}
                        data-update-id={update.id}
                      >
                        <div className="request-update-item-marker" aria-hidden="true">
                          {update.kind === "step" ? <CheckCircle2 size={16} /> : update.kind === "comment" ? <AtSign size={16} /> : <CalendarClock size={16} />}
                        </div>
                        <div className="request-update-item-content">
                          <div className="request-update-item-headline">
                            <strong>{update.title}</strong>
                            <span className="request-update-item-status">
                              {update.kind === "step" ? update.stepStatus : update.kind === "system" ? "System" : "Comment"}
                            </span>
                          </div>
                          {update.body ? <p>{update.body}</p> : null}
                          <div className="request-update-item-meta">
                            <span>{update.author.name}</span>
                            <time dateTime={update.createdAt}>{formatWorkspaceDate(update.createdAt, true)}</time>
                            {update.kind === "step" && update.assignee ? <span>Assigned to {update.assignee.name}</span> : null}
                            {update.kind === "step" && update.targetDate ? <span>Target {formatDate(update.targetDate)}</span> : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="activity-empty-state"><AtSign size={18} /><span>No updates match this filter yet.</span></div>
                )}
                {updatesHasMore ? (
                  <button className="request-updates-load-more" type="button" onClick={() => void loadUpdates(updateFilter, updatesCursor)} disabled={isLoadingUpdates}>
                    {isLoadingUpdates ? "Loading…" : "Load older updates"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="request-action-rail">
          {renderCurrentStepCard()}
          {renderUpdateComposer("desktop")}
          {renderTeamPanel()}
        </aside>
      </div>

      <div className="request-mobile-action-bar">
        <Link href={editHref}><Edit3 size={17} /> Edit</Link>
        {!isConverted && !isClosed ? (
          <button type="button" onClick={handleQuoteAction} disabled={!canWriteCrm || (request.checklistSummary.readyForQuote && !canWriteQuotes)}>
            <Send size={17} />
            {request.checklistSummary.readyForQuote ? "Create quote" : "Resolve blockers"}
          </button>
        ) : isClosed ? (
          <button type="button" onClick={() => void reopenRequest()}>
            <RotateCcw size={17} />
            Reopen
          </button>
        ) : canViewQuotes ? (
          <Link href={request.relatedQuoteId ? `/quotes/${request.relatedQuoteId}` : "/quotes"}><FileText size={17} /> View quote</Link>
        ) : <span>Converted</span>}
      </div>

      {toast ? (
        <div className="lead-toast" role="status" aria-live="polite">{toast}</div>
      ) : null}

      {undoAction ? (
        <ViewportPortal>
          <div className="request-undo-snackbar" role="status" aria-live="polite">
            <span>{undoAction.label}</span>
            <button type="button" onClick={() => void undoUpdate()}>Undo</button>
          </div>
        </ViewportPortal>
      ) : null}

      {supersessionConfirmationOpen && request.currentStep ? (
        <ViewportPortal>
          <div className="record-dialog-backdrop">
            <section className="record-dialog" role="alertdialog" aria-modal="true" aria-labelledby="replace-current-step-title" aria-describedby="replace-current-step-description">
            <div className="record-dialog-heading">
              <span><AlertTriangle size={19} /></span>
              <div>
                <h2 id="replace-current-step-title">Replace the current step?</h2>
                <p id="replace-current-step-description">This update will supersede the open step below. It will not be posted as a comment.</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={() => setSupersessionConfirmationOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="record-conversion-summary request-supersession-summary">
              <strong>{request.currentStep.title || request.currentStep.body || "Current step"}</strong>
              <span>
                Assigned to {request.currentStep.assignee?.name || "Unassigned"}
                {request.currentStep.targetDate ? ` · Target ${formatDate(request.currentStep.targetDate)}` : ""}
              </span>
            </div>
            <div className="record-dialog-actions">
              <button autoFocus type="button" onClick={() => setSupersessionConfirmationOpen(false)}>Keep current step</button>
              <button
                className="danger"
                type="button"
                onClick={() => void postUpdate(true)}
                disabled={isPostingUpdate}
              >
                {isPostingUpdate ? "Replacing..." : "Replace current step"}
              </button>
            </div>
            </section>
          </div>
        </ViewportPortal>
      ) : null}

      {closeStatus ? (
        <ViewportPortal>
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
                placeholder="Add a concise reason for the request history..."
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
        </ViewportPortal>
      ) : null}

      {conversionOpen ? (
        <ViewportPortal>
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
              <p>The checklist and Updates remain attached to this request.</p>
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
        </ViewportPortal>
      ) : null}
    </section>
  );
}
