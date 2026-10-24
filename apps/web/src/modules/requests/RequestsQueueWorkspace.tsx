"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, MoreHorizontal, Plus, RotateCcw, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { ListFeedback, ListToolbar, ListTable } from "@/components/lists/ListControls";
import { useDashboardList } from "@/lib/useDashboardList";
import { lifecycleDefinition } from "@/lib/lifecycleLists";
import { filterCount } from "@/lib/listState";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ViewportPortal } from "@/components/ViewportPortal";
import { formatWorkspaceDate } from "@/lib/formatting";
import { useResponsiveMode } from "@/lib/responsive";
import { type RequestAssignee, type RequestPriority, type RequestRecord, type RequestStatus } from "@pulse/contracts/requests";

type RequestsQueueWorkspaceProps = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
  currentUser?: { id: string; name: string } | null;
  isLoading: boolean;
  loadError: string;
  canWrite: boolean;
  onCreateRequest: () => void;
  onOwnerChange: (request: RequestRecord, assignedToId: string) => Promise<void>;
  onStatusChange: (
    request: RequestRecord,
    status: RequestStatus,
    reason?: string
  ) => Promise<void>;
};

const closedStatuses: RequestStatus[] = [
  "Converted to Quote",
  "No Bid",
  "Cancelled",
  "Duplicate"
];
const terminalStatuses: RequestStatus[] = ["No Bid", "Cancelled", "Duplicate"];
const today = new Date().toISOString().slice(0, 10);

function isOpenRequest(request: RequestRecord) {
  return !closedStatuses.includes(request.status);
}

function needsAttention(request: RequestRecord) {
  if (!isOpenRequest(request)) {
    return false;
  }

  return (
    request.priority === "Urgent" ||
    Boolean(request.dueDate && request.dueDate < today) ||
    Boolean(request.currentStep?.targetDate && request.currentStep.targetDate < today) ||
    request.status === "Missing Info" ||
    request.status === "Site Visit Required" ||
    request.checklistSummary.missingRequired.length > 0 ||
    (request.siteVisitNeeded && !request.siteVisitCompleted)
  );
}

function formatShortDate(value: string) {
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
  if (priority === "Urgent") {
    return "danger";
  }

  if (priority === "High") {
    return "warning";
  }

  return "neutral";
}

