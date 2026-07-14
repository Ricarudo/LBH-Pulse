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
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
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
  Filter,
  Layers3,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TriangleAlert
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
  AnalyticsDetailRow,
  AnalyticsDetailsResponse,
  AnalyticsKpi,
  AnalyticsResponse,
  AnalyticsValueFormat,
  AnalyticsView
} from "@pulse/contracts/analytics";
import { canUser } from "@pulse/contracts/auth";
import { apiRequest } from "@/lib/api/client";
import { usePulseAuth, usePulsePreferences } from "@/components/PulseShell";

const viewLabels: Record<AnalyticsView, string> = {
  overview: "Overview",
  sales: "Sales",
  operations: "Operations",
  billing: "Billing"
};

const analyticsViewStorageKey = "pulse.analytics.view";

function localDate(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(date: string, days: number) {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function formatValue(value: number | null, format: AnalyticsValueFormat, estimated = false) {
  if (value === null || Number.isNaN(value)) return "—";
  const prefix = estimated ? "~" : "";
  if (format === "currency") {
    return `${prefix}${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0
    }).format(value)}`;
  }
  if (format === "percent") return `${prefix}${new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value)}`;
  if (format === "duration") return `${prefix}${value < 10 ? value.toFixed(1) : Math.round(value)}d`;
  return `${prefix}${new Intl.NumberFormat("en-US", { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)}`;
}

function defaultViewForUser(user: ReturnType<typeof usePulseAuth>["user"]): AnalyticsView {
  if (!user) return "overview";
  if (user.isSystemAdmin) return "overview";
  if (user.role === "Sales" || /sales/i.test(user.roleLabel)) return "sales";
  if (user.role === "ProjectManager" || user.role === "Technician" || /project|technician|operations/i.test(user.roleLabel)) return "operations";
  if (canUser(user, "billing:read") && !canUser(user, "projects:read") && !canUser(user, "quotes:read")) return "billing";
  return "overview";
}

function iconForKpi(id: string) {
  if (/time|duration|pay/i.test(id)) return Clock3;
  if (/invoice|value|pipeline|ar|margin/i.test(id)) return CircleDollarSign;
  if (/overdue/i.test(id)) return TriangleAlert;
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
  return <span>{formatValue(display, kpi.format, kpi.estimated)}</span>;
}

function KpiCard({
  kpi,
  index,
  selected,
  reduced,
  onSelect
}: {
  kpi: AnalyticsKpi;
  index: number;
  selected: boolean;
  reduced: boolean;
  onSelect: () => void;
}) {
  const Icon = iconForKpi(kpi.id);
  return (
    <m.button
      type="button"
      className={`analytics-kpi${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.1 : 0.25, delay: reduced ? 0 : Math.min(index * 0.03, 0.18) }}
    >
      <span className="analytics-kpi-glow" aria-hidden="true" />
      <span className="analytics-kpi-heading"><span>{kpi.label}</span><Icon size={17} /></span>
      <strong><AnimatedMetric kpi={kpi} reduced={reduced} /></strong>
      <span className="analytics-kpi-context">
        {kpi.deltaPercent === undefined || kpi.deltaPercent === null || kpi.snapshot ? (
          <em>{kpi.snapshot ? "Current snapshot" : "No comparable history"}</em>
        ) : (
          <em className={kpi.deltaPercent >= 0 ? "is-up" : "is-down"}>
            {kpi.deltaPercent >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(kpi.deltaPercent).toFixed(1)}% vs prior period
          </em>
        )}
      </span>
      <small>{kpi.description}</small>
      {kpi.estimated ? <span className="analytics-estimate-badge">Estimated history</span> : null}
    </m.button>
  );
}

function ChartTooltip({ active, payload, label, chart }: TooltipContentProps & { chart: AnalyticsChart }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-chart-tooltip">
      <strong>{String(label ?? "")}</strong>
      {payload.map((item, index) => (
        <span key={`${String(item.dataKey)}-${index}`}>
          <i style={{ background: item.color }} />
          {item.dataKey === "secondaryValue" ? chart.secondaryLabel : item.dataKey === "tertiaryValue" ? "Invoiced" : chart.valueLabel}: {formatValue(Number(item.value ?? 0), item.dataKey === "secondaryValue" ? chart.secondaryFormat ?? chart.format : chart.format)}
        </span>
      ))}
    </div>
  );
}

function ChartCard({
  chart,
  reduced,
  selectedSegment,
  onSelect
}: {
  chart: AnalyticsChart;
  reduced: boolean;
  selectedSegment?: string;
  onSelect: (metric: string, segment?: string, label?: string) => void;
}) {
  const chartKey = `${chart.id}-${chart.points.map((point) => `${point.key}:${point.value}`).join("|")}`;
  return (
    <m.section
      className={`analytics-chart-card chart-${chart.type}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.3 }}
      aria-labelledby={`${chart.id}-title`}
    >
      <div className="analytics-card-heading">
        <div><span className="analytics-eyebrow"><Sparkles size={12} /> Live intelligence</span><h2 id={`${chart.id}-title`}>{chart.title}</h2><p>{chart.description}</p></div>
        <BarChart3 size={19} aria-hidden="true" />
      </div>
      {chart.points.length ? (
        chart.type === "bar" || chart.type === "funnel" ? (
          <div className={`analytics-bars${chart.type === "funnel" ? " is-funnel" : ""}`}>
            {chart.points.map((point, index) => {
              const max = Math.max(...chart.points.map((item) => Math.abs(item.value)), 1);
              const width = chart.type === "funnel"
                ? Math.max(24, 100 - index * (65 / Math.max(chart.points.length - 1, 1)))
                : Math.max(3, (Math.abs(point.value) / max) * 100);
              return (
                <m.button
                  type="button"
                  key={point.key}
                  className={selectedSegment === point.segment ? "is-selected" : ""}
                  onClick={() => onSelect(chart.metric, point.segment, `${chart.title}: ${point.label}`)}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduced ? 0 : index * 0.035, duration: 0.24 }}
                >
                  <span className="analytics-bar-label"><strong>{point.label}</strong><small>{formatValue(point.value, chart.format)}</small></span>
                  <span className="analytics-bar-track"><m.i initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: 1, width: `${width}%` }} transition={{ duration: reduced ? 0.1 : 0.5, delay: reduced ? 0 : index * 0.035 }} /></span>
                  {point.secondaryValue !== undefined ? <em>{chart.secondaryLabel}: {formatValue(point.secondaryValue, chart.secondaryFormat ?? chart.format)}</em> : null}
                </m.button>
              );
            })}
          </div>
        ) : (
          <div className="analytics-rechart" key={chartKey} role="img" aria-label={`${chart.title}. ${chart.description}`}>
            <ResponsiveContainer width="100%" height="100%">
              {chart.type === "line" ? (
                <LineChart data={chart.points} margin={{ top: 12, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="var(--pulse-line)" strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--pulse-muted)", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={42} tick={{ fill: "var(--pulse-muted)", fontSize: 11 }} />
                  <Tooltip content={(props) => <ChartTooltip {...props} chart={chart} />} cursor={{ stroke: "var(--pulse-blue)", strokeOpacity: 0.25 }} />
                  <Line dataKey="value" stroke="var(--pulse-blue)" strokeWidth={3} dot={{ r: 3, fill: "var(--pulse-surface)" }} activeDot={{ r: 5 }} isAnimationActive={!reduced} animationDuration={520} />
                  {chart.points.some((point) => point.secondaryValue !== undefined) ? <Line dataKey="secondaryValue" stroke="var(--pulse-violet, #8b5cf6)" strokeWidth={2} dot={false} isAnimationActive={!reduced} animationDuration={560} /> : null}
                </LineChart>
              ) : (
                <AreaChart data={chart.points} margin={{ top: 12, right: 14, bottom: 0, left: 0 }} accessibilityLayer onClick={(state) => {
                  const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : -1;
                  const point = chart.points[index];
                  if (point) onSelect(chart.metric, point.segment ?? point.key, `${chart.title}: ${point.label}`);
                }}>
                  <defs>
                    <linearGradient id={`${chart.id}-primary`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--pulse-blue)" stopOpacity=".42" /><stop offset="100%" stopColor="var(--pulse-blue)" stopOpacity=".02" /></linearGradient>
                    <linearGradient id={`${chart.id}-secondary`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".28" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity=".02" /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--pulse-line)" strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--pulse-muted)", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--pulse-muted)", fontSize: 11 }} tickFormatter={(value) => formatValue(Number(value), chart.format)} />
                  <Tooltip content={(props) => <ChartTooltip {...props} chart={chart} />} />
                  <Area dataKey="value" type="monotone" stroke="var(--pulse-blue)" strokeWidth={2.5} fill={`url(#${chart.id}-primary)`} isAnimationActive={!reduced} animationDuration={520} />
                  {chart.points.some((point) => point.secondaryValue !== undefined) ? <Area dataKey="secondaryValue" type="monotone" stroke="#8b5cf6" strokeWidth={2} fill={`url(#${chart.id}-secondary)`} isAnimationActive={!reduced} animationDuration={560} /> : null}
                  {chart.points.some((point) => point.tertiaryValue !== undefined) ? <Area dataKey="tertiaryValue" type="monotone" stroke="#14b8a6" strokeWidth={2} fill="transparent" isAnimationActive={!reduced} animationDuration={600} /> : null}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        )
      ) : <div className="analytics-empty-chart"><BarChart3 size={25} /><strong>No activity in this range</strong><span>Try a broader date window or clear filters.</span></div>}
      {chart.overlapNotice ? <p className="analytics-overlap-note">Multi-trade work appears in every applicable trade; totals overlap.</p> : null}
    </m.section>
  );
}

