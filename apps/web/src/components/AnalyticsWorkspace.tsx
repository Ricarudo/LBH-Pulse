"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion
} from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  Filter,
  Info,
  Layers3,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AnalyticsChart,
  AnalyticsChartSeries,
  AnalyticsDetailRow,
  AnalyticsDetailsResponse,
  AnalyticsDrilldown,
  AnalyticsKpi,
  AnalyticsPoint,
  AnalyticsResponse,
  AnalyticsValueFormat,
  AnalyticsView
} from "@pulse/contracts/analytics";
import { canUser } from "@pulse/contracts/auth";
import { apiRequest } from "@/lib/api/client";
import { usePulseAuth, usePulsePreferences } from "@/components/PulseShell";
import { ViewportPortal } from "@/components/ViewportPortal";

const viewLabels: Record<AnalyticsView, string> = {
  overview: "Overview",
  sales: "Sales",
  operations: "Operations",
  billing: "Billing"
};

const analyticsViewStorageKey = "pulse.analytics.view";
const donutColors = ["#2563eb", "#7c3aed", "#16a34a", "#0f9f8f", "#d97706", "#64748b"];

type SortKey = "reference" | "client" | "status" | "owner" | "date" | "value";
type SortDirection = "asc" | "desc";
type ChartDatum = Record<string, unknown> & { __point: AnalyticsPoint; label: string };

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(date: string, days: number) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function formatValue(
  value: number | null | undefined,
  format: AnalyticsValueFormat,
  decimals?: number,
  compact = true
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const resolvedDecimals = decimals ?? (format === "number" ? 0 : format === "duration" || format === "percent" ? 1 : 0);
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: compact && Math.abs(value) >= 10_000 ? 1 : resolvedDecimals
    }).format(value);
  }
  if (format === "percent") {
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: resolvedDecimals
    }).format(value);
  }
  if (format === "duration") return `${value.toFixed(resolvedDecimals)}d`;
  return new Intl.NumberFormat("en-US", {
    notation: compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: resolvedDecimals
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function defaultViewForUser(user: ReturnType<typeof usePulseAuth>["user"]): AnalyticsView {
  if (!user || user.isSystemAdmin) return "overview";
  if (user.role === "Sales" || /sales/i.test(user.roleLabel)) return "sales";
  if (user.role === "ProjectManager" || user.role === "Technician" || /project|technician|operations/i.test(user.roleLabel)) return "operations";
  if (canUser(user, "billing:read") && !canUser(user, "projects:read") && !canUser(user, "quotes:read")) return "billing";
  return "overview";
}

function iconForKpi(id: string) {
  if (/overdue/i.test(id)) return TriangleAlert;
  if (/time|duration|pay/i.test(id)) return Clock3;
  if (/invoice|value|pipeline|ar|margin/i.test(id)) return CircleDollarSign;
  if (/project|request/i.test(id)) return Layers3;
  return TrendingUp;
}

function AnimatedMetric({ kpi, reduced }: { kpi: AnalyticsKpi; reduced: boolean }) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(kpi.value ?? 0);
  useMotionValueEvent(motionValue, "change", setDisplay);

  useEffect(() => {
    if (kpi.value === null || reduced) {
      setDisplay(kpi.value ?? 0);
      motionValue.set(kpi.value ?? 0);
      return;
    }
    const controls = animate(motionValue, kpi.value, {
      duration: 0.48,
      ease: [0.22, 1, 0.36, 1]
    });
    return () => controls.stop();
  }, [kpi.value, motionValue, reduced]);

  if (kpi.value === null) return <span>—</span>;
  return <span>{formatValue(display, kpi.format, kpi.decimals)}</span>;
}

function qualityLabel(kpi: AnalyticsKpi) {
  if (kpi.quality.status === "unavailable") return "Unavailable";
  if (kpi.quality.status === "partial") return "Partial coverage";
  if (kpi.quality.status === "estimated") return "Estimated history";
  if (kpi.quality.status === "mixed") return "Mixed precision";
  return "Exact coverage";
}

function DeltaContext({ kpi }: { kpi: AnalyticsKpi }) {
  if (kpi.scope === "asOf") return <em className="is-neutral">End-of-period snapshot</em>;
  if (kpi.value === null) return <em className="is-neutral">Calculation unavailable</em>;
  if (kpi.comparisonValue === 0 && kpi.value === 0) return <em className="is-neutral">No change · both periods 0</em>;
  if (kpi.comparisonValue === 0) return <em className="is-neutral">Prior period was 0</em>;
  if (kpi.comparisonValue === null || kpi.comparisonValue === undefined) return <em className="is-neutral">No comparable history</em>;
  if (kpi.deltaPercent === null || kpi.deltaPercent === undefined) return <em className="is-neutral">Comparison unavailable</em>;

  const favorable = kpi.favorableDirection === "neutral"
    ? null
    : kpi.favorableDirection === "up"
      ? kpi.deltaPercent >= 0
      : kpi.deltaPercent <= 0;
  const className = favorable === null ? "is-neutral" : favorable ? "is-good" : "is-bad";
  return (
    <em className={className}>
      {kpi.deltaPercent >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(kpi.deltaPercent).toFixed(1)}% vs prior period
    </em>
  );
}

function KpiCard({
  kpi,
  index,
  selected,
  reduced,
  popoverOpen,
  onTogglePopover,
  onSelect
}: {
  kpi: AnalyticsKpi;
  index: number;
  selected: boolean;
  reduced: boolean;
  popoverOpen: boolean;
  onTogglePopover: () => void;
  onSelect: () => void;
}) {
  const Icon = iconForKpi(kpi.id);
  const popoverId = `analytics-kpi-formula-${kpi.id}`;
  return (
    <m.article
      className={`analytics-kpi${selected ? " is-selected" : ""}${popoverOpen ? " is-explaining" : ""}`}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.25, delay: reduced ? 0 : Math.min(index * 0.03, 0.18) }}
    >
      <span className="analytics-kpi-glow" aria-hidden="true" />
      <button type="button" className="analytics-kpi-open" onClick={onSelect}>
        <span className="analytics-kpi-heading"><span>{kpi.label}</span><Icon size={17} /></span>
        <strong><AnimatedMetric kpi={kpi} reduced={reduced} /></strong>
        <span className="analytics-kpi-context"><DeltaContext kpi={kpi} /></span>
        <small>{kpi.description}</small>
      </button>
      <button
        type="button"
        className="analytics-kpi-info"
        aria-label={`Explain how ${kpi.label} is calculated`}
        aria-expanded={popoverOpen}
        aria-describedby={popoverOpen ? popoverId : undefined}
        onClick={onTogglePopover}
      >
        <Info size={14} />
      </button>
      <span className={`analytics-quality-badge quality-${kpi.quality.status}`}>{qualityLabel(kpi)}</span>
      <div className="analytics-kpi-popover" id={popoverId} role="tooltip">
        <div className="analytics-kpi-popover-heading">
          <span><Info size={14} /> How this KPI is calculated</span>
          <button type="button" aria-label="Close calculation explanation" onClick={onTogglePopover}><X size={15} /></button>
        </div>
        <strong>{kpi.calculation.formula}</strong>
        <small>{kpi.calculation.scopeLabel}</small>
        <dl>
          {kpi.calculation.components.map((component) => (
            <div key={component.label}>
              <dt>{component.label}</dt>
              <dd>{formatValue(component.value, component.format, component.decimals, false)}</dd>
            </div>
          ))}
        </dl>
        {kpi.calculation.includes?.length ? <p><b>Includes</b>{kpi.calculation.includes.join(" · ")}</p> : null}
        {kpi.calculation.excludes?.length ? <p><b>Excludes</b>{kpi.calculation.excludes.join(" · ")}</p> : null}
        <p className={`analytics-kpi-quality-note quality-${kpi.quality.status}`}>
          <Database size={13} />
          <span><b>{qualityLabel(kpi)}</b>{kpi.quality.note ?? `${kpi.quality.knownCount} of ${kpi.quality.eligibleCount} eligible records are covered.`}</span>
        </p>
      </div>
    </m.article>
  );
}

