import { z } from "zod";

export const auditEventCategories = [
  "all",
  "authentication",
  "accounts",
  "permissions",
  "administration"
] as const;

export type AuditEventCategory = (typeof auditEventCategories)[number];

export type AuditRecord = {
  id: string;
  category: Exclude<AuditEventCategory, "all">;
  relatedEntityType: string;
  relatedEntityId: string;
  actorName: string;
  actorRole: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type AuditLogResponse = {
  events: AuditRecord[];
  page: number;
  pageCount: number;
  total: number;
  retentionDays: number;
};

export type DataPracticesRecord = {
  auditRetentionDays: number;
  operationalRetentionDays: number;
};

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .optional();

export const auditLogQuerySchema = z.object({
  category: z.enum(auditEventCategories).default("all"),
  actor: z.string().trim().max(80).default(""),
  from: optionalDateSchema,
  to: optionalDateSchema,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  take: z.coerce.number().int().min(10).max(100).default(30)
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "The end date must be on or after the start date."
    });
  }
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
