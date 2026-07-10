"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  LayoutList,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatWorkspaceDate } from "@/lib/formatting";
import {
  requestPriorities,
  requestSources,
  requestStatuses,
  serviceCategories,
  type RequestAssignee,
  type RequestPriority,
  type RequestRecord,
  type RequestSource,
  type RequestStatus,
  type ServiceCategory
} from "@pulse/contracts/requests";

type QueueView = "my" | "open" | "unassigned" | "attention" | "closed";
type QueueSort = "activity" | "due" | "priority" | "request";
type QueueDensity = "balanced" | "spacious";

type QueueFilterState = {
  status: "All" | RequestStatus;
  priority: "All" | RequestPriority;
  owner: string;
  category: "All" | ServiceCategory;
  source: "All" | RequestSource;
};

type RequestsQueueWorkspaceProps = {
  requests: RequestRecord[];
  assignees: RequestAssignee[];
  currentUser?: { id: string; name: string } | null;
  isLoading: boolean;
  loadError: string;
  canWrite: boolean;
  getNextAction: (request: RequestRecord) => string;
  onCreateRequest: () => void;
  onOwnerChange: (request: RequestRecord, assignedToId: string) => Promise<void>;
  onStatusChange: (
    request: RequestRecord,
    status: RequestStatus,
    reason?: string
  ) => Promise<void>;
};

const densityStorageKey = "pulse.requests.density";
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
    Boolean(request.nextFollowUpAt && request.nextFollowUpAt <= today) ||
    request.status === "Missing Info" ||
    request.status === "Site Visit Required" ||
    request.checklistSummary.missingRequired.length > 0 ||
    (request.siteVisitNeeded && !request.siteVisitCompleted)
  );
}

function activityTimestamp(request: RequestRecord) {
  return Date.parse(request.lastActivityAt || request.updatedAt || request.createdAt) || 0;
}