type SortKey = "reference" | "client" | "status" | "owner" | "date" | "value";

function DetailTable({
  details,
  loading,
  page,
  sort,
  direction,
  reduced,
  onSort,
  onPage
}: {
  details: AnalyticsDetailsResponse | null;
  loading: boolean;
  page: number;
  sort: SortKey;
  direction: "asc" | "desc";
  reduced: boolean;
  onSort: (key: SortKey) => void;
  onPage: (page: number) => void;
}) {
  const rows = useMemo(() => [...(details?.rows ?? [])].sort((a, b) => {
    const left = a[sort] ?? "";
    const right = b[sort] ?? "";
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return direction === "asc" ? result : -result;
  }), [details, direction, sort]);
  const header = (label: string, key: SortKey) => (
    <button type="button" onClick={() => onSort(key)} aria-label={`Sort by ${label}`} className={sort === key ? "is-active" : ""}>{label}<ArrowUpDown size={12} /></button>
  );
  return (
    <section className="analytics-detail-shell" aria-labelledby="analytics-detail-title">
      <div className="analytics-detail-heading">
        <div><span className="analytics-eyebrow"><Layers3 size={12} /> Drill-down</span><h2 id="analytics-detail-title">Decision detail</h2><p aria-live="polite">{loading ? "Loading matching records…" : details?.summary ?? "Select a KPI or chart segment to inspect the records behind it."}</p></div>
        <span className="analytics-live-indicator"><i /> Live records</span>
      </div>
      <div className={`analytics-table-frame${loading ? " is-loading" : ""}`}>
        {loading ? <div className="analytics-table-shimmer" aria-hidden="true" /> : null}
        <table>
          <thead><tr><th>{header("Record", "reference")}</th><th>{header("Client", "client")}</th><th>Trades</th><th>{header("Status", "status")}</th><th>{header("Owner", "owner")}</th><th>{header("Date", "date")}</th><th>{header("Value", "value")}</th><th><span className="sr-only">Action</span></th></tr></thead>
          <AnimatePresence initial={false} mode="popLayout">
            <tbody key={`${details?.metric}-${details?.segment}-${page}`}>
              {rows.map((row, index) => <DetailRow key={row.id} row={row} index={index} reduced={reduced} />)}
            </tbody>
          </AnimatePresence>
        </table>
        {!loading && !rows.length ? <div className="analytics-empty-table"><Sparkles size={22} /><strong>No matching records</strong><span>Choose another metric or remove a filter.</span></div> : null}
      </div>
      <div className="analytics-pagination"><span>Page {page + 1}</span><div><button type="button" disabled={page === 0 || loading} onClick={() => onPage(page - 1)}><ChevronLeft size={15} /> Previous</button><button type="button" disabled={!details?.nextCursor || loading} onClick={() => onPage(page + 1)}>Next <ChevronRight size={15} /></button></div></div>
    </section>
  );
}

