import { z } from "zod";

export const analyticsViews = ["overview", "sales", "operations", "billing"] as const;
export type AnalyticsView = (typeof analyticsViews)[number];

export const analyticsValueFormats = ["number", "currency", "percent", "duration"] as const;
export type AnalyticsValueFormat = (typeof analyticsValueFormats)[number];

export const analyticsChartTypes = ["bar", "column", "donut", "stackedBar", "combo"] as const;
export type AnalyticsChartType = (typeof analyticsChartTypes)[number];

export const analyticsQualityStatuses = ["exact", "mixed", "estimated", "partial", "unavailable"] as const;
export type AnalyticsQualityStatus = (typeof analyticsQualityStatuses)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalFilter = z.string().trim().max(160).optional().transform((value) => value || undefined);

function validateRange(value: { from?: string; to?: string }, context: z.RefinementCtx) {
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
}

export const analyticsQuerySchema = z.object({
  view: z.enum(analyticsViews).default("overview"),
  from: dateString.optional(),
  to: dateString.optional(),
  trade: optionalFilter,
  owner: optionalFilter,
  clientId: optionalFilter
}).superRefine(validateRange);

export const analyticsDetailsQuerySchema = z.object({
  view: z.enum(analyticsViews).default("overview"),
  from: dateString.optional(),
  to: dateString.optional(),
  trade: optionalFilter,
  owner: optionalFilter,
  clientId: optionalFilter,
  metric: z.string().trim().min(1).max(100).default("recent"),
  segment: optionalFilter,
  bucketFrom: dateString.optional(),
  bucketTo: dateString.optional(),
  sort: z.enum(["reference", "client", "status", "owner", "date", "value"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().trim().max(160).optional(),
  take: z.coerce.number().int().min(1).max(50).default(25)
}).superRefine((value, context) => {
  validateRange(value, context);
  if (Boolean(value.bucketFrom) !== Boolean(value.bucketTo)) {
    context.addIssue({
      code: "custom",
      message: "Both bucket boundaries are required.",
      path: value.bucketFrom ? ["bucketTo"] : ["bucketFrom"]
    });
  }
  if (value.bucketFrom && value.bucketTo && value.bucketFrom > value.bucketTo) {
    context.addIssue({ code: "custom", message: "Invalid analytics bucket range.", path: ["bucketFrom"] });
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

export type AnalyticsCalculationComponent = {
  label: string;
  value: number | null;
  format: AnalyticsValueFormat;
  decimals?: number;
};

export type AnalyticsCalculation = {
  formula: string;
  scopeLabel: string;
  components: AnalyticsCalculationComponent[];
  includes?: string[];
  excludes?: string[];
};

export type AnalyticsMetricQuality = {
  status: AnalyticsQualityStatus;
  knownCount: number;
  eligibleCount: number;
  exactCount?: number;
  estimatedCount?: number;
  note?: string;
};

export type AnalyticsKpi = {
  id: string;
  label: string;
  description: string;
  value: number | null;
  comparisonValue?: number | null;
  format: AnalyticsValueFormat;
  decimals?: number;
  scope: "period" | "asOf";
  deltaPercent?: number | null;
  favorableDirection: "up" | "down" | "neutral";
  metric: string;
  calculation: AnalyticsCalculation;
  quality: AnalyticsMetricQuality;
};

export type AnalyticsDrilldown = {
  metric: string;
  segment?: string;
  bucketFrom?: string;
  bucketTo?: string;
  label?: string;
};

export type AnalyticsChartSeries = {
  key: string;
  label: string;
  format: AnalyticsValueFormat;
  decimals?: number;
  mark: "bar" | "line" | "dot";
  color: string;
  axis?: "left" | "right";
  stackId?: string;
};

export type AnalyticsPoint = {
  key: string;
  label: string;
  values: Record<string, number | null>;
  drilldowns?: Record<string, AnalyticsDrilldown>;
};

export type AnalyticsChart = {
  id: string;
  title: string;
  description: string;
  type: AnalyticsChartType;
  layout: "standard" | "wide";
  orientation?: "horizontal" | "vertical";
  series: AnalyticsChartSeries[];
  points: AnalyticsPoint[];
  overlapNotice?: string;
  emptyMessage?: string;
};

export type AnalyticsFilterOption = { value: string; label: string };

export type AnalyticsDataQuality = {
  exactLifecycleEvents: number;
  estimatedLifecycleEvents: number;
  partialMetricCount: number;
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
  kind: "Request" | "Quote" | "QuoteVersion" | "Project" | "Invoice";
  reference: string;
  title: string;
  client: string;
  trades: string[];
  status: string;
  owner: string;
  date: string;
  value?: number | null;
  valueFormat?: AnalyticsValueFormat;
  durationDays?: number;
  context?: string;
  precision?: "EXACT" | "ESTIMATED";
  href: string;
};

export type AnalyticsDetailsResponse = {
  metric: string;
  segment?: string;
  label: string;
  total: number;
  summary: string;
  valueLabel?: string;
  calculation?: AnalyticsCalculation;
  rows: AnalyticsDetailRow[];
  nextCursor?: string;
};