function chartData(chart: AnalyticsChart): ChartDatum[] {
  return chart.points.map((point) => ({
    key: point.key,
    label: point.label,
    ...point.values,
    __point: point
  }));
}

function ChartTooltip({ active, payload, label, chart }: TooltipContentProps & { chart: AnalyticsChart }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-chart-tooltip">
      <strong>{String(label ?? payload[0]?.payload?.label ?? "")}</strong>
      {payload.map((item, index) => {
        const itemSeries = chart.series.find((candidate) => candidate.key === String(item.dataKey));
        if (!itemSeries || item.value === null || item.value === undefined) return null;
        return (
          <span key={`${String(item.dataKey)}-${index}`}>
            <i style={{ background: itemSeries.color }} />
            {itemSeries.label}: {formatValue(Number(item.value), itemSeries.format, itemSeries.decimals, false)}
          </span>
        );
      })}
    </div>
  );
}

function pointFromChartEvent(value: unknown): AnalyticsPoint | null {
  if (!value || typeof value !== "object") return null;
  const payload = "payload" in value ? (value as { payload?: unknown }).payload : value;
  if (!payload || typeof payload !== "object" || !("__point" in payload)) return null;
  return (payload as ChartDatum).__point;
}

function selectPointSeries(
  value: unknown,
  itemSeries: AnalyticsChartSeries,
  onSelect: (drilldown: AnalyticsDrilldown) => void
) {
  const point = pointFromChartEvent(value);
  const drilldown = point?.drilldowns?.[itemSeries.key];
  if (drilldown) onSelect(drilldown);
}

