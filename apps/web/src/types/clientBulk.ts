export type ClientBulkRowStatus =
  | "new"
  | "changed"
  | "unchanged"
  | "conflict"
  | "invalid";

export type ClientBulkFieldDiff = {
  field: string;
  label: string;
  group: "Client" | "Primary Contact" | "Primary Site";
  current: string;
  incoming: string;
  changed: boolean;
};

export type ClientBulkPreviewRow = {
  rowNumber: number;
  status: ClientBulkRowStatus;
  displayName: string;
  targetClientId?: string;
  targetClientNumber?: string;
  expectedUpdatedAt?: string;
  matchedBy: string[];
  errors: string[];
  candidates: Array<{
    id: string;
    clientNumber: string;
    displayName: string;
    archived: boolean;
  }>;
  diffs: ClientBulkFieldDiff[];
};

export type ClientBulkPreview = {
  fileName: string;
  fileDigest: string;
  summary: Record<ClientBulkRowStatus, number>;
  rows: ClientBulkPreviewRow[];
};

export type ClientBulkCommitResult = {
  batchId: string;
  created: number;
  updated: number;
  clients: Array<{
    id: string;
    clientNumber: string;
    displayName: string;
    action: "created" | "updated";
  }>;
};
