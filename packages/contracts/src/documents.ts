export type DocumentSourceType = "Request" | "Quote" | "Project" | "Invoice";

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
  tags: string[];
  scanStatus: string;
  available: boolean;
  uploadedByName: string;
  createdAt: string;
  downloadUrl: string | null;
  previewUrl: string | null;
};

export const suggestedDocumentPurposeTags = [
  "Reference",
  "Existing Condition",
  "Installation",
  "Work in Progress",
  "Issue",
  "Damage",
  "Completed Work",
  "Approval"
] as const;

export const documentTagLimits = {
  count: 8,
  length: 32
} as const;

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

export const invoiceDocumentCategories = [
  "Invoice",
  "Supporting Document",
  "Purchase Order",
  "Payment Record",
  "Credit Memo",
  "Other"
] as const;
