"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Blocks,
  CalendarDays,
  Check,
  ClipboardCheck,
  EyeOff,
  GripVertical,
  LayoutDashboard,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  X
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { canRole } from "@/lib/auth/permissions";
import {
  dashboardGreeting,
  dashboardWidgetCatalog,
  defaultDashboardPreferences,
  normalizeDashboardPreferences
} from "@/lib/dashboard";
import { formatWorkspaceDate } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { usePulsePreferences } from "@/components/PulseShell";
import type {
  DashboardAttentionSummary,
  DashboardDataResponse,
  DashboardPreferencesRecord,
  DashboardScope,
  DashboardTiming,
  DashboardWidgetId,
  DashboardWidgetPlacement,
  DashboardWorkItem
} from "@/types/dashboard";

type AttentionFilter =
  | "all"
  | "overdue"
  | "today"
  | "upcoming"
  | "attention"
  | "unassigned";

const workQueuePageSize = 6;
const upcomingDatesPageSize = 8;
const recentActivityPageSize = 10;

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Dashboard request failed."
    );
  }
  return data as T;
}

function widgetTitle(id: DashboardWidgetId) {
  return dashboardWidgetCatalog.find((widget) => widget.id === id)?.title ?? id;
}

function timingLabel(timing: DashboardTiming, dueDate?: string) {
  if (timing === "overdue") return dueDate ? `Overdue · ${formatWorkspaceDate(dueDate)}` : "Overdue";
  if (timing === "today") return "Due today";
  if (timing === "upcoming") return dueDate ? `Due ${formatWorkspaceDate(dueDate)}` : "Due soon";
  if (dueDate) return `Due ${formatWorkspaceDate(dueDate)}`;
  return "No due date";
}

