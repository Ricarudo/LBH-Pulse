import { z } from "zod";
import {
  requestPriorities,
  requestSources,
  requestStatuses,
  requestTypes,
  serviceCategories
} from "@/types/request";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const optionalDateText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

export const requestStatusSchema = z.enum(requestStatuses);
export const requestPrioritySchema = z.enum(requestPriorities);
export const requestTypeSchema = z.enum(requestTypes);
export const requestSourceSchema = z.enum(requestSources);
export const serviceCategorySchema = z.enum(serviceCategories);

const nullableIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const requestFormFieldsSchema = z.object({
  title: optionalText,
  requestType: requestTypeSchema.default("Quote Request"),
  source: requestSourceSchema.default("Call"),
  serviceCategory: serviceCategorySchema.default("Access Control"),
  status: requestStatusSchema.default("Received"),
  priority: requestPrioritySchema.default("Normal"),
  companyName: optionalText,
  contactName: optionalText,
  contactEmail: optionalText,
  contactPhone: optionalText,
  siteName: optionalText,
  siteAddress: optionalText,
  city: optionalText,
  state: optionalText,
  clientId: nullableIdSchema,
  contactId: nullableIdSchema,
  siteId: nullableIdSchema,
  assignedToId: nullableIdSchema,
  receivedDate: optionalDateText,
  dueDate: optionalDateText,
  nextAction: optionalText,
  nextFollowUpAt: optionalDateText,
  missingInfo: optionalText,
  siteVisitNeeded: z.boolean().default(false),
  siteVisitCompleted: z.boolean().default(false),
  description: optionalText,
  internalNotes: optionalText,
  relatedQuoteId: nullableIdSchema,
  createdById: nullableIdSchema
});

export const createRequestSchema = requestFormFieldsSchema
  .superRefine((data, context) => {
    if (!data.companyName && !data.contactName) {
      context.addIssue({
        code: "custom",
        message: "Company name or contact name is required.",
        path: ["companyName"]
      });
    }
  })
  .transform((data) => ({
    ...data,
    title:
      data.title ||
      data.companyName ||
      data.contactName ||
      `${data.serviceCategory} request`
  }));

export const updateRequestSchema = requestFormFieldsSchema.partial().superRefine(
  (data, context) => {
    if (
      "companyName" in data &&
      "contactName" in data &&
      !data.companyName &&
      !data.contactName
    ) {
      context.addIssue({
        code: "custom",
        message: "Company name or contact name is required.",
        path: ["companyName"]
      });
    }
  }
);

const terminalRequestStatuses = ["No Bid", "Cancelled", "Duplicate"] as const;

export const changeRequestStatusSchema = z
  .object({
    status: requestStatusSchema,
    reason: optionalText
  })
  .superRefine((data, context) => {
    if (
      terminalRequestStatuses.includes(
        data.status as (typeof terminalRequestStatuses)[number]
      ) &&
      !data.reason
    ) {
      context.addIssue({
        code: "custom",
        message: "Add a reason before closing this request.",
        path: ["reason"]
      });
    }
  });

export const createRequestActivitySchema = z.object({
  type: z
    .enum(["Note", "Task", "Status", "Owner", "Follow-up", "Conversion"])
    .default("Note"),
  title: z.string().trim().min(1),
  body: optionalText,
  actor: optionalText.default("Pulse System")
});

export const createRequestTaskSchema = z.object({
  title: z.string().trim().min(1),
  dueAt: optionalDateText,
  owner: optionalText.default("Unassigned")
});

export const completeRequestTaskSchema = z.object({
  completed: z.boolean()
});

export const updateRequestChecklistItemSchema = z.object({
  completed: z.boolean().optional(),
  notes: optionalText
});

export const convertRequestSchema = z.object({
  createQuote: z.boolean().default(true)
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type CreateRequestActivityInput = z.infer<typeof createRequestActivitySchema>;
export type CreateRequestTaskInput = z.infer<typeof createRequestTaskSchema>;
export type UpdateRequestChecklistItemInput = z.infer<typeof updateRequestChecklistItemSchema>;
export type ConvertRequestInput = z.infer<typeof convertRequestSchema>;
