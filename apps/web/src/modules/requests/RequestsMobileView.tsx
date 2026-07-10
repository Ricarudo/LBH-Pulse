"use client";

import {
  ArrowRight,
  MapPin,
  Plus,
  UserRound
} from "lucide-react";
import { useState } from "react";
import {
  MobileBadge,
  MobileEmptyState,
  MobileLoadingState,
  MobilePageHeader,
  MobileProgressBar,
  MobileRecordCard,
  MobileSearchFilterBar,
  MobileSummaryCard,
  MobileSummaryCardRow
} from "@/components/mobile/MobilePrimitives";
import {
  requestPriorities,
  requestSources,
  requestStatuses,
  type RequestAssignee,
  type RequestPriority,
  type RequestRecord,
  type RequestSource,
  type RequestStatus
} from "@pulse/contracts/requests";

type RequestsMobileCapabilities = {
  canCreate: boolean;
  canUpdateStatus: boolean;
  canUpdateChecklist: boolean;
  canConvert: boolean;
};

type RequestsMobileViewProps = {
  requests: RequestRecord[];
  filteredRequests: RequestRecord[];
  selectedRequest: RequestRecord | null;
  selectedRequestId: string;
  assignees: RequestAssignee[];
  isLoading: boolean;
  loadError: string;
  searchTerm: string;
  statusFilter: "All" | RequestStatus;
  sourceFilter: "All" | RequestSource;
  assigneeFilter: string;
  priorityFilter: "All" | RequestPriority;
  capabilities: RequestsMobileCapabilities;
  getNextAction: (request: RequestRecord) => string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "All" | RequestStatus) => void;
  onSourceFilterChange: (value: "All" | RequestSource) => void;
  onAssigneeFilterChange: (value: string) => void;
  onPriorityFilterChange: (value: "All" | RequestPriority) => void;
  onCreateRequest: () => void;
};

function isReadyForQuote(request: RequestRecord) {
  return request.checklistSummary.readyForQuote || request.status === "Ready for Quote";
}

function isClosedRequest(request: RequestRecord) {
  return ["Converted to Quote", "No Bid", "Cancelled", "Duplicate"].includes(
    request.status
  );
}

function statusTone(status: RequestStatus) {
  if (status === "Ready for Quote" || status === "Converted to Quote") {
    return "green";
  }

  if (status === "Missing Info" || status === "Site Visit Required") {
    return "amber";
  }

  if (["No Bid", "Cancelled", "Duplicate"].includes(status)) {
    return "red";
  }

  return "blue";
}

function categoryTone(category: string) {
  if (category.includes("Fiber") || category.includes("Networking")) {
    return "cyan";
  }

  if (category.includes("Access")) {
    return "purple";
  }

  if (category.includes("Service")) {
    return "amber";
  }

  return "blue";
}

function priorityTone(priority: RequestPriority) {
  if (priority === "Urgent") {
    return "red";
  }

  if (priority === "High") {
    return "amber";
  }

  if (priority === "Low") {
    return "neutral";
  }

  return "blue";
}

function locationLabel(request: RequestRecord) {
  return (
    [request.siteName, request.siteAddress, request.city, request.state]
      .filter(Boolean)
      .join(", ") || "Location not captured"
  );
}

function activeFilterCount(
  statusFilter: "All" | RequestStatus,
  sourceFilter: "All" | RequestSource,
  assigneeFilter: string,
  priorityFilter: "All" | RequestPriority
) {
  return [statusFilter, sourceFilter, assigneeFilter, priorityFilter].filter(
    (value) => value !== "All"
  ).length;
}

