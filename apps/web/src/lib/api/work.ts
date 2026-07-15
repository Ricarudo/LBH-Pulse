import type {
  CreateRequestUpdateInput,
  RequestAssignee,
  RequestUpdate,
  RequestUpdateFilter
} from "@pulse/contracts/requests";
import type {
  InvoiceDetailResponse,
  InvoiceResponse,
  ProjectDetailResponse,
  ProjectResponse,
  UpdateInvoiceInput,
  UpdateProjectInput
} from "@pulse/contracts/work";
import { apiRequest, type ApiRequestOptions } from "@/lib/api/client";

export type WorkApiStage = "project" | "invoice";
type ReadOptions = Pick<ApiRequestOptions, "cache" | "signal">;

export type WorkUpdatesResponse = {
  updates: RequestUpdate[];
  currentStep: RequestUpdate | null;
  unreadMentionCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type WorkUsersResponse = {
  assignees: RequestAssignee[];
  teamMembers: RequestAssignee[];
};

function collection(stage: WorkApiStage) {
  return stage === "project" ? "projects" : "invoices";
}

function workPath(stage: WorkApiStage, recordId: string, suffix = "") {
  return `/api/${collection(stage)}/${encodeURIComponent(recordId)}${suffix}`;
}

export function fetchWorkRecord(stage: "project", recordId: string, options?: ReadOptions): Promise<ProjectDetailResponse>;
export function fetchWorkRecord(stage: "invoice", recordId: string, options?: ReadOptions): Promise<InvoiceDetailResponse>;
export function fetchWorkRecord(stage: WorkApiStage, recordId: string, options: ReadOptions = {}) {
  return apiRequest<ProjectDetailResponse | InvoiceDetailResponse>(
    workPath(stage, recordId),
    { ...options, method: "GET" }
  );
}

export function fetchWorkUsers(stage: WorkApiStage, options: ReadOptions = {}) {
  return apiRequest<WorkUsersResponse>(`/api/${collection(stage)}/team-members`, {
    ...options,
    method: "GET"
  });
}

export function updateWorkRecord(
  stage: "project",
  recordId: string,
  input: UpdateProjectInput
): Promise<ProjectResponse>;
export function updateWorkRecord(
  stage: "invoice",
  recordId: string,
  input: UpdateInvoiceInput
): Promise<InvoiceResponse>;
export function updateWorkRecord(
  stage: WorkApiStage,
  recordId: string,
  input: UpdateProjectInput | UpdateInvoiceInput
) {
  return apiRequest<ProjectResponse | InvoiceResponse>(
    workPath(stage, recordId),
    { method: "PATCH", json: input }
  );
}

export function fetchWorkUpdates(
  stage: WorkApiStage,
  recordId: string,
  filter: RequestUpdateFilter,
  cursor?: string | null,
  options: ReadOptions = {}
) {
  const params = new URLSearchParams({ kind: filter, take: "25" });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<WorkUpdatesResponse>(
    `${workPath(stage, recordId, "/updates")}?${params.toString()}`,
    { ...options, method: "GET" }
  );
}

export function postWorkUpdate(
  stage: WorkApiStage,
  recordId: string,
  input: CreateRequestUpdateInput
) {
  return apiRequest<WorkUpdatesResponse>(workPath(stage, recordId, "/updates"), {
    method: "POST",
    json: input
  });
}

export function completeWorkUpdate(
  stage: WorkApiStage,
  recordId: string,
  updateId: string
) {
  return apiRequest<WorkUpdatesResponse>(
    workPath(stage, recordId, `/updates/${encodeURIComponent(updateId)}/complete`),
    { method: "POST", json: { completed: true } }
  );
}

export function undoWorkUpdate(
  stage: WorkApiStage,
  recordId: string,
  updateId: string
) {
  return apiRequest<WorkUpdatesResponse>(
    workPath(stage, recordId, `/updates/${encodeURIComponent(updateId)}/undo`),
    { method: "POST" }
  );
}

export function markWorkMentionsRead(stage: WorkApiStage, recordId: string) {
  return apiRequest<{ marked: number }>(workPath(stage, recordId, "/mentions/read"), {
    method: "POST"
  });
}
