"use client";

import {
  Fragment,
  type ComponentType,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Building2,
  FileText,
  FolderKanban,
  Inbox,
  LoaderCircle,
  ReceiptText,
  Search,
  X
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import {
  navigationCommands,
  searchResultHref
} from "@/lib/navigation";
import type {
  GlobalSearchKind,
  GlobalSearchResponse,
  GlobalSearchResult
} from "@pulse/contracts/search";

type SearchEntry = {
  id: string;
  label: string;
  detail: string;
  meta?: string;
  href: string;
  kindLabel: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const kindMeta: Record<
  GlobalSearchKind,
  { label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }
> = {
  request: { label: "Requests", icon: Inbox },
  client: { label: "Clients", icon: Building2 },
  quote: { label: "Quotes", icon: FileText },
  project: { label: "Projects", icon: FolderKanban },
  invoice: { label: "Billing", icon: ReceiptText }
};

function resultEntry(result: GlobalSearchResult): SearchEntry {
  const meta = kindMeta[result.kind];
  return {
    id: `result-${result.kind}-${result.id}`,
    label: `${result.number} · ${result.title}`,
    detail: result.context,
    meta: result.status,
    href: searchResultHref(result.kind, result.id),
    kindLabel: meta.label,
    icon: meta.icon
  };
}

function SearchResults({
  entries,
  query,
  loading,
  error,
  selectedIndex,
  onSelect,
  onHover
}: {
  entries: SearchEntry[];
  query: string;
  loading: boolean;
  error: string;
  selectedIndex: number;
  onSelect: (entry: SearchEntry) => void;
  onHover: (index: number) => void;
}) {
  const groups = entries.reduce<Array<{ label: string; entries: Array<{ entry: SearchEntry; index: number }> }>>(
    (current, entry, index) => {
      const previous = current[current.length - 1];
      if (previous?.label === entry.kindLabel) {
        previous.entries.push({ entry, index });
      } else {
        current.push({ label: entry.kindLabel, entries: [{ entry, index }] });
      }
      return current;
    },
    []
  );

  return (
    <div className="global-search-results" id="pulse-global-search-results" role="listbox">
      {loading ? (
        <div className="global-search-state" aria-live="polite">
          <LoaderCircle className="spin" size={18} />
          Searching Pulse…
        </div>
      ) : null}
      {!loading && error ? (
        <div className="global-search-state error" role="alert">{error}</div>
      ) : null}
      {!loading && !error && query.trim().length >= 2 && !entries.length ? (
        <div className="global-search-state">
          <strong>No matching records</strong>
          <span>Try a number, title, client, or company name.</span>
        </div>
      ) : null}
      {!loading && !error ? groups.map((group) => (
        <Fragment key={group.label}>
          <div className="global-search-group-label">{group.label}</div>
          {group.entries.map(({ entry, index }) => {
            const Icon = entry.icon;
            const selected = index === selectedIndex;
            return (
              <button
                key={entry.id}
                id={entry.id}
                className={selected ? "global-search-option selected" : "global-search-option"}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => onHover(index)}
                onClick={() => onSelect(entry)}
              >
                <span className="global-search-option-icon"><Icon size={18} /></span>
                <span>
                  <strong>{entry.label}</strong>
                  <small>{entry.detail}</small>
                </span>
                {entry.meta ? <em>{entry.meta}</em> : null}
              </button>
            );
          })}
        </Fragment>
      )) : null}
    </div>
  );
}

export function GlobalSearch({
  onNavigationStart
}: {
  onNavigationStart: (href: string) => void;
}) {
  const router = useRouter();
  const desktopRootRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const entries = useMemo<SearchEntry[]>(() => {
    if (query.trim().length < 2) {
      return navigationCommands.map((command) => ({
        id: command.id,
        label: command.label,
        detail: command.detail,
        href: command.href,
        kindLabel: "Navigate",
        icon: command.icon
      }));
    }
    return results.map(resultEntry);
  }, [query, results]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json() as GlobalSearchResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Search is unavailable.");
        setResults(data.results);
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(searchError instanceof Error ? searchError.message : "Search is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [entries.length, query]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (window.innerWidth < 1024) {
          setDesktopOpen(false);
          setMobileOpen(true);
        } else {
          setDesktopOpen(true);
          window.setTimeout(() => desktopInputRef.current?.focus(), 0);
        }
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        desktopOpen &&
        desktopRootRef.current &&
        !desktopRootRef.current.contains(event.target as Node)
      ) {
        setDesktopOpen(false);
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [desktopOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => mobileInputRef.current?.focus(), 0);

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileDialogRef.current) return;
      const focusable = Array.from(
        mobileDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocus?.focus();
    };
  }, [mobileOpen]);

  function choose(entry: SearchEntry) {
    setDesktopOpen(false);
    setMobileOpen(false);
    onNavigationStart(entry.href);
    router.push(entry.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => entries.length ? (current + 1) % entries.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => entries.length ? (current - 1 + entries.length) % entries.length : 0);
    } else if (event.key === "Enter" && entries[selectedIndex]) {
      event.preventDefault();
      choose(entries[selectedIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDesktopOpen(false);
      setMobileOpen(false);
    }
  }

  const activeDescendant = entries[selectedIndex]?.id;
  const resultsProps = {
    entries,
    query,
    loading,
    error,
    selectedIndex,
    onSelect: choose,
    onHover: setSelectedIndex
  };

  return (
    <>
      <div className="global-search-shell" ref={desktopRootRef}>
        <form
          className="global-search"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search size={18} />
          <input
            ref={desktopInputRef}
            aria-label="Global app-wide search"
            aria-autocomplete="list"
            aria-controls="pulse-global-search-results"
            aria-expanded={desktopOpen}
            aria-activedescendant={desktopOpen ? activeDescendant : undefined}
            role="combobox"
            placeholder="Search across Pulse..."
            type="search"
            value={query}
            onFocus={() => setDesktopOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setDesktopOpen(true);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <kbd>⌘K</kbd>
        </form>
        <AnimatePresence>
          {desktopOpen ? (
            <m.div
              className="global-search-popover"
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <SearchResults {...resultsProps} />
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>

      <button
        className="mobile-global-search-button"
        type="button"
        aria-label="Search Pulse"
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        onClick={() => {
          setDesktopOpen(false);
          setMobileOpen(true);
        }}
      >
        <Search size={20} />
      </button>

      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {mobileOpen ? (
                <m.div
                  className="shell-dialog-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
                    if (event.target === event.currentTarget) setMobileOpen(false);
                  }}
                >
                  <m.div
                    ref={mobileDialogRef}
                    className="mobile-search-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Search Pulse"
                    initial={{ opacity: 0, y: 38, scale: 0.975 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 22, scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 360, damping: 34 }}
                  >
                    <div className="mobile-search-heading">
                      <div>
                        <strong>Search Pulse</strong>
                        <span>Records and navigation</span>
                      </div>
                      <button type="button" aria-label="Close search" onClick={() => setMobileOpen(false)}>
                        <X size={20} />
                      </button>
                    </div>
                    <label className="mobile-search-input">
                      <Search size={18} />
                      <input
                        ref={mobileInputRef}
                        type="search"
                        role="combobox"
                        aria-label="Search Pulse records"
                        aria-autocomplete="list"
                        aria-controls="pulse-global-search-results"
                        aria-expanded="true"
                        aria-activedescendant={activeDescendant}
                        placeholder="Number, title, or client…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={handleInputKeyDown}
                      />
                    </label>
                    <SearchResults {...resultsProps} />
                  </m.div>
                </m.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </>
  );
}