export function RequestsMobileView({
  requests,
  filteredRequests,
  selectedRequest,
  assignees,
  isLoading,
  loadError,
  searchTerm,
  statusFilter,
  sourceFilter,
  assigneeFilter,
  priorityFilter,
  capabilities,
  getNextAction,
  onSearchChange,
  onStatusFilterChange,
  onSourceFilterChange,
  onAssigneeFilterChange,
  onPriorityFilterChange,
  onCreateRequest
}: RequestsMobileViewProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const newCount = requests.filter((request) => request.status === "Received").length;
  const needsInfoCount = requests.filter(
    (request) =>
      !isClosedRequest(request) &&
      (request.status === "Missing Info" ||
        request.checklistSummary.missingRequired.length > 0)
  ).length;
  const readyCount = requests.filter(isReadyForQuote).length;

  return (
    <section className="requests-mobile-view" aria-label="Mobile requests intake queue">
      <MobilePageHeader
        eyebrow="Pulse"
        title="Requests"
        subtitle="Intake queue"
        action={
          <button
            className="mobile-icon-action"
            type="button"
            aria-label="Create request"
            disabled={!capabilities.canCreate}
            onClick={onCreateRequest}
          >
            <Plus size={18} />
          </button>
        }
      />

      <MobileSearchFilterBar
        searchValue={searchTerm}
        searchPlaceholder="Search requests"
        activeFilterCount={activeFilterCount(
          statusFilter,
          sourceFilter,
          assigneeFilter,
          priorityFilter
        )}
        filterLabel="Filter"
        onSearchChange={onSearchChange}
        filtersOpen={filtersOpen}
        onFilterClick={() => setFiltersOpen((open) => !open)}
      >
        <div className="requests-mobile-filter-grid">
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(event.target.value as "All" | RequestStatus)
              }
            >
              <option value="All">All statuses</option>
              {requestStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select
              value={sourceFilter}
              onChange={(event) =>
                onSourceFilterChange(event.target.value as "All" | RequestSource)
              }
            >
              <option value="All">All sources</option>
              {requestSources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              value={assigneeFilter}
              onChange={(event) => onAssigneeFilterChange(event.target.value)}
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
            Priority
            <select
              value={priorityFilter}
              onChange={(event) =>
                onPriorityFilterChange(event.target.value as "All" | RequestPriority)
              }
            >
              <option value="All">All priorities</option>
              {requestPriorities.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>
      </MobileSearchFilterBar>

      <MobileSummaryCardRow>
        <MobileSummaryCard
          label="New"
          value={newCount}
          detail="Received"
          tone="blue"
          onClick={() => onStatusFilterChange("Received")}
        />
        <MobileSummaryCard
          label="Needs Info"
          value={needsInfoCount}
          detail="Missing"
          tone="amber"
          onClick={() => onStatusFilterChange("Missing Info")}
        />
        <MobileSummaryCard
          label="Ready"
          value={readyCount}
          detail="Quote-ready"
          tone="green"
          onClick={() => onStatusFilterChange("Ready for Quote")}
        />
      </MobileSummaryCardRow>

      {loadError ? (
        <MobileEmptyState title="Unable to load requests" detail={loadError} />
      ) : null}

      {isLoading ? <MobileLoadingState label="Loading requests..." /> : null}

      <div className="requests-mobile-list">
        {filteredRequests.map((request) => {
          const missingCount = request.checklistSummary.missingRequired.length;
          const checklist = request.checklistSummary;

          return (
            <div className="requests-mobile-record-stack" key={request.id}>
              <MobileRecordCard
                href={`/requests/${request.id}`}
              >
                <div className="requests-mobile-card-heading">
                  <span>{request.requestNumber}</span>
                  <MobileBadge tone={statusTone(request.status)}>{request.status}</MobileBadge>
                </div>
                <strong>{request.title}</strong>
                <p>{request.companyName || request.contactName || "Unknown / new prospect"}</p>
                <div className="requests-mobile-card-meta">
                  <span>
                    <MapPin size={14} />
                    {locationLabel(request)}
                  </span>
                  <span>
                    <UserRound size={14} />
                    {request.assignedToName || "Unassigned"}
                  </span>
                </div>
                <div className="requests-mobile-badge-row">
                  {request.serviceCategories.map((category) => (
                    <MobileBadge key={category} tone={categoryTone(category)}>{category}</MobileBadge>
                  ))}
                  <MobileBadge tone={priorityTone(request.priority)}>
                    {request.priority}
                  </MobileBadge>
                  {missingCount > 0 ? (
                    <MobileBadge tone="amber">{missingCount} missing</MobileBadge>
                  ) : null}
                </div>
                <MobileProgressBar
                  label={checklist.templateName}
                  value={checklist.completed}
                  max={checklist.total}
                />
                <div className="requests-mobile-next-action">
                  <span>{getNextAction(request)}</span>
                  <ArrowRight size={15} />
                </div>
              </MobileRecordCard>
              </div>
          );
        })}
      </div>

      {!isLoading && filteredRequests.length === 0 ? (
        <MobileEmptyState
          title="No requests found"
          detail="Adjust search or filters to widen the intake queue."
        />
      ) : null}

      {selectedRequest && !filteredRequests.some((request) => request.id === selectedRequest.id) ? (
        <MobileEmptyState
          title="Selected request is hidden"
          detail="Adjust filters to bring the selected request back into the queue."
        />
      ) : null}
    </section>
  );
}