export function RequestsQueueWorkspace({
  requests,
  assignees,
  currentUser,
  isLoading,
  loadError,
  canWrite,
  onCreateRequest,
  onOwnerChange,
  onStatusChange
}: RequestsQueueWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [quickUpdateId, setQuickUpdateId] = useState("");
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [statusMenuId, setStatusMenuId] = useState("");
  const [terminalReason, setTerminalReason] = useState("");
  const [pendingTerminal, setPendingTerminal] = useState<{
    requestId: string;
    status: RequestStatus;
    reopen?: boolean;
  } | null>(null);

  const definition = useMemo(() => {
    const definition = lifecycleDefinition("requests", requests);
  definition.views!.push(
    { key: "mentioned", label: "Mentioned", statuses: definition.views![0].statuses, matches: request => isOpenRequest(request) && request.unreadMentionCount > 0 },
    { key: "unassigned", label: "Unassigned", statuses: definition.views![0].statuses, matches: request => isOpenRequest(request) && !request.assignedToId },
    { key: "attention", label: "Needs attention", statuses: definition.views![0].statuses, matches: needsAttention }
  );
    return definition;
  }, [requests]);
  const list = useDashboardList(definition, requests);
  const { view: activeView, q: searchTerm } = list.state;
  const setView = list.setView;
  const clearSearchAndFilters = list.reset;
  const activeFilters = Array.from({ length: filterCount(list.state) });

  useEffect(() => {
    function closeOverlay(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (pendingTerminal) {
        setPendingTerminal(null);
        setTerminalReason("");
      } else if (quickUpdateId) {
        setQuickUpdateId("");

      } else {
        setStatusMenuId("");
      }
    }

    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [pendingTerminal, quickUpdateId]);

  async function runUpdate(requestId: string, update: () => Promise<void>) {
    setUpdatingIds((current) => [...current, requestId]);
    try {
      await update();
    } finally {
      setUpdatingIds((current) => current.filter((id) => id !== requestId));
    }
  }

  function beginTerminalChange(request: RequestRecord, status: RequestStatus) {
    setStatusMenuId("");
    setPendingTerminal({ requestId: request.id, status });
    setTerminalReason("");
  }

  function beginReopen(request: RequestRecord) {
    setStatusMenuId("");
    setPendingTerminal({
      requestId: request.id,
      status: "Reviewing",
      reopen: true
    });
    setTerminalReason("");
  }

  const filteredRequests = list.rows;
  const quickUpdateRequest =
    requests.find((request) => request.id === quickUpdateId) ?? null;
  const terminalRequest =
    requests.find((request) => request.id === pendingTerminal?.requestId) ?? null;
  const viewOptions = definition.views!.map(view => ({ ...view, count: requests.filter(request => view.matches(request, list.userId)).length }));
  const activeViewLabel = viewOptions.find(view => view.key === activeView)?.label ?? "All open";
  const queueReturnTo = `${pathname}${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const requestHref = (requestId: string) =>
    `/requests/${requestId}?returnTo=${encodeURIComponent(queueReturnTo)}`;

  return (
    <section className="requests-queue dashboard-list">
      <header className="requests-queue-heading">
        <div>
          <nav className="breadcrumb requests-queue-breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link>
            <span>/</span>
            <span>Requests</span>
          </nav>
          <h1>{activeViewLabel}</h1>
          <p className="requests-queue-summary">
            <strong>Sales intake</strong>
            <span aria-hidden="true"> · </span>
            Focus on ownership, timing, blockers, and the next useful action.
          </p>
        </div>
        <button
          className="primary-button compact"
          type="button"
          onClick={onCreateRequest}
          disabled={!canWrite}
        >
          <Plus size={17} />
          New request
        </button>
      </header>

      <nav className="requests-queue-views" aria-label="Request queue views">
        {viewOptions.map((view) => (
          <button
            key={view.key}
            type="button"
            className={activeView === view.key ? "active" : ""}
            aria-current={activeView === view.key ? "page" : undefined}
            onClick={() => setView(view.key)}
          >
            <span>{view.label}</span>
            <strong>{view.count}</strong>
          </button>
        ))}
      </nav>

      <div className="requests-queue-surface">
        <ListToolbar list={list} count={filteredRequests.length} />

        <ListFeedback error={loadError} onRetry={() => window.location.reload()} />

        <div className="requests-queue-desktop">
          <ListTable className="requests-queue-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Client / site</th>
                <th>Next step</th>
                <th>Status / priority</th>
                <th>Owner</th>
                <th>Timing</th>
                <th>Readiness</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }, (_, index) => (
                    <tr className="queue-skeleton-row" key={index}>
                      {Array.from({ length: 7 }, (__, cellIndex) => (
                        <td key={cellIndex}><span /></td>
                      ))}
                    </tr>
                  ))
                : filteredRequests.map((request) => {
                    const updating = updatingIds.includes(request.id);
                    const missingRequired =
                      request.checklistSummary.missingRequired.length;
                    const step = request.currentStep;
                    const stepTarget = step?.targetDate || "";
                    const stepOverdue = Boolean(stepTarget && stepTarget < today);
                    const timingAttention =
                      Boolean(request.dueDate && request.dueDate < today) || stepOverdue;

                    return (
                      <tr
                        key={request.id}
                        className={timingAttention ? "needs-attention" : ""}
                        onClick={() => router.push(requestHref(request.id))}
                      >
                        <td>
                          <Link
                            className="queue-request-link"
                            href={requestHref(request.id)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <strong>{request.title}</strong>
                            <span>{request.requestNumber}</span>
                          </Link>
                          <span className="queue-trade-chips">{request.serviceCategories.map((category) => <span className="queue-category" key={category}>{category}</span>)}</span>
                        </td>
                        <td>
                          <strong>{request.companyName || "New prospect"}</strong>
                          <span>
                            {request.siteName ||
                              request.siteAddress ||
                              request.contactName ||
                              "Site not captured"}
                          </span>
                        </td>
                        <td className={`queue-next-action${stepOverdue ? " overdue" : ""}`}>
                          <Link
                            href={`${requestHref(request.id)}&tab=updates${step?.id ? `&update=${encodeURIComponent(step.id)}` : ""}`}
                            onClick={(event) => event.stopPropagation()}
                            className="queue-next-step-link"
                          >
                            <strong>{step ? (step.title || step.body) : "Suggested"}</strong>
                            <span>
                              {step
                                ? `${step.assignee?.name || "Unassigned"}${stepTarget ? ` · ${formatShortDate(stepTarget)}` : ""}`
                                : (request.checklistSummary.missingRequired[0] || "Set a current step")}
                            </span>
                          </Link>
                        </td>
                        <td className="queue-owner-team">
                          <div className="queue-status-action">
                            <span
                              className={`queue-status tone-${statusTone(
                                request.status
                              )}`}
                            >
                              {request.status}
                            </span>
                            {canWrite && request.status !== "Converted to Quote" ? (
                              <button
                                type="button"
                                aria-label={`Status actions for ${request.requestNumber}`}
                                aria-expanded={statusMenuId === request.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setStatusMenuId((current) =>
                                    current === request.id ? "" : request.id
                                  );
                                }}
                              >
                                <MoreHorizontal size={15} />
                              </button>
                            ) : null}
                            {statusMenuId === request.id ? (
                              <div
                                className="queue-status-menu"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {terminalStatuses.includes(request.status) ? (
                                  <button
                                    type="button"
                                    onClick={() => beginReopen(request)}
                                  >
                                    <RotateCcw size={14} />
                                    Reopen request
                                  </button>
                                ) : (
                                  terminalStatuses.map((status) => (
                                    <button
                                      type="button"
                                      key={status}
                                      onClick={() =>
                                        beginTerminalChange(request, status)
                                      }
                                    >
                                      Move to {status}
                                    </button>
                                  ))
                                )}
                              </div>
                            ) : null}
                          </div>
                          <span
                            className={`queue-priority tone-${priorityTone(
                              request.priority
                            )}`}
                          >
                            {request.priority}
                          </span>
                        </td>
                        <td>
                          {canWrite ? (
                            <select
                              className="queue-owner-select"
                              value={request.assignedToId ?? ""}
                              disabled={updating}
                              aria-label={`Owner for ${request.requestNumber}`}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const assignedToId = event.target.value;
                                void runUpdate(request.id, () =>
                                  onOwnerChange(request, assignedToId)
                                );
                              }}
                            >
                              <option value="">Unassigned</option>
                              {assignees.map((assignee) => (
                                <option key={assignee.id} value={assignee.id}>
                                  {assignee.name}
                                </option>
                              ))}
                            </select>
                          ) : <strong>{request.lead?.name || request.assignedToName || "Unassigned"}</strong>}
                          {request.collaborators.length ? <span>{request.collaborators.length} collaborator{request.collaborators.length === 1 ? "" : "s"}</span> : null}
                        </td>
                        <td className={timingAttention ? "queue-timing attention" : "queue-timing"}>
                          <strong>
                            <CalendarClock size={15} />
                            {request.dueDate
                              ? `Due ${formatShortDate(request.dueDate)}`
                              : "No due date"}
                          </strong>
                          <span>Overall deadline only</span>
                        </td>
                        <td>
                          <div className="queue-readiness">
                            <div>
                              <strong>
                                {request.checklistSummary.requiredCompleted}/
                                {request.checklistSummary.requiredTotal}
                              </strong>
                              <span>
                                {missingRequired
                                  ? `${missingRequired} missing`
                                  : "Required complete"}
                              </span>
                            </div>
                            <span
                              className="queue-progress-track"
                              role="progressbar"
                              aria-label={`${request.requestNumber} required checklist progress`}
                              aria-valuemin={0}
                              aria-valuemax={
                                request.checklistSummary.requiredTotal || 1
                              }
                              aria-valuenow={
                                request.checklistSummary.requiredCompleted
                              }
                            >
                              <i
                                style={{
                                  width: `${
                                    request.checklistSummary.requiredTotal
                                      ? Math.round(
                                          (request.checklistSummary
                                            .requiredCompleted /
                                            request.checklistSummary
                                              .requiredTotal) *
                                            100
                                        )
                                      : 0
                                  }%`
                                }}
                              />
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </ListTable>
        </div>

        <div className="requests-queue-mobile">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <div className="queue-mobile-skeleton" key={index} />
              ))
              : filteredRequests.map((request) => {
                const missingRequired =
                  request.checklistSummary.missingRequired.length;
                const step = request.currentStep;
                const stepTarget = step?.targetDate || "";
                const timingAttention =
                  Boolean(request.dueDate && request.dueDate < today) ||
                  Boolean(stepTarget && stepTarget < today);

                return (
                  <article
                    className={
                      timingAttention
                        ? "requests-queue-mobile-card needs-attention"
                        : "requests-queue-mobile-card"
                    }
                    key={request.id}
                  >
                    <div className="queue-mobile-card-main">
                      <Link className="queue-mobile-card-summary" href={requestHref(request.id)}>
                        <div className="queue-mobile-card-heading">
                          <span>{request.requestNumber}</span>
                          <span
                            className={`queue-status tone-${statusTone(
                              request.status
                            )}`}
                          >
                            {request.status}
                          </span>
                        </div>
                        <h3>{request.title}</h3>
                        <p>{request.companyName || "New prospect"}</p>
                        <span className="queue-mobile-site">
                          {request.siteName ||
                            request.siteAddress ||
                            "Site not captured"}
                        </span>
                      </Link>

                      <Link
                        className={`queue-mobile-action${timingAttention && stepTarget < today ? " overdue" : ""}`}
                        href={`${requestHref(request.id)}&tab=updates${step?.id ? `&update=${encodeURIComponent(step.id)}` : ""}`}
                      >
                        <span>{step ? "Next step" : "Suggested"}</span>
                        <strong>{step ? (step.title || step.body) : (request.checklistSummary.missingRequired[0] || "Set a current step")}</strong>
                        <small>{step ? `${step.assignee?.name || "Unassigned"}${stepTarget ? ` · ${formatShortDate(stepTarget)}` : ""}` : "Checklist recommendation"}</small>
                      </Link>

                      <Link className="queue-mobile-footer" href={requestHref(request.id)}>
                        <div className={timingAttention ? "attention" : ""}>
                          <CalendarClock size={15} />
                          <span>
                            {request.dueDate
                              ? `Due ${formatShortDate(request.dueDate)}`
                              : "No due date"}
                          </span>
                        </div>
                        <div>
                          {missingRequired ? (
                            <AlertTriangle size={15} />
                          ) : (
                            <CheckCircle2 size={15} />
                          )}
                          <span>
                            {missingRequired
                              ? `${missingRequired} required missing`
                              : "Required complete"}
                          </span>
                        </div>
                        <ChevronRight size={18} />
                      </Link>
                    </div>
                    <button
                      className="queue-mobile-quick-update"
                      type="button"
                      onClick={() => setQuickUpdateId(request.id)}
                      disabled={!canWrite}
                    >
                      <UserRound size={16} />
                      {request.assignedToName || "Unassigned"}
                      <span>Quick update</span>
                    </button>
                  </article>
                );
              })}
        </div>

        {!isLoading && !loadError && filteredRequests.length === 0 ? (
          <div className="requests-queue-state">
            <Search size={21} />
            <div>
              <strong>No requests match this view</strong>
              <span>Try another saved view, adjust filters, or clear the search.</span>
            </div>
            {searchTerm || activeFilters.length ? (
              <button
                type="button"
                onClick={clearSearchAndFilters}
              >
                Clear search and filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {quickUpdateRequest ? (
        <ViewportPortal>
          <div
            className="queue-sheet-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setQuickUpdateId("");
            }}
          >
            <section
              className="queue-quick-update-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-update-title"
            >
            <div className="queue-sheet-heading">
              <div>
                <span>{quickUpdateRequest.requestNumber}</span>
                <h2 id="quick-update-title">Quick update</h2>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Close quick update"
                onClick={() => setQuickUpdateId("")}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Owner
              <select
                value={quickUpdateRequest.assignedToId ?? ""}
                disabled={updatingIds.includes(quickUpdateRequest.id)}
                onChange={(event) => {
                  const assignedToId = event.target.value;
                  void runUpdate(quickUpdateRequest.id, () =>
                    onOwnerChange(quickUpdateRequest, assignedToId)
                  );
                }}
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
                ))}
              </select>
            </label>
            <div className="queue-mobile-status-actions">
              <span>Status</span>
              <strong>{quickUpdateRequest.status}</strong>
              {quickUpdateRequest.status !== "Converted to Quote" ? (
                terminalStatuses.includes(quickUpdateRequest.status) ? (
                  <button
                    type="button"
                    onClick={() => beginReopen(quickUpdateRequest)}
                  >
                    <RotateCcw size={15} />
                    Reopen request
                  </button>
                ) : (
                  <div>
                    {terminalStatuses.map((status) => (
                      <button
                        type="button"
                        key={status}
                        onClick={() => beginTerminalChange(quickUpdateRequest, status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )
              ) : null}
            </div>
            <Link href={requestHref(quickUpdateRequest.id)}>
              Open full request
              <ChevronRight size={18} />
            </Link>
            </section>
          </div>
        </ViewportPortal>
      ) : null}

      {pendingTerminal && terminalRequest ? (
        <ViewportPortal>
          <div className="queue-confirm-backdrop">
            <section
              className="queue-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="terminal-status-title"
              aria-describedby="terminal-status-description"
            >
            <span className="queue-confirm-icon"><AlertTriangle size={20} /></span>
            <h2 id="terminal-status-title">
              {pendingTerminal.reopen
                ? "Reopen this request?"
                : `Move request to ${pendingTerminal.status}?`}
            </h2>
            <p id="terminal-status-description">
              {pendingTerminal.reopen
                ? `${terminalRequest.requestNumber} will return to the active status derived from its current intake.`
                : `This closes ${terminalRequest.requestNumber} and removes it from active work views.`}
            </p>
            {!pendingTerminal.reopen ? (
              <label className="queue-terminal-reason">
                Reason
                <textarea
                  autoFocus
                  value={terminalReason}
                  onChange={(event) => setTerminalReason(event.target.value)}
                  placeholder="Add a concise reason for the activity history..."
                />
              </label>
            ) : null}
            <div>
              <button
                type="button"
                autoFocus={Boolean(pendingTerminal.reopen)}
                onClick={() => {
                  setPendingTerminal(null);
                  setTerminalReason("");
                }}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  const status = pendingTerminal.status;
                  const reason = terminalReason.trim();
                  setPendingTerminal(null);
                  setTerminalReason("");
                  void runUpdate(terminalRequest.id, () =>
                    onStatusChange(terminalRequest, status, reason)
                  );
                }}
                disabled={!pendingTerminal.reopen && !terminalReason.trim()}
              >
                {pendingTerminal.reopen
                  ? "Reopen request"
                  : `Confirm ${pendingTerminal.status}`}
              </button>
            </div>
            </section>
          </div>
        </ViewportPortal>
      ) : null}
    </section>
  );
}
