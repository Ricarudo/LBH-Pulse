export const clientBulkCsvHeaders = [
  "client_number",
  "client_name",
  "legal_name",
  "industry",
  "website",
  "status",
  "account_owner",
  "source",
  "primary_contact_name",
  "primary_contact_title",
  "primary_contact_email",
  "primary_contact_phone",
  "primary_contact_mobile",
  "primary_site_name",
  "primary_site_type",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "country"
] as const;

export type ClientBulkCsvHeader = (typeof clientBulkCsvHeaders)[number];
export type ClientBulkCsvRow = Record<ClientBulkCsvHeader, string>;

export type ClientBulkRowStatus =
  | "new"
  | "changed"
  | "unchanged"
  | "conflict"
  | "invalid";

export type ClientBulkFieldDiff = {
  field: ClientBulkCsvHeader;
  label: string;
  group: "Client" | "Primary Contact" | "Primary Site";
  current: string;
  incoming: string;
  changed: boolean;
};

export type ClientBulkMatchCandidate = {
  id: string;
  clientNumber: string;
  displayName: string;
  archived: boolean;
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
  candidates: ClientBulkMatchCandidate[];
  diffs: ClientBulkFieldDiff[];
};

export type ClientBulkPreview = {
  fileName: string;
  fileDigest: string;
  summary: Record<ClientBulkRowStatus, number>;
  rows: ClientBulkPreviewRow[];
};

export type ClientBulkCommitSelection = {
  rowNumber: number;
  action: "create" | "update";
  targetClientId?: string;
  expectedUpdatedAt?: string;
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
