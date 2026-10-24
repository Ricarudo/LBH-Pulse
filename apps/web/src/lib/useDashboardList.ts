"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCurrentUser } from "./useCurrentUser";
import { usePulsePreferences } from "@/components/PulseShell";
import { applyList, businessDate, listDefaults, parseListState, serializeListState, widenStatusView, type ListDefinition, type ListState } from "./listState";

export function useDashboardList<T>(definition: ListDefinition<T>, rows: T[]) {
  const params = useSearchParams(); const pathname = usePathname();
  const { user } = useCurrentUser(); const { workspace } = usePulsePreferences();
  const query = params.toString();
  const storageKey = `pulse:list:v1:${user?.id ?? "anonymous"}:${definition.id}`;
  const [state, setState] = useState(() => parseListState(new URLSearchParams(query), definition));
  const [today, setToday] = useState(() => businessDate(new Date(), workspace.timeZone));
  useEffect(() => {
    if (["any", "custom", "missing"].includes(state.datePreset)) return;
    const update = () => setToday(businessDate(new Date(), workspace.timeZone));
    update();
    // Keep relative ranges fresh across midnight without re-sorting on every render.
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [state.datePreset, workspace.timeZone]);
  const current = useRef(state); current.current = state;
  const definitionRef = useRef(definition); definitionRef.current = definition;
  const shape = useMemo(() => JSON.stringify({ filters: definition.filters.map(f => [f.key, f.options]), dates: definition.dates?.map(d => d.key), defaultView: definition.defaultView, views: definition.views?.map(v => v.key), sorts: definition.sorts.map(s => s.key) }), [definition]);
  useEffect(() => {
    let remembered: Partial<ListState> = {};
    try { remembered = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { /* Storage is optional, including private browsing. */ }
    const next = parseListState(new URLSearchParams(query), definitionRef.current, remembered);
    setState(previous => {
      if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
      current.current = next; return next;
    });
  }, [query, storageKey, shape]);
  function commit(next: ListState) {
    next = widenStatusView(next, definition);
    current.current = next; setState(next);
    if (user) {
      try { localStorage.setItem(storageKey, JSON.stringify({ view: next.view, sort: next.sort, direction: next.direction })); } catch { /* URL state still works without browser storage. */ }
    }
    const serialized = serializeListState(new URLSearchParams(window.location.search), next, definition);
    // Next's history integration synchronizes searchParams without an RSC navigation per keystroke.
    // Reading the live URL prevents rapid edits from reviving stale unrelated parameters.
    window.history.replaceState(window.history.state, "", `${pathname}?${serialized.toString()}`);
  }
  const visibleRows = useMemo(
    () => applyList(rows, definition, state, user?.id ?? "", workspace.timeZone),
    [rows, definition, state, user?.id, workspace.timeZone, today]
  );
  return {
    definition, state, commit,
    defaults: listDefaults(definition),
    setSearch: (q: string) => commit({ ...current.current, q }),
    setView: (view: string) => commit({ ...current.current, view }),
    setSort: (sort: string, direction?: "asc" | "desc") => commit({ ...current.current, sort, direction: direction ?? definition.sorts.find(s => s.key === sort)?.direction ?? "asc" }),
    setDirection: (direction: "asc" | "desc") => commit({ ...current.current, direction }),
    reset: () => commit(listDefaults(definition)),
    rows: visibleRows,
    userId: user?.id ?? "", timeZone: workspace.timeZone
  };
}
export type DashboardListController<T> = ReturnType<typeof useDashboardList<T>>;