function VerticalChart({
  chart,
  reduced,
  onSelect
}: {
  chart: AnalyticsChart;
  reduced: boolean;
  onSelect: (drilldown: AnalyticsDrilldown) => void;
}) {
  const data = chartData(chart);
  const rightSeries = chart.series.some((item) => item.axis === "right");
  const isCombo = chart.type === "combo";
  const content = (
    <>
      <CartesianGrid vertical={false} stroke="var(--pulse-line)" strokeDasharray="3 6" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--pulse-muted)", fontSize: 10 }} />
      <YAxis yAxisId="left" tickLine={false} axisLine={false} width={54} tick={{ fill: "var(--pulse-muted)", fontSize: 10 }} />
      {rightSeries ? <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--pulse-muted)", fontSize: 10 }} /> : null}
      <Tooltip content={(props) => <ChartTooltip {...props} chart={chart} />} cursor={{ fill: "color-mix(in srgb, var(--pulse-blue) 6%, transparent)" }} />
      {chart.series.map((item) => item.mark === "bar" ? (
        <Bar
          key={item.key}
          dataKey={item.key}
          yAxisId={item.axis ?? "left"}
          fill={item.color}
          radius={[6, 6, 1, 1]}
          maxBarSize={44}
          isAnimationActive={!reduced}
          animationDuration={520}
          onClick={(entry) => selectPointSeries(entry, item, onSelect)}
          className="analytics-chart-mark"
        >
          {chart.series.length === 1 && chart.points.length <= 7 ? (
            <LabelList
              dataKey={item.key}
              position="top"
              formatter={(value: unknown) => formatValue(Number(value), item.format, item.decimals)}
              fill="var(--pulse-muted-strong)"
              fontSize={9}
            />
          ) : null}
        </Bar>
      ) : (
        <Line
          key={item.key}
          type="monotone"
          dataKey={item.key}
          yAxisId={item.axis ?? "right"}
          stroke={item.color}
          strokeWidth={3}
          dot={{ r: 3, fill: "var(--pulse-surface)", strokeWidth: 2 }}
          activeDot={{ r: 5, onClick: (entry: unknown) => selectPointSeries(entry, item, onSelect) }}
          connectNulls
          isAnimationActive={!reduced}
          animationDuration={520}
        />
      ))}
    </>
  );

  return (
    <div className="analytics-rechart" role="img" aria-label={`${chart.title}. ${chart.description}`}>
      <ResponsiveContainer width="100%" height="100%">
        {isCombo ? (
          <ComposedChart data={data} margin={{ top: 28, right: rightSeries ? 8 : 18, bottom: 4, left: 0 }} accessibilityLayer>
            {content}
          </ComposedChart>
        ) : (
          <BarChart data={data} margin={{ top: 28, right: 18, bottom: 4, left: 0 }} accessibilityLayer>
            {content}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function RankedChart({ chart, onSelect }: { chart: AnalyticsChart; onSelect: (drilldown: AnalyticsDrilldown) => void }) {
  const primary = chart.series[0];
  if (!primary) return null;
  const secondary = chart.series[1];
  const max = Math.max(...chart.points.map((point) => Math.abs(point.values[primary.key] ?? 0)), 1);
  return (
    <div className="analytics-ranked-chart">
      {chart.points.map((point) => {
        const value = point.values[primary.key];
        const primaryDrilldown = point.drilldowns?.[primary.key];
        const secondaryDrilldown = secondary ? point.drilldowns?.[secondary.key] : undefined;
        return (
          <div className="analytics-ranked-row" key={point.key}>
            <span className="analytics-ranked-label" title={point.label}>{point.label}</span>
            <button type="button" onClick={() => primaryDrilldown && onSelect(primaryDrilldown)} disabled={!primaryDrilldown}>
              <span className="analytics-ranked-track"><m.i style={{ background: primary.color }} animate={{ width: `${Math.max(2, (Math.abs(value ?? 0) / max) * 100)}%` }} /></span>
              <strong>{formatValue(value, primary.format, primary.decimals)}</strong>
            </button>
            {secondary ? (
              <button className="analytics-ranked-secondary" type="button" onClick={() => secondaryDrilldown && onSelect(secondaryDrilldown)} disabled={!secondaryDrilldown}>
                <i style={{ background: secondary.color }} />
                <span>{secondary.label}</span>
                <strong>{formatValue(point.values[secondary.key], secondary.format, secondary.decimals)}</strong>
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ chart, reduced, onSelect }: { chart: AnalyticsChart; reduced: boolean; onSelect: (drilldown: AnalyticsDrilldown) => void }) {
  const primary = chart.series[0];
  if (!primary) return null;
  const data = chartData(chart);
  const total = chart.points.reduce((sum, point) => sum + (point.values[primary.key] ?? 0), 0);
  return (
    <div className="analytics-donut-layout">
      <div className="analytics-donut-plot">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Tooltip content={(props) => <ChartTooltip {...props} chart={chart} />} />
            <Pie
              data={data}
              dataKey={primary.key}
              nameKey="label"
              innerRadius="61%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--pulse-surface)"
              strokeWidth={3}
              isAnimationActive={!reduced}
              animationDuration={520}
              onClick={(entry) => selectPointSeries(entry, primary, onSelect)}
            >
              {chart.points.map((point, index) => <Cell key={point.key} fill={donutColors[index % donutColors.length]} className="analytics-chart-mark" />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <span><strong>{formatValue(total, primary.format, primary.decimals)}</strong><small>{primary.label}</small></span>
      </div>
      <div className="analytics-donut-legend">
        {chart.points.map((point, index) => {
          const drilldown = point.drilldowns?.[primary.key];
          const secondary = chart.series[1];
          return (
            <button type="button" key={point.key} onClick={() => drilldown && onSelect(drilldown)} disabled={!drilldown}>
              <i style={{ background: donutColors[index % donutColors.length] }} />
              <span><strong>{point.label}</strong>{secondary ? <small>{formatValue(point.values[secondary.key], secondary.format, secondary.decimals)} {secondary.label.toLowerCase()}</small> : null}</span>
              <em>{formatValue(point.values[primary.key], primary.format, primary.decimals)}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StackedBarChart({ chart, onSelect }: { chart: AnalyticsChart; onSelect: (drilldown: AnalyticsDrilldown) => void }) {
  const point = chart.points[0];
  if (!point) return null;
  const total = sumValues(chart.series.map((item) => point.values[item.key]));
  return (
    <div className="analytics-stack-layout">
      <div className="analytics-stack-total"><span>{point.label}</span><strong>{formatValue(total, chart.series[0]?.format ?? "number")}</strong></div>
      <div className="analytics-stack-bar" aria-label={`${point.label}: ${formatValue(total, chart.series[0]?.format ?? "number")}`}>
        {chart.series.map((item) => {
          const value = point.values[item.key] ?? 0;
          const drilldown = point.drilldowns?.[item.key];
          return value ? (
            <button
              type="button"
              key={item.key}
              style={{ width: `${(value / Math.max(total, 1)) * 100}%`, background: item.color }}
              aria-label={`${item.label}: ${formatValue(value, item.format, item.decimals, false)}`}
              onClick={() => drilldown && onSelect(drilldown)}
              disabled={!drilldown}
            />
          ) : null;
        })}
      </div>
      <div className="analytics-stack-legend">
        {chart.series.map((item) => {
          const value = point.values[item.key] ?? 0;
          const drilldown = point.drilldowns?.[item.key];
          return (
            <button type="button" key={item.key} onClick={() => drilldown && onSelect(drilldown)} disabled={!drilldown}>
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
              <strong>{formatValue(value, item.format, item.decimals)}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function sumValues(values: Array<number | null | undefined>) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function ChartLegend({ chart }: { chart: AnalyticsChart }) {
  if (chart.type === "donut" || chart.type === "stackedBar") return null;
  return (
    <div className="analytics-series-legend" aria-label="Chart legend">
      {chart.series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
    </div>
  );
}

function ChartCard({
  chart,
  reduced,
  onSelect
}: {
  chart: AnalyticsChart;
  reduced: boolean;
  onSelect: (drilldown: AnalyticsDrilldown) => void;
}) {
  const hasValues = chart.points.some((point) => Object.values(point.values).some((value) => value !== null));
  return (
    <m.section
      className={`analytics-chart-card chart-${chart.type} layout-${chart.layout}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.3 }}
      aria-labelledby={`${chart.id}-title`}
    >
      <div className="analytics-card-heading">
        <div>
          <span className="analytics-eyebrow"><Sparkles size={12} /> Performance signal</span>
          <h2 id={`${chart.id}-title`}>{chart.title}</h2>
          <p>{chart.description}</p>
        </div>
        <BarChart3 size={19} aria-hidden="true" />
      </div>
      <ChartLegend chart={chart} />
      {chart.points.length && hasValues ? (
        chart.type === "donut" ? <DonutChart chart={chart} reduced={reduced} onSelect={onSelect} />
          : chart.type === "stackedBar" ? <StackedBarChart chart={chart} onSelect={onSelect} />
            : chart.orientation === "horizontal" ? <RankedChart chart={chart} onSelect={onSelect} />
              : <VerticalChart chart={chart} reduced={reduced} onSelect={onSelect} />
      ) : (
        <div className="analytics-empty-chart"><Sparkles size={22} /><strong>No activity in this selection</strong><span>{chart.emptyMessage ?? "Try a wider period or remove a filter."}</span></div>
      )}
      {chart.overlapNotice ? <p className="analytics-overlap-note"><Info size={12} /> {chart.overlapNotice}</p> : null}
    </m.section>
  );
}

function DetailRow({ row, index, reduced }: { row: AnalyticsDetailRow; index: number; reduced: boolean }) {
  const displayValue = row.value !== undefined
    ? formatValue(row.value, row.valueFormat ?? "currency", undefined, false)
    : row.durationDays === undefined ? "—" : formatValue(row.durationDays, "duration", 1, false);
  return (
    <m.tr
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: reduced ? 0.08 : 0.2, delay: reduced ? 0 : Math.min(index * 0.007, 0.18) }}
    >
      <td><span className={`analytics-kind kind-${row.kind.toLowerCase()}`}>{row.kind === "QuoteVersion" ? "QV" : row.kind.slice(0, 1)}</span><span><strong>{row.reference}</strong><small>{row.title}</small>{row.context ? <small>{row.context}</small> : null}</span></td>
      <td>{row.client}</td>
      <td><span className="analytics-trade-stack">{row.trades.slice(0, 2).map((trade) => <em key={trade}>{trade}</em>)}{row.trades.length > 2 ? <em>+{row.trades.length - 2}</em> : null}</span></td>
      <td><span className={`analytics-status status-${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></td>
      <td>{row.owner}</td>
      <td>{formatDate(row.date)}{row.precision === "ESTIMATED" ? <small className="analytics-inline-estimate">Estimated</small> : null}</td>
      <td className="analytics-money">{displayValue}</td>
      <td><Link href={row.href} aria-label={`Open ${row.reference}`}>Open <ArrowRight size={14} /></Link></td>
    </m.tr>
  );
}

function DetailMobileCard({ row }: { row: AnalyticsDetailRow }) {
  const displayValue = row.value !== undefined
    ? formatValue(row.value, row.valueFormat ?? "currency", undefined, false)
    : row.durationDays === undefined ? "—" : formatValue(row.durationDays, "duration", 1, false);
  return (
    <article className="analytics-detail-mobile-card">
      <div><span className={`analytics-kind kind-${row.kind.toLowerCase()}`}>{row.kind === "QuoteVersion" ? "QV" : row.kind.slice(0, 1)}</span><span><strong>{row.reference}</strong><small>{row.title}</small></span><span className={`analytics-status status-${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></div>
      <dl>
        <div><dt>Client</dt><dd>{row.client}</dd></div>
        <div><dt>Date</dt><dd>{formatDate(row.date)}</dd></div>
        <div><dt>Owner</dt><dd>{row.owner}</dd></div>
        <div><dt>Value</dt><dd>{displayValue}</dd></div>
      </dl>
      {row.context ? <p>{row.context}</p> : null}
      <Link href={row.href}>Open record <ArrowRight size={14} /></Link>
    </article>
  );
}

function DetailPanel({
  details,
  loading,
  page,
  sort,
  direction,
  modal,
  reduced,
  onSort,
  onPage,
  onClose
}: {
  details: AnalyticsDetailsResponse | null;
  loading: boolean;
  page: number;
  sort: SortKey;
  direction: SortDirection;
  modal: boolean;
  reduced: boolean;
  onSort: (sort: SortKey) => void;
  onPage: (page: number) => void;
  onClose: () => void;
}) {
  const shellRef = useRef<HTMLElement | null>(null);
  const rows = details?.rows ?? [];
  useEffect(() => {
    shellRef.current?.focus({ preventScroll: true });
  }, []);
  const header = (label: string, key: SortKey) => (
    <button type="button" className={sort === key ? "is-active" : ""} onClick={() => onSort(key)}>
      {label}<ArrowUpDown size={11} />{sort === key ? <span className="sr-only">sorted {direction === "asc" ? "ascending" : "descending"}</span> : null}
    </button>
  );
  const panel = (
    <div className="analytics-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <m.aside
        ref={shellRef}
        className="analytics-detail-shell"
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby="analytics-detail-title"
        aria-describedby="analytics-detail-summary"
        aria-busy={loading}
        tabIndex={-1}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="analytics-detail-heading">
          <div><span className="analytics-eyebrow"><Database size={12} /> Calculation evidence</span><h2 id="analytics-detail-title">{details?.label ?? "Loading detail…"}</h2><p id="analytics-detail-summary">{details?.summary ?? "Loading the exact records behind this selection."}</p></div>
          <div><span className="analytics-live-indicator"><i /> On demand</span><button type="button" className="analytics-detail-close" onClick={onClose}><X size={16} /> Close</button></div>
        </div>
        <div className="analytics-table-frame">
          {loading ? <div className="analytics-table-shimmer" aria-label="Loading detail records" /> : null}
          <table>
            <thead><tr><th>{header("Record", "reference")}</th><th>{header("Client", "client")}</th><th>Trades</th><th>{header("Status", "status")}</th><th>{header("Owner", "owner")}</th><th>{header("Date", "date")}</th><th>{header(details?.valueLabel ?? "Value", "value")}</th><th><span className="sr-only">Action</span></th></tr></thead>
            <AnimatePresence initial={false} mode="popLayout">
              <tbody key={`${details?.metric}-${details?.segment}-${page}-${sort}-${direction}`}>
                {rows.map((row, index) => <DetailRow key={row.id} row={row} index={index} reduced={reduced} />)}
              </tbody>
            </AnimatePresence>
          </table>
          {!loading && !rows.length ? <div className="analytics-empty-table"><Sparkles size={22} /><strong>No matching records</strong><span>This metric may be unavailable or the selected bucket is empty.</span></div> : null}
        </div>
        <div className="analytics-detail-mobile-list">
          {loading ? <div className="analytics-table-shimmer" aria-label="Loading detail records" /> : rows.map((row) => <DetailMobileCard key={row.id} row={row} />)}
          {!loading && !rows.length ? <div className="analytics-empty-table"><Sparkles size={22} /><strong>No matching records</strong></div> : null}
        </div>
        <div className="analytics-pagination"><span>Page {page + 1} · {details?.total ?? 0} records</span><div><button type="button" disabled={page === 0 || loading} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /> Previous</button><button type="button" disabled={!details?.nextCursor || loading} onClick={() => onPage(page + 1)}>Next <ChevronRight size={15} /></button></div></div>
      </m.aside>
    </div>
  );
  return modal ? <ViewportPortal>{panel}</ViewportPortal> : panel;
}

export function AnalyticsWorkspace() {
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = usePulseAuth();
  const { workspace, motionMode } = usePulsePreferences();
  const prefersReduced = useReducedMotion();
  const reduced = Boolean(prefersReduced || motionMode === "subtle");
  const initialView = searchParams.get("view") as AnalyticsView | null;
  const [view, setView] = useState<AnalyticsView>(initialView && initialView in viewLabels ? initialView : "overview");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [preset, setPreset] = useState<"30" | "90" | "ytd" | "custom">(from ? "custom" : "30");
  const [trade, setTrade] = useState(searchParams.get("trade") ?? "");
  const [owner, setOwner] = useState(searchParams.get("owner") ?? "");
  const [clientId, setClientId] = useState(searchParams.get("clientId") ?? "");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [details, setDetails] = useState<AnalyticsDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selected, setSelected] = useState<AnalyticsDrilldown | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [detailModal, setDetailModal] = useState(false);
  const [openKpi, setOpenKpi] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const detailReturnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mobileFilters = window.matchMedia("(max-width: 639px)");
    const mobileDetails = window.matchMedia("(max-width: 767px)");
    const syncResponsiveState = () => {
      setFiltersOpen(!mobileFilters.matches);
      setDetailModal(mobileDetails.matches);
    };
    syncResponsiveState();
    mobileFilters.addEventListener("change", syncResponsiveState);
    mobileDetails.addEventListener("change", syncResponsiveState);
    return () => {
      mobileFilters.removeEventListener("change", syncResponsiveState);
      mobileDetails.removeEventListener("change", syncResponsiveState);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openKpi) setOpenKpi(null);
      else if (selected) closeDetails();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openKpi, selected]);

  useEffect(() => {
    if (!user || initialView) return;
    const saved = window.localStorage.getItem(analyticsViewStorageKey) as AnalyticsView | null;
    setView(saved && saved in viewLabels ? saved : defaultViewForUser(user));
  }, [initialView, user]);

  const params = useMemo(() => {
    const next = new URLSearchParams({ view });
    if (from && to) { next.set("from", from); next.set("to", to); }
    if (trade) next.set("trade", trade);
    if (owner) next.set("owner", owner);
    if (clientId) next.set("clientId", clientId);
    return next;
  }, [clientId, from, owner, to, trade, view]);

  useEffect(() => {
    window.history.replaceState(null, "", `/statistics?${params.toString()}`);
    window.localStorage.setItem(analyticsViewStorageKey, view);
  }, [params, view]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiRequest<AnalyticsResponse>(`/api/analytics?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        setData(response);
        setSelected(null);
        setDetails(null);
        if (!response.availableViews.includes(view)) setView(response.availableViews[0] ?? "overview");
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load analytics.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [params, refreshKey, user, view]);

  const loadDetails = useCallback(async (
    drilldown: AnalyticsDrilldown,
    nextPage = 0,
    nextSort: SortKey = sort,
    nextDirection: SortDirection = direction
  ) => {
    const requestId = ++detailRequest.current;
    setDetailsLoading(true);
    setSelected(drilldown);
    setPage(nextPage);
    const detailParams = new URLSearchParams(params);
    detailParams.set("metric", drilldown.metric);
    detailParams.set("take", "25");
    detailParams.set("sort", nextSort);
    detailParams.set("direction", nextDirection);
    if (drilldown.segment) detailParams.set("segment", drilldown.segment);
    if (drilldown.bucketFrom) detailParams.set("bucketFrom", drilldown.bucketFrom);
    if (drilldown.bucketTo) detailParams.set("bucketTo", drilldown.bucketTo);
    if (nextPage) detailParams.set("cursor", String(nextPage * 25));
    try {
      const response = await apiRequest<AnalyticsDetailsResponse>(`/api/analytics/details?${detailParams.toString()}`, { cache: "no-store" });
      if (requestId === detailRequest.current) setDetails(response);
    } catch (reason) {
      if (requestId === detailRequest.current) setError(reason instanceof Error ? reason.message : "Unable to load analytics detail.");
    } finally {
      if (requestId === detailRequest.current) setDetailsLoading(false);
    }
  }, [direction, params, sort]);

  function applyPreset(next: "30" | "90" | "ytd" | "custom") {
    setPreset(next);
    if (next === "custom") return;
    const today = localDate(workspace.timeZone);
    setTo(today);
    setFrom(next === "30" ? shiftDate(today, -29) : next === "90" ? shiftDate(today, -89) : `${today.slice(0, 4)}-01-01`);
  }

  function selectDetail(drilldown: AnalyticsDrilldown) {
    detailReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSort("date");
    setDirection("desc");
    void loadDetails(drilldown, 0, "date", "desc");
    window.requestAnimationFrame(() => document.querySelector(".analytics-detail-shell")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
  }

  function closeDetails() {
    const returnFocus = detailReturnFocus.current;
    detailReturnFocus.current = null;
    setSelected(null);
    setDetails(null);
    window.requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
  }

  function changeSort(next: SortKey) {
    if (!selected) return;
    const nextDirection = sort === next ? direction === "asc" ? "desc" : "asc" : next === "date" || next === "value" ? "desc" : "asc";
    setSort(next);
    setDirection(nextDirection);
    void loadDetails(selected, 0, next, nextDirection);
  }

  if (authLoading || (loading && !data)) return <AnalyticsSkeleton />;

  return (
    <main className="analytics-workspace">
      <div className="analytics-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="analytics-content">
        <header className="analytics-hero">
          <m.div initial={reduced ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
            <span className="analytics-eyebrow"><Sparkles size={13} /> Pulse intelligence</span>
            <h1>Analytics</h1>
            <p>Company performance, from first request to final invoice.</p>
          </m.div>
          <div className="analytics-hero-meta"><span className="analytics-live-indicator"><i /> Live workspace data</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={15} className={loading ? "is-spinning" : ""} /> Refresh</button></div>
        </header>

        <section className="analytics-command-bar" aria-label="Analytics controls">
          <nav className="analytics-tabs" aria-label="Analytics views">
            {(data?.availableViews ?? ["overview", "sales", "operations", "billing"]).map((item) => (
              <button type="button" key={item} className={view === item ? "is-active" : ""} onClick={() => setView(item)}>
                {view === item ? <m.span layoutId="analytics-tab-indicator" className="analytics-tab-indicator" transition={{ type: "spring", bounce: 0.12, duration: reduced ? 0.1 : 0.38 }} /> : null}
                <span>{viewLabels[item]}</span>
              </button>
            ))}
          </nav>
          <div className="analytics-periods" aria-label="Date range presets">
            {(["30", "90", "ytd", "custom"] as const).map((item) => <button type="button" key={item} className={preset === item ? "is-active" : ""} onClick={() => applyPreset(item)}>{item === "30" ? "30D" : item === "90" ? "90D" : item === "ytd" ? "YTD" : "Custom"}</button>)}
          </div>
        </section>

        <section className="analytics-filters" aria-label="Analytics filters">
          <button className="analytics-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="analytics-filter-fields" onClick={() => setFiltersOpen((current) => !current)}>
            <span><Filter size={15} /> Refine intelligence</span><ChevronDown size={15} aria-hidden="true" />
          </button>
          <div className="analytics-filter-fields" id="analytics-filter-fields" hidden={!filtersOpen}>
            <label><span>Trade</span><select value={trade} onChange={(event) => setTrade(event.target.value)}><option value="">All trades</option>{data?.filters.trades.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">All owners</option>{data?.filters.owners.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label><span>Client</span><select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">All clients</option>{data?.filters.clients.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {preset === "custom" ? <><label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></> : null}
            <small><CalendarDays size={13} /><span>{data?.range.label ?? "Latest 30 days"}</span><em>vs {data?.range.comparisonLabel}</em></small>
          </div>
        </section>

        {error ? <div className="analytics-error" role="alert"><TriangleAlert size={18} /><span><strong>Analytics signal interrupted</strong>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div> : null}
        {data?.dataQuality.message ? <div className="analytics-quality"><Clock3 size={15} /><span>{data.dataQuality.message}</span><strong>{data.dataQuality.exactLifecycleEvents} exact · {data.dataQuality.estimatedLifecycleEvents} estimated</strong></div> : null}

        <section className="analytics-kpi-grid" aria-label={`${viewLabels[view]} key performance indicators`}>
          {data?.kpis.map((item, index) => <KpiCard key={item.id} kpi={item} index={index} selected={selected?.metric === item.metric && !selected.segment && !selected.bucketFrom} reduced={reduced} popoverOpen={openKpi === item.id} onTogglePopover={() => setOpenKpi((current) => current === item.id ? null : item.id)} onSelect={() => selectDetail({ metric: item.metric, label: item.label })} />)}
        </section>

        <div className="analytics-chart-grid">
          {data?.charts.map((chart) => <ChartCard key={chart.id} chart={chart} reduced={reduced} onSelect={selectDetail} />)}
        </div>

        {!selected ? <section className="analytics-detail-prompt"><Database size={20} /><span><strong>Explore the evidence</strong><small>Select any KPI, chart mark, or chart legend item to load its exact records. Nothing is fetched until you ask.</small></span></section> : null}
        {selected ? <DetailPanel details={details} loading={detailsLoading} page={page} sort={sort} direction={direction} modal={detailModal} reduced={reduced} onSort={changeSort} onPage={(nextPage) => void loadDetails(selected, nextPage)} onClose={closeDetails} /> : null}
      </div>
    </main>
  );
}

function AnalyticsSkeleton() {
  return <main className="analytics-workspace analytics-skeleton" aria-label="Loading analytics"><div className="analytics-aurora" aria-hidden="true" /><div className="analytics-content"><div className="analytics-skeleton-hero" /><div className="analytics-kpi-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} />)}</div><div className="analytics-chart-grid"><div /><div /></div></div></main>;
}
