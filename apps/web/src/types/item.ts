export const itemTypes = ["PRODUCT", "LABOR", "SERVICE"] as const;
export type ItemType = (typeof itemTypes)[number];

export const itemStatuses = ["ACTIVE", "INACTIVE"] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const itemRelationTypes = [
  "KIT_COMPONENT",
  "RELATED",
  "REQUIRED",
  "OPTIONAL"
] as const;
export type ItemRelationType = (typeof itemRelationTypes)[number];

export const quoteBomSections = ["Materials", "Labor", "Services"] as const;
export type QuoteBomSection = (typeof quoteBomSections)[number];

export type ItemRelationRecord = {
  id: string;
  parentItemId: string;
  childItemId: string;
  childItemName: string;
  childItemType: ItemType;
  childSku: string;
  childPartNumber: string;
  relationType: ItemRelationType;
  defaultQuantity: number;
  sortOrder: number;
};

export type ItemRecord = {
  id: string;
  name: string;
  description: string;
  itemType: ItemType;
  status: ItemStatus;
  sku: string;
  partNumber: string;
  manufacturer: string;
  brand: string;
  category: string;
  subcategory: string;
  unitOfMeasure: string;
  cost: number;
  sellPrice: number;
  markupPercent: number;
  taxable: boolean;
  primaryImageUrl: string;
  productUrl: string;
  datasheetUrl: string;
  internalNotes: string;
  quoteDescription: string;
  defaultLaborHours: number;
  defaultLaborItemId: string | null;
  createdAt: string;
  updatedAt: string;
  relations: ItemRelationRecord[];
};

export type QuoteItemRecord = {
  id: string;
  quoteId: string;
  sourceItemId: string | null;
  section: QuoteBomSection;
  name: string;
  description: string;
  itemType: ItemType;
  sku: string;
  partNumber: string;
  manufacturer: string;
  brand: string;
  quantity: number;
  unitOfMeasure: string;
  unitCost: number;
  unitPrice: number;
  markupPercent: number;
  discountPercent: number;
  taxable: boolean;
  imageUrl: string;
  productUrl: string;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