function dueTimestamp(request: RequestRecord) {
  return request.dueDate ? Date.parse(`${request.dueDate}T00:00:00`) : Number.MAX_SAFE_INTEGER;
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

function requestMatchesUser(
  request: RequestRecord,
  currentUser?: { id: string; name: string } | null
) {
  return Boolean(
    currentUser &&
      (request.assignedToId === currentUser.id ||
        request.assignedToName === currentUser.name)
  );
}

function parseView(value: string | null): QueueView {
  return ["my", "open", "unassigned", "attention", "closed"].includes(value ?? "")
    ? (value as QueueView)
    : "my";
}

function parseSort(value: string | null): QueueSort {
  return ["activity", "due", "priority", "request"].includes(value ?? "")
    ? (value as QueueSort)
    : "activity";
}

function filterChipLabel(
  key: keyof QueueFilterState,
  value: string,
  assignees: RequestAssignee[]
) {
  if (key === "owner") {
    if (value === "Unassigned") return "Owner: Unassigned";
    return `Owner: ${assignees.find((assignee) => assignee.id === value)?.name ?? value}`;
  }

  const labels: Record<Exclude<keyof QueueFilterState, "owner">, string> = {
    status: "Status",
    priority: "Priority",
    category: "Category",
    source: "Source"
  };

  return `${labels[key]}: ${value}`;
}

export function RequestsQueueWorkspace({
  requests,
  assignees,
  currentUser,
  isLoading,
  loadError,
  canWrite,
  getNextAction,
  onCreateRequest,
  onOwnerChange,
  onStatusChange
}: RequestsQueueWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = useState<QueueDensity>("balanced");
  const [quickUpdateId, setQuickUpdateId] = useState("");
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [statusMenuId, setStatusMenuId] = useState("");
  const [terminalReason, setTerminalReason] = useState("");
  const [pendingTerminal, setPendingTerminal] = useState<{
    requestId: string;
    status: RequestStatus;
    reopen?: boolean;
  } | null>(null);

  const activeView = parseView(searchParams.get("view"));
  const searchTerm = searchParams.get("q") ?? "";
  const sort = parseSort(searchParams.get("sort"));
  const filters: QueueFilterState = {
    status: (searchParams.get("status") as RequestStatus | null) ?? "All",
    priority: (searchParams.get("priority") as RequestPriority | null) ?? "All",
    owner: searchParams.get("owner") ?? "All",
    category: (searchParams.get("category") as ServiceCategory | null) ?? "All",
    source: (searchParams.get("source") as RequestSource | null) ?? "All"
  };

  useEffect(() => {
    const storedDensity = window.localStorage.getItem(densityStorageKey);
    if (storedDensity === "balanced" || storedDensity === "spacious") {
      setDensity(storedDensity);
    }
  }, []);

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
      } else if (filtersOpen) {
        setFiltersOpen(false);
      } else {
        setStatusMenuId("");
      }
    }

    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [filtersOpen, pendingTerminal, quickUpdateId]);

  function updateQuery(key: string, value: string, defaultValue?: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === defaultValue) {
      next.delete(key);
    } else {
      next.set(key, value);
    }

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setQueueDensity(value: QueueDensity) {
    setDensity(value);
    window.localStorage.setItem(densityStorageKey, value);
  }

  function setView(view: QueueView) {
    updateQuery("view", view, "my");
  }

  function setFilter<K extends keyof QueueFilterState>(
    key: K,
    value: QueueFilterState[K]
  ) {
    updateQuery(key, value, "All");
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams.toString());
    ["status", "priority", "owner", "category", "source"].forEach((key) =>
      next.delete(key)
    );
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearSearchAndFilters() {
    const next = new URLSearchParams(searchParams.toString());
    ["q", "status", "priority", "owner", "category", "source"].forEach((key) =>
      next.delete(key)
    );
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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

  const viewCounts = useMemo(
    () => ({
      my: requests.filter(
        (request) => isOpenRequest(request) && requestMatchesUser(request, currentUser)
      ).length,
      open: requests.filter(isOpenRequest).length,
      unassigned: requests.filter(
        (request) => isOpenRequest(request) && !request.assignedToId
      ).length,
      attention: requests.filter(needsAttention).length,
      closed: requests.filter((request) => !isOpenRequest(request)).length
    }),
    [currentUser, requests]
  );

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const priorityRank: Record<RequestPriority, number> = {
      Low: 0,
      Normal: 1,
      High: 2,
      Urgent: 3
    };

    return requests
      .filter((request) => {
        const matchesView =
          activeView === "my"
            ? isOpenRequest(request) && requestMatchesUser(request, currentUser)
            : activeView === "open"
              ? isOpenRequest(request)
              : activeView === "unassigned"
                ? isOpenRequest(request) && !request.assignedToId
                : activeView === "attention"
                  ? needsAttention(request)
                  : !isOpenRequest(request);
        const matchesSearch =
          !normalizedSearch ||
          [
            request.requestNumber,
            request.title,
            request.companyName,
            request.contactName,
            request.siteName,
            request.siteAddress,
            ...request.serviceCategories,
            request.nextAction
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

        return (
          matchesView &&
          matchesSearch &&
          (filters.status === "All" || request.status === filters.status) &&
          (filters.priority === "All" || request.priority === filters.priority) &&
          (filters.owner === "All" ||
            (filters.owner === "Unassigned"
              ? !request.assignedToId
              : request.assignedToId === filters.owner)) &&
          (filters.category === "All" ||
            request.serviceCategories.includes(filters.category)) &&
          (filters.source === "All" || request.source === filters.source)
        );
      })
      .sort((left, right) => {
        if (sort === "due") {
          return dueTimestamp(left) - dueTimestamp(right);
        }

        if (sort === "priority") {
          return priorityRank[right.priority] - priorityRank[left.priority];
        }

        if (sort === "request") {
          return right.requestNumber.localeCompare(left.requestNumber, undefined, {
            numeric: true
          });
        }

        return activityTimestamp(right) - activityTimestamp(left);
      });
  }, [activeView, currentUser, filters, requests, searchTerm, sort]);

  const activeFilters = (
    Object.entries(filters) as [keyof QueueFilterState, string][]
  ).filter(([, value]) => value !== "All");
  const quickUpdateRequest =
    requests.find((request) => request.id === quickUpdateId) ?? null;
  const terminalRequest =
    requests.find((request) => request.id === pendingTerminal?.requestId) ?? null;
  const viewOptions: { key: QueueView; label: string; count: number }[] = [
    { key: "my", label: "My work", count: viewCounts.my },
    { key: "open", label: "All open", count: viewCounts.open },
    { key: "unassigned", label: "Unassigned", count: viewCounts.unassigned },
    { key: "attention", label: "Needs attention", count: viewCounts.attention },
    { key: "closed", label: "Closed", count: viewCounts.closed }
  ];
  const activeViewLabel =
    viewOptions.find((view) => view.key === activeView)?.label ?? "My work";
  const queueReturnTo = `${pathname}${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const requestHref = (requestId: string) =>
    `/requests/${requestId}?returnTo=${encodeURIComponent(queueReturnTo)}`;

  return (
    <section className={`requests-queue requests-queue-${density}`}>
      <header className="requests-queue-heading">
        <div>
          <nav className="breadcrumb requests-queue-breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link>
            <span>/</span>
            <span>Requests</span>
          </nav>
          <h2>{activeViewLabel}</h2>
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
        <div className="requests-queue-toolbar">
          <label className="requests-queue-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search requests</span>
            <input
              type="search"
              placeholder="Search request, client, site, or category"
              value={searchTerm}
              onChange={(event) => updateQuery("q", event.target.value)}
            />
          </label>

          <div className="requests-queue-tools">
            <button
              className={activeFilters.length ? "queue-tool active" : "queue-tool"}
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={17} />
              Filters
              {activeFilters.length ? <strong>{activeFilters.length}</strong> : null}
            </button>

            <label className="queue-sort-control">
              <ArrowUpDown size={16} aria-hidden="true" />
              <span className="sr-only">Sort requests</span>
              <select
                value={sort}
                onChange={(event) =>
                  updateQuery("sort", event.target.value, "activity")
                }
              >
                <option value="activity">Newest activity</option>
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
                <option value="request">Request number</option>
              </select>
            </label>

            <div className="queue-density-control" aria-label="Queue density">
              <button
                type="button"
                aria-label="Balanced density"
                aria-pressed={density === "balanced"}
                onClick={() => setQueueDensity("balanced")}
              >
                <Rows3 size={17} />
              </button>
              <button
                type="button"
                aria-label="Spacious density"
                aria-pressed={density === "spacious"}
                onClick={() => setQueueDensity("spacious")}
              >
                <LayoutList size={17} />
              </button>
            </div>
          </div>
        </div>

        {filtersOpen ? (
          <section className="requests-filter-panel" aria-label="Request filters">
            <div className="requests-filter-heading">
              <div>
                <strong>Filter the queue</strong>
                <span>Combine filters to narrow this saved view.</span>
              </div>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="requests-filter-grid">
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(event) =>
                    setFilter("status", event.target.value as QueueFilterState["status"])
                  }
                >
                  <option value="All">All statuses</option>
                  {requestStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={filters.priority}
                  onChange={(event) =>
                    setFilter(
                      "priority",
                      event.target.value as QueueFilterState["priority"]
                    )
                  }
                >
                  <option value="All">All priorities</option>
                  {requestPriorities.map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  value={filters.owner}
                  onChange={(event) => setFilter("owner", event.target.value)}
                >
                  <option value="All">All owners</option>
                  <option value="Unassigned">Unassigned</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={filters.category}
                  onChange={(event) =>
                    setFilter(
                      "category",
                      event.target.value as QueueFilterState["category"]
                    )
                  }
                >
                  <option value="All">All categories</option>
                  {serviceCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  value={filters.source}
                  onChange={(event) =>
                    setFilter("source", event.target.value as QueueFilterState["source"])
                  }
                >
                  <option value="All">All sources</option>
                  {requestSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="requests-filter-footer">
              <span>{filteredRequests.length} matching requests</span>
              <button type="button" onClick={clearFilters} disabled={!activeFilters.length}>
                Clear all
              </button>
            </div>
          </section>
        ) : null}

        {activeFilters.length ? (
          <div className="requests-active-filters" aria-label="Active filters">
            {activeFilters.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key, "All")}
                aria-label={`Remove ${filterChipLabel(key, value, assignees)} filter`}
              >
                {filterChipLabel(key, value, assignees)}
                <X size={14} />
              </button>
            ))}
            <button className="clear" type="button" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        ) : null}

        <div className="requests-queue-meta">
          <span>
            <strong>{filteredRequests.length}</strong>{" "}
            {filteredRequests.length === 1 ? "request" : "requests"}
          </span>
          <span>Sorted by {sort === "activity" ? "newest activity" : sort}</span>
        </div>

        {loadError ? (
          <div className="requests-queue-state error">
            <AlertTriangle size={20} />
            <div>
              <strong>Unable to load requests</strong>
              <span>{loadError}</span>
            </div>
          </div>
        ) : null}

        <div className="requests-queue-desktop">
          <table className="requests-queue-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Client / site</th>
                <th>Next action</th>
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
                    const timingAttention =
                      Boolean(request.dueDate && request.dueDate < today) ||
                      Boolean(
                        request.nextFollowUpAt && request.nextFollowUpAt <= today
                      );

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
                        <td className="queue-next-action">
                          <strong>{getNextAction(request)}</strong>
                          {request.checklistSummary.missingRequired.length ? (
                            <span>
                              {request.checklistSummary.missingRequired.length} blocker
                              {request.checklistSummary.missingRequired.length === 1
                                ? ""
                                : "s"}
                            </span>
                          ) : (
                            <span>Intake progressing</span>
                          )}
                        </td>
                        <td>
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
                          ) : (
                            <strong>{request.assignedToName || "Unassigned"}</strong>
                          )}
                        </td>
                        <td className={timingAttention ? "queue-timing attention" : "queue-timing"}>
                          <strong>
                            <CalendarClock size={15} />
                            {request.dueDate
                              ? `Due ${formatShortDate(request.dueDate)}`
                              : "No due date"}
                          </strong>
                          <span>
                            {request.nextFollowUpAt
                              ? `Follow-up ${formatShortDate(
                                  request.nextFollowUpAt
                                )}`
                              : "No follow-up"}
                          </span>
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
          </table>
        </div>

        <div className="requests-queue-mobile">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <div className="queue-mobile-skeleton" key={index} />
              ))
            : filteredRequests.map((request) => {
                const missingRequired =
                  request.checklistSummary.missingRequired.length;
                const timingAttention =
                  Boolean(request.dueDate && request.dueDate < today) ||
                  Boolean(
                    request.nextFollowUpAt && request.nextFollowUpAt <= today
                  );

                return (
                  <article
                    className={
                      timingAttention
                        ? "requests-queue-mobile-card needs-attention"
                        : "requests-queue-mobile-card"
                    }
                    key={request.id}
                  >
                    <Link href={requestHref(request.id)}>
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

                      <div className="queue-mobile-action">
                        <span>Next action</span>
                        <strong>{getNextAction(request)}</strong>
                      </div>

                      <div className="queue-mobile-footer">
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
                      </div>
                    </Link>
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
      ) : null}

      {pendingTerminal && terminalRequest ? (
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
      ) : null}
    </section>
  );
}
