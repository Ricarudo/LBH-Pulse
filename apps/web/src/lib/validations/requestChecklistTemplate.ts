import { z } from "zod";
import { requestTypeSchema, serviceCategorySchema } from "@/lib/validations/request";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "");

const optionalRequestTypeSchema = z
  .union([requestTypeSchema, z.literal("")])
  .optional()
  .transform((value) => value ?? "");

const optionalServiceCategorySchema = z
  .union([serviceCategorySchema, z.literal("")])
  .optional()
  .transform((value) => value ?? "");

export const updateRequestChecklistTemplateItemSchema = z.object({
  id: optionalText,
  label: z.string().trim().min(1, "Checklist item label is required."),
  description: optionalText,
  required: z.boolean().default(true),
  appliesWhen: optionalText,
  sortOrder: z.number().int().min(0).default(0),
  group: optionalText,
  active: z.boolean().default(true)
});

export const updateRequestChecklistTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required."),
  requestType: optionalRequestTypeSchema,
  serviceCategory: optionalServiceCategorySchema,
  active: z.boolean().default(true),
  items: z.array(updateRequestChecklistTemplateItemSchema).min(1)
});

export type UpdateRequestChecklistTemplateInput = z.infer<
  typeof updateRequestChecklistTemplateSchema
>;
