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

export type ItemPriceHistoryRecord = {
  id: string;
  previousCost: number | null;
  newCost: number;
  previousSellPrice: number | null;
  newSellPrice: number;
  changedAt: string;
};

export type ItemQuoteUsageRecord = {
  quoteId: string;
  quoteNumber: string;
  quoteTitle: string;
  quoteStatus: string;
  quoteLineCount: number;
  quantity: number;
  unitPrice: number;
  quotedValue: number;
  quotedAt: string;
};

export type ItemStatisticsRecord = {
  quoteCount: number;
  quoteLineCount: number;
  totalQuantity: number;
  totalQuotedValue: number;
  latestQuotedAt: string;
  priceChangeCount: number;
};

export type ItemDetailResponse = {
  item: ItemRecord;
  statistics: ItemStatisticsRecord;
  priceHistory: ItemPriceHistoryRecord[];
  recentQuotes: ItemQuoteUsageRecord[];
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

export type ItemsResponse = { items: ItemRecord[] };
export type ItemResponse = { item: ItemRecord };

import { z } from "zod";
const unsafeFreeTextPattern = /[<>]|javascript\s*:/i;
const unsafeFreeTextMessage = "Remove HTML or script content.";

function normalizeText(value?: string, collapseSpaces = false) {
  const trimmed = value?.trim() ?? "";
  return collapseSpaces ? trimmed.replace(/\s+/g, " ") : trimmed;
}

function textField(options: { max?: number; collapseSpaces?: boolean } = {}) {
  return z
    .string()
    .optional()
    .transform((value) => normalizeText(value, options.collapseSpaces))
    .refine(
      (value) => options.max === undefined || value.length <= options.max,
      options.max
        ? `Must be ${options.max} characters or less.`
        : "Text is too long."
    )
    .refine((value) => !unsafeFreeTextPattern.test(value), unsafeFreeTextMessage);
}

function isValidHttpUrl(value: string) {
  if (!value) return true;
  if (/\s/.test(value)) return false;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const idSchema = z.string().trim().min(1);
const optionalUrl = textField({ max: 2048, collapseSpaces: true }).refine(
  isValidHttpUrl,
  "Enter a valid URL."
);
const money = z.coerce.number().min(0).max(9999999999);
const quantity = z.coerce.number().positive().max(999999);
const percent = z.coerce.number().min(0).max(9999);
const discountPercent = z.coerce.number().min(0).max(100);
const queryBoolean = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "true" || value === "1");

export const itemTypeSchema = z.enum(itemTypes);
export const itemStatusSchema = z.enum(itemStatuses);
export const itemRelationTypeSchema = z.enum(itemRelationTypes);
export const quoteBomSectionSchema = z.enum(quoteBomSections);

export const itemRelationInputSchema = z.object({
  childItemId: idSchema,
  relationType: itemRelationTypeSchema,
  defaultQuantity: quantity.default(1),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
}).strict();

const itemFieldsSchema = z.object({
  name: textField({ max: 200, collapseSpaces: true }).refine(
    (value) => value.length > 0,
    "Item name is required."
  ),
  description: textField({ max: 2000 }),
  itemType: itemTypeSchema,
  status: itemStatusSchema,
  sku: textField({ max: 120, collapseSpaces: true }),
  partNumber: textField({ max: 120, collapseSpaces: true }),
  manufacturer: textField({ max: 160, collapseSpaces: true }),
  brand: textField({ max: 160, collapseSpaces: true }),
  category: textField({ max: 120, collapseSpaces: true }),
  subcategory: textField({ max: 120, collapseSpaces: true }),
  unitOfMeasure: textField({ max: 40, collapseSpaces: true }),
  cost: money,
  sellPrice: money,
  markupPercent: percent,
  taxable: z.boolean(),
  primaryImageUrl: optionalUrl,
  productUrl: optionalUrl,
  datasheetUrl: optionalUrl,
  internalNotes: textField({ max: 4000 }),
  quoteDescription: textField({ max: 2000 }),
  defaultLaborHours: z.coerce.number().min(0).max(9999),
  defaultLaborItemId: z.string().trim().optional().transform((value) => value ?? "")
}).strict();

export const createItemSchema = itemFieldsSchema.extend({
  itemType: itemTypeSchema.default("PRODUCT"),
  status: itemStatusSchema.default("ACTIVE"),
  unitOfMeasure: textField({ max: 40, collapseSpaces: true }).default("each"),
  cost: money.default(0),
  sellPrice: money.default(0),
  markupPercent: percent.default(0),
  taxable: z.boolean().default(true),
  defaultLaborHours: z.coerce.number().min(0).max(9999).default(0),
  relations: z.array(itemRelationInputSchema).default([])
});

export const updateItemSchema = itemFieldsSchema.partial().extend({
  relations: z.array(itemRelationInputSchema).optional()
}).strict();

export const itemSearchSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  type: itemTypeSchema.optional(),
  status: itemStatusSchema.optional(),
  includeInactive: queryBoolean
}).strict();

