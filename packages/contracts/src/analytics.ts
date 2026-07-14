import { z } from "zod";

export const analyticsViews = ["overview", "sales", "operations", "billing"] as const;
export type AnalyticsView = (typeof analyticsViews)[number];

export const analyticsValueFormats = ["number", "currency", "percent", "duration"] as const;
export type AnalyticsValueFormat = (typeof analyticsValueFormats)[number];

export const analyticsChartTypes = ["bar", "line", "area", "funnel"] as const;
export type AnalyticsChartType = (typeof analyticsChartTypes)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalFilter = z.string().trim().max(160).optional().transform((value) => value || undefined);

export const analyticsQuerySchema = z.object({
  view: z.enum(analyticsViews).default("overview"),
  from: dateString.optional(),
  to: dateString.optional(),
  trade: optionalFilter,
  owner: optionalFilter,
  clientId: optionalFilter
}).superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({
      code: "custom",
      message: "Both from and to are required for a custom analytics range.",
      path: value.from ? ["to"] : ["from"]
    });
  }
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      message: "The analytics start date must be on or before the end date.",
      path: ["from"]
    });
  }
});

export const analyticsDetailsQuerySchema = z.object({
  view: z.enum(analyticsViews).default("overview"),
  from: dateString.optional(),
  to: dateString.optional(),
  trade: optionalFilter,
  owner: optionalFilter,
  clientId: optionalFilter,
  metric: z.string().trim().min(1).max(80).default("recent"),
  segment: optionalFilter,
  cursor: z.string().trim().max(160).optional(),
  take: z.coerce.number().int().min(1).max(50).default(25)
}).superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({
      code: "custom",
      message: "Both from and to are required for a custom analytics range.",
      path: value.from ? ["to"] : ["from"]
    });
  }
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", message: "Invalid analytics date range.", path: ["from"] });
  }
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsDetailsQuery = z.infer<typeof analyticsDetailsQuerySchema>;

export type AnalyticsRange = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  timeZone: string;
  label: string;
  comparisonLabel: string;
};

export type AnalyticsKpi = {
  id: string;
  label: string;
  description: string;
  value: number | null;
  format: AnalyticsValueFormat;
  deltaPercent?: number | null;
  snapshot?: boolean;
  estimated?: boolean;
  exactSampleCount?: number;
  estimatedSampleCount?: number;
  metric: string;
};

export type AnalyticsPoint = {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
  tertiaryValue?: number;
  segment?: string;
};

export type AnalyticsChart = {
  id: string;
  title: string;
  description: string;
  type: AnalyticsChartType;
  format: AnalyticsValueFormat;
  secondaryFormat?: AnalyticsValueFormat;
  valueLabel: string;
  secondaryLabel?: string;
  metric: string;
  points: AnalyticsPoint[];
  overlapNotice?: boolean;
};

export type AnalyticsFilterOption = { value: string; label: string };

export type AnalyticsDataQuality = {
  exactLifecycleEvents: number;
  estimatedLifecycleEvents: number;
  message?: string;
};

export type AnalyticsResponse = {
  view: AnalyticsView;
  availableViews: AnalyticsView[];
  range: AnalyticsRange;
  kpis: AnalyticsKpi[];
  charts: AnalyticsChart[];
  filters: {
    trades: AnalyticsFilterOption[];
    owners: AnalyticsFilterOption[];
    clients: AnalyticsFilterOption[];
  };
  dataQuality: AnalyticsDataQuality;
  generatedAt: string;
};

export type AnalyticsDetailRow = {
  id: string;
  kind: "Request" | "Quote" | "Project" | "Invoice";
  reference: string;
  title: string;
  client: string;
  trades: string[];
  status: string;
  owner: string;
  date: string;
  value?: number;
  durationDays?: number;
  href: string;
};

export type AnalyticsDetailsResponse = {
  metric: string;
  segment?: string;
  summary: string;
  rows: AnalyticsDetailRow[];
  nextCursor?: string;
};