function DetailRow({ row, index, reduced }: { row: AnalyticsDetailRow; index: number; reduced: boolean }) {
  return (
    <m.tr
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: reduced ? 0.08 : 0.2, delay: reduced ? 0 : Math.min(index * 0.007, 0.18) }}
    >
      <td><span className={`analytics-kind kind-${row.kind.toLowerCase()}`}>{row.kind.slice(0, 1)}</span><span><strong>{row.reference}</strong><small>{row.title}</small></span></td>
      <td>{row.client}</td>
      <td><span className="analytics-trade-stack">{row.trades.slice(0, 2).map((trade) => <em key={trade}>{trade}</em>)}{row.trades.length > 2 ? <em>+{row.trades.length - 2}</em> : null}</span></td>
      <td><span className={`analytics-status status-${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></td>
      <td>{row.owner}</td>
      <td>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(row.date))}</td>
      <td className="analytics-money">{row.value === undefined ? row.durationDays === undefined ? "—" : `${row.durationDays.toFixed(1)}d` : formatValue(row.value, "currency")}</td>
      <td><Link href={row.href} aria-label={`Open ${row.reference}`}>Open <ArrowRight size={14} /></Link></td>
    </m.tr>
  );
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
  const [metric, setMetric] = useState("recent");
  const [segment, setSegment] = useState<string | undefined>();
  const [detailLabel, setDetailLabel] = useState("Recent records");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const detailRequest = useRef(0);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 639px)");
    const syncFilterSheet = () => setFiltersOpen(!mobile.matches);
    syncFilterSheet();
    mobile.addEventListener("change", syncFilterSheet);
    return () => mobile.removeEventListener("change", syncFilterSheet);
  }, []);

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
        if (!response.availableViews.includes(view)) setView(response.availableViews[0] ?? "overview");
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Unable to load analytics.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [params, refreshKey, user, view]);

  const loadDetails = useCallback(async (nextMetric = metric, nextSegment = segment, nextPage = page, label = detailLabel) => {
    const requestId = ++detailRequest.current;
    setDetailsLoading(true);
    setMetric(nextMetric);
    setSegment(nextSegment);
    setDetailLabel(label);
    setPage(nextPage);
    const detailParams = new URLSearchParams(params);
    detailParams.set("metric", nextMetric);
    detailParams.set("take", "25");
    if (nextSegment) detailParams.set("segment", nextSegment);
    if (nextPage) detailParams.set("cursor", String(nextPage * 25));
    try {
      const response = await apiRequest<AnalyticsDetailsResponse>(`/api/analytics/details?${detailParams.toString()}`, { cache: "no-store" });
      if (requestId === detailRequest.current) setDetails(response);
    } catch (reason) {
      if (requestId === detailRequest.current) setError(reason instanceof Error ? reason.message : "Unable to load analytics detail.");
    } finally {
      if (requestId === detailRequest.current) setDetailsLoading(false);
    }
  }, [detailLabel, metric, page, params, segment]);

  useEffect(() => {
    if (!data) return;
    void loadDetails("recent", undefined, 0, `${viewLabels[view]} records`);
  }, [data?.generatedAt]);

  function applyPreset(next: "30" | "90" | "ytd" | "custom") {
    setPreset(next);
    if (next === "custom") return;
    const today = localDate(workspace.timeZone);
    setTo(today);
    setFrom(next === "30" ? shiftDate(today, -29) : next === "90" ? shiftDate(today, -89) : `${today.slice(0, 4)}-01-01`);
  }

  function selectDetail(nextMetric: string, nextSegment?: string, label?: string) {
    void loadDetails(nextMetric, nextSegment, 0, label ?? "Selected records");
    window.requestAnimationFrame(() => document.querySelector(".analytics-detail-shell")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
  }

  function changeSort(next: SortKey) {
    if (sort === next) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "date" || next === "value" ? "desc" : "asc"); }
  }

  if (authLoading || (loading && !data)) return <AnalyticsSkeleton />;

  return (
    <main className="analytics-workspace">
      <div className="analytics-aurora" aria-hidden="true"><i /><i /><i /></div>
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
      {data?.dataQuality.message ? <div className="analytics-quality"><Clock3 size={15} /><span>{data.dataQuality.message}</span><strong>{data.dataQuality.exactLifecycleEvents} exact events</strong></div> : null}

      <section className="analytics-kpi-grid" aria-label={`${viewLabels[view]} key performance indicators`}>
        {data?.kpis.map((item, index) => <KpiCard key={item.id} kpi={item} index={index} selected={metric === item.metric && !segment} reduced={reduced} onSelect={() => selectDetail(item.metric, undefined, item.label)} />)}
      </section>

      <div className="analytics-chart-grid">
        {data?.charts.map((chart) => <ChartCard key={chart.id} chart={chart} reduced={reduced} selectedSegment={metric === chart.metric ? segment : undefined} onSelect={selectDetail} />)}
      </div>

      <DetailTable details={details} loading={detailsLoading} page={page} sort={sort} direction={direction} reduced={reduced} onSort={changeSort} onPage={(nextPage) => void loadDetails(metric, segment, nextPage, detailLabel)} />
    </main>
  );
}

function AnalyticsSkeleton() {
  return <main className="analytics-workspace analytics-skeleton" aria-label="Loading analytics"><div className="analytics-aurora" aria-hidden="true" /><div className="analytics-skeleton-hero" /> <div className="analytics-kpi-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} />)}</div><div className="analytics-chart-grid"><div /><div /></div></main>;
}