export const addQuoteItemSchema = z.object({
  itemId: idSchema,
  quantity: quantity.default(1),
  suggestionItemIds: z.array(idSchema).default([])
}).strict();

export const addQuoteKitSchema = z.object({
  itemId: idSchema,
  quantity: quantity.default(1),
  suggestionItemIds: z.array(idSchema).default([])
}).strict();

export const addAdHocQuoteItemSchema = z.object({
  section: quoteBomSectionSchema.default("Materials"),
  name: textField({ max: 200, collapseSpaces: true }).refine(
    (value) => value.length > 0,
    "Line name is required."
  ),
  description: textField({ max: 2000 }),
  itemType: itemTypeSchema.default("PRODUCT"),
  sku: textField({ max: 120, collapseSpaces: true }),
  partNumber: textField({ max: 120, collapseSpaces: true }),
  manufacturer: textField({ max: 160, collapseSpaces: true }),
  brand: textField({ max: 160, collapseSpaces: true }),
  quantity: quantity.default(1),
  unitOfMeasure: textField({ max: 40, collapseSpaces: true }).default("each"),
  unitCost: money.default(0),
  unitPrice: money.default(0),
  discountPercent: discountPercent.default(0),
  taxable: z.boolean().default(true),
  imageUrl: optionalUrl,
  productUrl: optionalUrl,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional()
}).strict();

export const updateQuoteItemSchema = z.object({
  section: quoteBomSectionSchema.optional(),
  name: textField({ max: 200, collapseSpaces: true }).optional(),
  description: textField({ max: 2000 }).optional(),
  itemType: itemTypeSchema.optional(),
  sku: textField({ max: 120, collapseSpaces: true }).optional(),
  partNumber: textField({ max: 120, collapseSpaces: true }).optional(),
  manufacturer: textField({ max: 160, collapseSpaces: true }).optional(),
  brand: textField({ max: 160, collapseSpaces: true }).optional(),
  quantity: quantity.optional(),
  unitOfMeasure: textField({ max: 40, collapseSpaces: true }).optional(),
  unitCost: money.optional(),
  unitPrice: money.optional(),
  discountPercent: discountPercent.optional(),
  taxable: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional()
}).strict();

export const updateQuoteProposalSchema = z.object({
  proposalNotes: textField({ max: 6000 })
}).strict();

export const reorderQuoteItemsSchema = z.object({
  quoteItemIds: z.array(idSchema).refine(
    (ids) => new Set(ids).size === ids.length,
    "Quote item order cannot contain duplicates."
  )
}).strict();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemSearchInput = z.infer<typeof itemSearchSchema>;
export type AddQuoteItemInput = z.infer<typeof addQuoteItemSchema>;
export type AddQuoteKitInput = z.infer<typeof addQuoteKitSchema>;
export type AddAdHocQuoteItemInput = z.infer<typeof addAdHocQuoteItemSchema>;
export type UpdateQuoteItemInput = z.infer<typeof updateQuoteItemSchema>;
export type UpdateQuoteProposalInput = z.infer<typeof updateQuoteProposalSchema>;
export type ReorderQuoteItemsInput = z.infer<typeof reorderQuoteItemsSchema>;