function groupScheduleDate(date: string, businessDate: string) {
  const difference = Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${businessDate}T12:00:00Z`)) /
      86_400_000
  );
  if (difference < 0) return "Overdue";
  if (difference === 0) return "Today";
  if (difference <= 7) return "This week";
  return "Next week";
}

function visibleWorkItems(items: DashboardWorkItem[], filter: AttentionFilter) {
  if (filter === "overdue") return items.filter((item) => item.timing === "overdue");
  if (filter === "today") return items.filter((item) => item.timing === "today");
  if (filter === "upcoming") return items.filter((item) => item.timing === "upcoming");
  if (filter === "attention") {
    return items.filter((item) => item.attentionReasons.length > 0);
  }
  if (filter === "unassigned") {
    return items.filter((item) => !item.owner || item.owner === "Unassigned");
  }
  return items;
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="Loading dashboard">
      <span />
      <span />
      <span />
    </div>
  );
}

function WidgetFrame({
  placement,
  editing,
  onWidth,
  onHide,
  onMove,
  children
}: {
  placement: DashboardWidgetPlacement;
  editing: boolean;
  onWidth: (width: DashboardWidgetPlacement["width"]) => void;
  onHide: () => void;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: placement.id, disabled: !editing });
  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={[
        "dashboard-widget",
        `dashboard-widget-${placement.width}`,
        editing ? "is-editing" : "",
        isDragging ? "is-dragging" : ""
      ].filter(Boolean).join(" ")}
      aria-labelledby={`dashboard-widget-${placement.id}`}
    >
      <header className="dashboard-widget-heading">
        <div>
          <h2 id={`dashboard-widget-${placement.id}`}>{widgetTitle(placement.id)}</h2>
          {editing ? (
            <p>{dashboardWidgetCatalog.find((widget) => widget.id === placement.id)?.description}</p>
          ) : null}
        </div>
        {editing ? (
          <div className="dashboard-widget-controls">
            <button
              className="dashboard-icon-button dashboard-drag-handle"
              type="button"
              aria-label={`Move ${widgetTitle(placement.id)}. Press space then arrow keys to reorder.`}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={18} />
            </button>
            <button
              className="dashboard-icon-button"
              type="button"
              aria-label={`Move ${widgetTitle(placement.id)} up`}
              onClick={() => onMove(-1)}
            >
              <ArrowUp size={17} />
            </button>
            <button
              className="dashboard-icon-button"
              type="button"
              aria-label={`Move ${widgetTitle(placement.id)} down`}
              onClick={() => onMove(1)}
            >
              <ArrowDown size={17} />
            </button>
            <button
              className="dashboard-size-button"
              type="button"
              onClick={() => onWidth(placement.width === "full" ? "half" : "full")}
            >
              <Maximize2 size={15} />
              {placement.width === "full" ? "Half width" : "Full width"}
            </button>
            <button
              className="dashboard-icon-button"
              type="button"
              aria-label={`Hide ${widgetTitle(placement.id)}`}
              onClick={onHide}
            >
              <EyeOff size={17} />
            </button>
          </div>
        ) : null}
      </header>
      <div className="dashboard-widget-body">{children}</div>
    </section>
  );
}

function AttentionSummaryWidget({
  summary,
  activeFilter,
  onFilter
}: {
  summary?: DashboardAttentionSummary;
  activeFilter: AttentionFilter;
  onFilter: (filter: AttentionFilter) => void;
}) {
  if (!summary) return <DashboardSkeleton />;
  const metrics: Array<{
    id: AttentionFilter;
    label: string;
    value: number;
    tone: string;
  }> = [
    { id: "overdue", label: "Overdue", value: summary.overdue, tone: "danger" },
    { id: "today", label: "Due today", value: summary.dueToday, tone: "warning" },
    { id: "upcoming", label: "Next 7 days", value: summary.dueNextSevenDays, tone: "blue" },
    { id: "attention", label: "Needs attention", value: summary.needsAttention, tone: "violet" },
    { id: "unassigned", label: "Unassigned", value: summary.unassigned, tone: "neutral" }
  ];

  return (
    <div className="dashboard-attention-grid">
      {metrics.map((metric) => (
        <button
          key={metric.id}
          className={[
            "dashboard-attention-card",
            `tone-${metric.tone}`,
            activeFilter === metric.id ? "is-active" : ""
          ].filter(Boolean).join(" ")}
          type="button"
          aria-pressed={activeFilter === metric.id}
          onClick={() => onFilter(activeFilter === metric.id ? "all" : metric.id)}
        >
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </button>
      ))}
    </div>
  );
}

function WidgetPagination({
  page,
  pageCount,
  label,
  onPage
}: {
  page: number;
  pageCount: number;
  label: string;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="dashboard-widget-pagination" aria-label={`${label} pages`}>
      <span className="sr-only">Page {page + 1} of {pageCount}</span>
      {Array.from({ length: pageCount }, (_, index) => (
        <button
          key={index}
          type="button"
          className={index === page ? "is-active" : ""}
          aria-label={`Show ${label} page ${index + 1}`}
          aria-current={index === page ? "page" : undefined}
          onClick={() => onPage(index)}
        />
      ))}
    </nav>
  );
}

function WorkQueueWidget({
  data,
  filter,
  completingTaskId,
  onCompleteTask
}: {
  data?: DashboardDataResponse["widgets"]["work-queue"];
  filter: AttentionFilter;
  completingTaskId: string;
  onCompleteTask: (item: DashboardWorkItem) => void;
}) {
  const [page, setPage] = useState(0);
  const items = data ? visibleWorkItems(data.items, filter) : [];
  const pageCount = Math.ceil(items.length / workQueuePageSize);
  const pageItems = items.slice(
    page * workQueuePageSize,
    (page + 1) * workQueuePageSize
  );

  useEffect(() => {
    setPage(0);
  }, [filter, data?.items]);

  if (!data) return <DashboardSkeleton />;

  return (
    <>
      <div className="dashboard-list-context">
        <span>
          {filter === "all" ? `${data.total} prioritized items` : `${items.length} matching items`}
        </span>
        {filter !== "all" ? (
          <span className="dashboard-filter-chip">{filter.replace("-", " ")}</span>
        ) : null}
      </div>
      {items.length ? (
        <>
          <div
            className={`dashboard-work-list dashboard-paged-content${pageCount > 1 ? " is-paginated" : ""}`}
            key={page}
          >
            {pageItems.map((item) => (
              <article className="dashboard-work-row" key={item.id}>
                <div className={`dashboard-work-kind kind-${item.kind}`}>
                  {item.kind === "request-task" ? <ClipboardCheck size={17} /> : <Blocks size={17} />}
                </div>
                <div className="dashboard-work-copy">
                  <div className="dashboard-work-primary">
                    <Link href={item.href}>{item.title}</Link>
                    <span className={`dashboard-timing timing-${item.timing}`}>
                      {timingLabel(item.timing, item.dueDate)}
                    </span>
                  </div>
                  <p>{item.reference} · {item.context}</p>
                  <div className="dashboard-work-meta">
                    <span>{item.status}</span>
                    <span>{item.owner || "Unassigned"}</span>
                    {item.priority ? <span>{item.priority}</span> : null}
                    {item.attentionReasons.map((reason) => (
                      <span className="dashboard-reason" key={reason}>{reason}</span>
                    ))}
                  </div>
                </div>
                {item.canComplete && item.taskId ? (
                  <button
                    className="dashboard-complete-button"
                    type="button"
                    disabled={completingTaskId === item.taskId}
                    onClick={() => onCompleteTask(item)}
                  >
                    <Check size={16} />
                    {completingTaskId === item.taskId ? "Completing…" : "Complete"}
                  </button>
                ) : (
                  <Link className="dashboard-row-link" href={item.href} aria-label={`Open ${item.reference}`}>
                    <ArrowRight size={17} />
                  </Link>
                )}
              </article>
            ))}
          </div>
          <WidgetPagination
            page={page}
            pageCount={pageCount}
            label="work items"
            onPage={setPage}
          />
        </>
      ) : (
        <div className="dashboard-empty-state">
          <Check size={20} />
          <p>No work matches this view.</p>
        </div>
      )}
    </>
  );
}

function UpcomingDatesWidget({
  data,
  businessDate
}: {
  data?: DashboardDataResponse["widgets"]["upcoming-dates"];
  businessDate: string;
}) {
  const [page, setPage] = useState(0);
  const items = data?.items ?? [];
  const pageCount = Math.ceil(items.length / upcomingDatesPageSize);
  const pageItems = items.slice(
    page * upcomingDatesPageSize,
    (page + 1) * upcomingDatesPageSize
  );

  useEffect(() => {
    setPage(0);
  }, [data?.items]);

  if (!data) return <DashboardSkeleton />;
  const groups = ["Overdue", "Today", "This week", "Next week"];

  return items.length ? (
    <>
      <div
        className={`dashboard-schedule dashboard-paged-content${pageCount > 1 ? " is-paginated" : ""}`}
        key={page}
      >
        {groups.map((group) => {
          const groupItems = pageItems.filter(
            (item) => groupScheduleDate(item.date, businessDate) === group
          );
          if (!groupItems.length) return null;
          return (
            <section key={group}>
              <h3>{group}</h3>
              {groupItems.map((item) => (
                <Link className="dashboard-schedule-row" href={item.href} key={item.id}>
                  <span className={`dashboard-date-block timing-${item.timing}`}>
                    <strong>{new Date(`${item.date}T12:00:00Z`).getUTCDate()}</strong>
                    <small>{new Date(`${item.date}T12:00:00Z`).toLocaleString("en-US", {
                      month: "short",
                      timeZone: "UTC"
                    })}</small>
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.reference} · {item.context}</small>
                  </span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
      <WidgetPagination
        page={page}
        pageCount={pageCount}
        label="upcoming dates"
        onPage={setPage}
      />
    </>
  ) : (
    <div className="dashboard-empty-state">
      <CalendarDays size={20} />
      <p>No upcoming dates in this scope.</p>
    </div>
  );
}

function RecentActivityWidget({
  data
}: {
  data?: DashboardDataResponse["widgets"]["recent-activity"];
}) {
  const [page, setPage] = useState(0);
  const items = data?.items ?? [];
  const pageCount = Math.ceil(items.length / recentActivityPageSize);
  const pageItems = items.slice(
    page * recentActivityPageSize,
    (page + 1) * recentActivityPageSize
  );

  useEffect(() => {
    setPage(0);
  }, [data?.items]);

  if (!data) return <DashboardSkeleton />;
  return items.length ? (
    <>
      <div
        className={`dashboard-activity-list dashboard-paged-content${pageCount > 1 ? " is-paginated" : ""}`}
        key={page}
      >
        {pageItems.map((item) => {
          const content = (
            <>
              <span className="dashboard-activity-icon"><Activity size={15} /></span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.actorName} · {formatWorkspaceDate(item.createdAt, true)}
                </small>
              </span>
            </>
          );
          return item.href ? (
            <Link href={item.href} className="dashboard-activity-row" key={item.id}>
              {content}
            </Link>
          ) : (
            <div className="dashboard-activity-row" key={item.id}>{content}</div>
          );
        })}
      </div>
      <WidgetPagination
        page={page}
        pageCount={pageCount}
        label="recent activity"
        onPage={setPage}
      />
    </>
  ) : (
    <div className="dashboard-empty-state">
      <Activity size={20} />
      <p>No recent activity in this scope.</p>
    </div>
  );
}

function ModuleHealthWidget({
  data
}: {
  data?: DashboardDataResponse["widgets"]["module-health"];
}) {
  if (!data) return <DashboardSkeleton />;
  return (
    <div className="dashboard-module-grid">
      {data.items.map((item) => (
        <Link className="dashboard-module-card" href={item.href} key={item.id}>
          <span>{item.label}</span>
          <strong>{item.count}</strong>
          <small>{item.detail}</small>
          <ArrowRight size={16} />
        </Link>
      ))}
    </div>
  );
}

export function HubDashboard() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { workspace } = usePulsePreferences();
  const [preferences, setPreferences] = useState<DashboardPreferencesRecord | null>(null);
  const [draft, setDraft] = useState<DashboardPreferencesRecord | null>(null);
  const [data, setData] = useState<DashboardDataResponse | null>(null);
  const [scope, setScope] = useState<DashboardScope>("mine");
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");
  const [completingTaskId, setCompletingTaskId] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activePreferences = editing ? draft : preferences;
  const visibleWidgets = useMemo(
    () => activePreferences?.widgets.filter((widget) => widget.visible) ?? [],
    [activePreferences]
  );
  const hiddenWidgets = useMemo(
    () => activePreferences?.widgets.filter((widget) => !widget.visible) ?? [],
    [activePreferences]
  );
  const visibleWidgetKey = visibleWidgets.map((widget) => widget.id).join(",");
  const canCreateRequest = canRole(user?.role, "crm:write");

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let active = true;
    async function loadPreferences() {
      try {
        const response = await requestJson<{ preferences: DashboardPreferencesRecord }>(
          "/api/dashboard/preferences",
          { cache: "no-store" }
        );
        if (!active) return;
        const normalized = normalizeDashboardPreferences(response.preferences, currentUser.role);
        setPreferences(normalized);
        setDraft(normalized);
        setScope(normalized.defaultScope);
      } catch {
        if (!active) return;
        const fallback = defaultDashboardPreferences(currentUser.role);
        setPreferences(fallback);
        setDraft(fallback);
        setScope(fallback.defaultScope);
      }
    }
    void loadPreferences();
    return () => {
      active = false;
    };
  }, [user]);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!user || !preferences) return;
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      if (!visibleWidgetKey) {
        setData((current) => current ? { ...current, widgets: {} } : null);
        return;
      }
      const response = await requestJson<DashboardDataResponse>(
        `/api/dashboard?scope=${scope}&widgets=${encodeURIComponent(visibleWidgetKey)}`,
        { cache: "no-store" }
      );
      setData(response);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [preferences, scope, user, visibleWidgetKey]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard(true);
    }, 60_000);
    const refreshOnFocus = () => void loadDashboard(true);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function persistPreferences(next: DashboardPreferencesRecord) {
    const response = await requestJson<{ preferences: DashboardPreferencesRecord }>(
      "/api/dashboard/preferences",
      { method: "PUT", body: JSON.stringify(next) }
    );
    const normalized = normalizeDashboardPreferences(response.preferences, user!.role);
    setPreferences(normalized);
    setDraft(normalized);
    return normalized;
  }

  async function changeScope(nextScope: DashboardScope) {
    setScope(nextScope);
    setAttentionFilter("all");
    if (!preferences || !user) return;
    const next = { ...preferences, defaultScope: nextScope };
    setPreferences(next);
    try {
      await persistPreferences(next);
    } catch {
      setMessage("The scope changed for this session but could not be saved.");
    }
  }

  function updateDraftWidgets(update: (widgets: DashboardWidgetPlacement[]) => DashboardWidgetPlacement[]) {
    setDraft((current) => current ? { ...current, widgets: update(current.widgets) } : current);
  }

  function moveWidget(id: DashboardWidgetId, direction: -1 | 1) {
    updateDraftWidgets((widgets) => {
      const visible = widgets.filter((widget) => widget.visible);
      const hidden = widgets.filter((widget) => !widget.visible);
      const index = visible.findIndex((widget) => widget.id === id);
      const nextIndex = Math.max(0, Math.min(visible.length - 1, index + direction));
      return [...arrayMove(visible, index, nextIndex), ...hidden];
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    updateDraftWidgets((widgets) => {
      const visible = widgets.filter((widget) => widget.visible);
      const hidden = widgets.filter((widget) => !widget.visible);
      const from = visible.findIndex((widget) => widget.id === event.active.id);
      const to = visible.findIndex((widget) => widget.id === event.over?.id);
      if (from < 0 || to < 0) return widgets;
      return [...arrayMove(visible, from, to), ...hidden];
    });
  }

  function showWidget(id: DashboardWidgetId) {
    updateDraftWidgets((widgets) => {
      const restored = widgets.find((widget) => widget.id === id);
      if (!restored) return widgets;
      return [
        ...widgets.filter((widget) => widget.id !== id),
        { ...restored, visible: true }
      ];
    });
  }

  async function saveLayout() {
    if (!draft || !user) return;
    setSaving(true);
    try {
      const next = { ...draft, defaultScope: scope };
      await persistPreferences(next);
      setEditing(false);
      setCatalogOpen(false);
      setMessage("Dashboard layout saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save dashboard layout.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setDraft(preferences);
    setEditing(false);
    setCatalogOpen(false);
  }

  async function resetLayout() {
    if (!window.confirm("Reset your dashboard to the default widget layout?")) return;
    setSaving(true);
    try {
      const response = await requestJson<{ preferences: DashboardPreferencesRecord }>(
        "/api/dashboard/preferences",
        { method: "DELETE" }
      );
      const normalized = normalizeDashboardPreferences(response.preferences, user!.role);
      setPreferences(normalized);
      setDraft(normalized);
      setScope(normalized.defaultScope);
      setEditing(false);
      setCatalogOpen(false);
      setMessage("Dashboard reset to default.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset dashboard.");
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(item: DashboardWorkItem) {
    if (!item.requestId || !item.taskId) return;
    setCompletingTaskId(item.taskId);
    try {
      await requestJson(`/api/requests/${item.requestId}/tasks/${item.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: true })
      });
      setMessage(`${item.title} completed.`);
      await loadDashboard(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete task.");
    } finally {
      setCompletingTaskId("");
    }
  }

  function renderWidget(id: DashboardWidgetId) {
    if (id === "attention-summary") {
      return (
        <AttentionSummaryWidget
          summary={data?.widgets["attention-summary"]}
          activeFilter={attentionFilter}
          onFilter={setAttentionFilter}
        />
      );
    }
    if (id === "work-queue") {
      return (
        <WorkQueueWidget
          data={data?.widgets["work-queue"]}
          filter={attentionFilter}
          completingTaskId={completingTaskId}
          onCompleteTask={(item) => void completeTask(item)}
        />
      );
    }
    if (id === "upcoming-dates") {
      return (
        <UpcomingDatesWidget
          data={data?.widgets["upcoming-dates"]}
          businessDate={data?.businessDate ?? ""}
        />
      );
    }
    if (id === "recent-activity") {
      return <RecentActivityWidget data={data?.widgets["recent-activity"]} />;
    }
    return <ModuleHealthWidget data={data?.widgets["module-health"]} />;
  }

  if (userLoading || !user || !activePreferences) {
    return <div className="dashboard-page"><DashboardSkeleton /></div>;
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="dashboard-eyebrow">
            <LayoutDashboard size={15} />
            {data?.scopeLabel ?? "Pulse dashboard"}
          </p>
          <h1>{dashboardGreeting(user.name, workspace.timeZone)}</h1>
          <p>
            {formatWorkspaceDate(data?.businessDate || new Date())}
            <span aria-hidden="true"> · </span>
            Here is what needs your attention.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <div className="dashboard-scope-control" aria-label="Dashboard scope">
            {([
              ["mine", "My work"],
              ["team", "My team"],
              ["all", "All Pulse"]
            ] as Array<[DashboardScope, string]>).map(([value, label]) => (
              <button
                type="button"
                className={scope === value ? "is-active" : ""}
                aria-pressed={scope === value}
                onClick={() => void changeScope(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="dashboard-action-row">
            {canCreateRequest ? (
              <Link className="dashboard-primary-action" href="/requests?new=1">
                <Plus size={17} />
                New request
              </Link>
            ) : null}
            <button
              className="dashboard-secondary-action"
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
              Refresh
            </button>
            {!editing ? (
              <button
                className="dashboard-secondary-action"
                type="button"
                onClick={() => {
                  setDraft(preferences);
                  setEditing(true);
                }}
              >
                <Pencil size={16} />
                Customize
              </button>
            ) : null}
          </div>
          {data?.generatedAt ? (
            <small>Updated {formatWorkspaceDate(data.generatedAt, true)}</small>
          ) : null}
        </div>
      </header>

      {editing ? (
        <section className="dashboard-edit-bar" aria-label="Dashboard customization">
          <div>
            <strong>Customize dashboard</strong>
            <span>Drag widgets, change their width, or hide what you do not need.</span>
          </div>
          <div>
            <button type="button" onClick={() => setCatalogOpen((current) => !current)}>
              <Plus size={16} />
              Add widgets{hiddenWidgets.length ? ` (${hiddenWidgets.length})` : ""}
            </button>
            <button type="button" onClick={() => void resetLayout()} disabled={saving}>
              <RotateCcw size={16} />
              Reset
            </button>
            <button type="button" onClick={cancelEditing}>
              <X size={16} />
              Cancel
            </button>
            <button className="primary" type="button" onClick={() => void saveLayout()} disabled={saving}>
              <Save size={16} />
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
        </section>
      ) : null}

      {editing && catalogOpen ? (
        <section className="dashboard-widget-catalog" aria-labelledby="dashboard-catalog-title">
          <div>
            <h2 id="dashboard-catalog-title">Add widgets</h2>
            <p>Hidden widgets can be restored to the bottom of your dashboard.</p>
          </div>
          {hiddenWidgets.length ? (
            <div>
              {hiddenWidgets.map((placement) => {
                const catalog = dashboardWidgetCatalog.find((widget) => widget.id === placement.id);
                return (
                  <button type="button" key={placement.id} onClick={() => showWidget(placement.id)}>
                    <Plus size={16} />
                    <span><strong>{catalog?.title}</strong><small>{catalog?.description}</small></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="dashboard-catalog-empty">All available widgets are visible.</span>
          )}
        </section>
      ) : null}

      {loadError ? (
        <div className="dashboard-error" role="alert">
          <AlertTriangle size={18} />
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadDashboard()}>Try again</button>
        </div>
      ) : null}

      {loading && !data ? <DashboardSkeleton /> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleWidgets.map((widget) => widget.id)}
          strategy={rectSortingStrategy}
        >
          <main className="dashboard-grid">
            {visibleWidgets.map((placement) => (
              <WidgetFrame
                placement={placement}
                editing={editing}
                key={placement.id}
                onMove={(direction) => moveWidget(placement.id, direction)}
                onWidth={(width) => updateDraftWidgets((widgets) =>
                  widgets.map((widget) =>
                    widget.id === placement.id ? { ...widget, width } : widget
                  )
                )}
                onHide={() => updateDraftWidgets((widgets) =>
                  widgets.map((widget) =>
                    widget.id === placement.id ? { ...widget, visible: false } : widget
                  )
                )}
              >
                {renderWidget(placement.id)}
              </WidgetFrame>
            ))}
          </main>
        </SortableContext>
      </DndContext>

      {!visibleWidgets.length ? (
        <div className="dashboard-empty-dashboard">
          <LayoutDashboard size={28} />
          <h2>Your dashboard is empty</h2>
          <p>Open Customize and add the widgets you want to see.</p>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)}>Customize dashboard</button>
          ) : null}
        </div>
      ) : null}

      <div className="sr-only" role="status" aria-live="polite">{message}</div>
      {message ? <div className="dashboard-toast" role="status">{message}</div> : null}
    </div>
  );
}
