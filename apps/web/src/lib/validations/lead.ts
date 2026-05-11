import { z } from "zod";
import {
  leadPriorities,
  leadSources,
  leadStatuses,
  serviceInterests
} from "@/types/lead";

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

export const leadStatusSchema = z.enum(leadStatuses);
export const leadPrioritySchema = z.enum(leadPriorities);
export const leadSourceSchema = z.enum(leadSources);
export const serviceInterestSchema = z.enum(serviceInterests);

const qualificationSchema = {
  qualificationContactIdentified: z.boolean().optional(),
  qualificationSiteKnown: z.boolean().optional(),
  qualificationBudgetKnown: z.boolean().optional(),
  qualificationFollowUpScheduled: z.boolean().optional()
};

const leadFormFieldsSchema = z.object({
    name: optionalText,
    companyName: optionalText,
    contactName: optionalText,
    contactTitle: optionalText,
    email: optionalText,
    phone: optionalText,
    leadSource: leadSourceSchema,
    serviceInterest: serviceInterestSchema,
    siteName: optionalText,
    siteAddress: optionalText,
    city: optionalText,
    state: optionalText,
    estimatedValue: z.coerce.number().min(0).default(0),
    status: leadStatusSchema.default("New"),
    priority: leadPrioritySchema.default("Normal"),
    assignedOwner: optionalText.default("Unassigned"),
    nextFollowUpDate: optionalDateText,
    notes: optionalText,
    ...qualificationSchema
  });

export const createLeadSchema = leadFormFieldsSchema
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
    name:
      data.name ||
      data.companyName ||
      data.contactName ||
      `${data.serviceInterest} lead`,
    assignedOwner: data.assignedOwner || "Unassigned"
  }));

export const updateLeadSchema = leadFormFieldsSchema.partial().superRefine(
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

export const changeLeadStatusSchema = z.object({
  status: leadStatusSchema
});

export const createLeadActivitySchema = z.object({
  type: z
    .enum(["Note", "Task", "Status", "Owner", "Follow-up", "Conversion"])
    .default("Note"),
  title: z.string().trim().min(1),
  body: optionalText,
  actor: optionalText.default("Alex Morgan")
});

export const createLeadTaskSchema = z.object({
  title: z.string().trim().min(1),
  dueAt: optionalDateText,
  owner: optionalText.default("Unassigned")
});

export const completeLeadTaskSchema = z.object({
  completed: z.boolean()
});

export const convertLeadSchema = z.object({
  createQuote: z.boolean().default(true),
  createProject: z.boolean().default(false)
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateLeadActivityInput = z.infer<typeof createLeadActivitySchema>;
export type CreateLeadTaskInput = z.infer<typeof createLeadTaskSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
