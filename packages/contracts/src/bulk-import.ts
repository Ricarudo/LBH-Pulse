export type BulkImportRowStatus =
  | "new"
  | "changed"
  | "unchanged"
  | "conflict"
  | "invalid";

export type BulkImportFieldDiff = {
  field: string;
  label: string;
  group: string;
  current: string;
  incoming: string;
  changed: boolean;
};

export type BulkImportMatchCandidate = {
  id: string;
  recordNumber: string;
  displayName: string;
  archived: boolean;
};

export type BulkImportPreviewRow = {
  rowNumber: number;
  status: BulkImportRowStatus;
  displayName: string;
  targetId?: string;
  targetNumber?: string;
  expectedUpdatedAt?: string;
  matchedBy: string[];
  errors: string[];
  candidates: BulkImportMatchCandidate[];
  diffs: BulkImportFieldDiff[];
};

export type BulkImportPreview = {
  fileName: string;
  fileDigest: string;
  summary: Record<BulkImportRowStatus, number>;
  rows: BulkImportPreviewRow[];
};

export type BulkImportCommitSelection = {
  rowNumber: number;
  action: "create" | "update";
  targetId?: string;
  expectedUpdatedAt?: string;
};

export type BulkImportCommitResult = {
  batchId: string;
  created: number;
  updated: number;
  records: Array<{
    id: string;
    recordNumber: string;
    displayName: string;
    action: "created" | "updated";
    href: string;
  }>;
};
