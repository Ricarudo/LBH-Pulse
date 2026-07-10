export type DocumentSourceType = "Request" | "Quote" | "Project";

export type LifecycleDocumentRecord = {
  id: string;
  sourceType: DocumentSourceType;
  sourceId: string;
  sourceNumber: string;
  inherited: boolean;
  canDelete: boolean;
  originalFileName: string;
  mediaType: string;
  byteSize: number;
  category: string;
  scanStatus: string;
  available: boolean;
  uploadedByName: string;
  createdAt: string;
  downloadUrl: string | null;
  previewUrl: string | null;
};

export const requestDocumentCategories = [
  "Drawing",
  "Specification",
  "Site Photo",
  "Scope",
  "Bid Package",
  "Other"
] as const;
export const quoteDocumentCategories = [
  "Proposal",
  "Drawing",
  "Specification",
  "Contract",
  "Customer Approval",
  "Other"
] as const;

export const projectDocumentCategories = [
  "Drawing",
  "Submittal",
  "Change Order",
  "Permit",
  "Site Photo",
  "Closeout",
  "Other"
] as const;
