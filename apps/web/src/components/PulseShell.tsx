"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canRole, type AuthenticatedUser } from "@/lib/auth/permissions";
import { PageTransition } from "@/components/PageTransition";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  FileText,
  FolderKanban,
  Home,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  UserRound
} from "lucide-react";

const themeStorageKey = "pulse.theme";
type PulseTheme = "light" | "dark";

type PulseShellProps = {
  activePage:
    | "hub"
    | "requests"
    | "directory"
    | "leads"
    | "clients"
    | "quotes"
    | "projects"
    | "procurement"
    | "field"
    | "billing"
    | "statistics"
    | "activity"
    | "settings";
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

const navItems = [
  { href: "/requests", label: "Requests", key: "requests", icon: UserRound },
  { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
  { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
  { href: "/directory", label: "Directory", key: "directory", icon: Building2 },
  { href: "/billing", label: "Billing", key: "billing", icon: ReceiptText },
  { href: "/statistics", label: "Analytics", key: "statistics", icon: BarChart3 },
  { href: "/settings", label: "Settings", key: "settings", icon: Settings }
] as const;

type DateRange = {
  start: string;
  end: string;
};

const defaultDateRange: DateRange = {
  start: "2026-05-16",
  end: "2026-05-31"
};

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getWeekRange(offsetWeeks = 0): DateRange {
  const today = new Date();
  const start = addDays(today, offsetWeeks * 7 - today.getDay());
  const end = addDays(start, 6);

  return {
    start: toInputDate(start),
    end: toInputDate(end)
  };
}

function getMonthRange(offsetMonths = 0): DateRange {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + offsetMonths + 1, 0);

  return {
    start: toInputDate(start),
    end: toInputDate(end)
  };
}

function formatDateRange(range: DateRange) {
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Select date range";
  }

  const startFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: start.getFullYear() === end.getFullYear() ? undefined : "numeric"
  });
  const endFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return `${startFormat.format(start)} - ${endFormat.format(end)}`;
}

const dateRangePresets = [
  { label: "This week", getRange: () => getWeekRange(0) },
  { label: "Next week", getRange: () => getWeekRange(1) },
  { label: "This month", getRange: () => getMonthRange(0) },
  {
    label: "Next 30 days",
    getRange: () => {
      const today = new Date();
      return {
        start: toInputDate(today),
        end: toInputDate(addDays(today, 30))
      };
    }
  }
];

export function PulseShell({
  activePage,
  title,
  subtitle,
  children
}: PulseShellProps) {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("admin@r2.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [draftDateRange, setDraftDateRange] = useState<DateRange>(defaultDateRange);
  const [theme, setTheme] = useState<PulseTheme>("light");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(themeStorageKey);

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json()) as { user: AuthenticatedUser | null };
        setCurrentUser(data.user);
      } catch {
        setCurrentUser(null);
      } finally {
        setLoaded(true);
      }
    }

    void loadSession();
  }, []);

  useEffect(() => {
    function handleResize() {
      setCollapsed(window.innerWidth < 980);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  function handleCollapsedToggle() {
    // On mobile, keep it collapsed
    if (window.innerWidth < 980) {
      return;
    }
    setCollapsed((value) => !value);
  }

  const dateRangeLabel = useMemo(() => formatDateRange(dateRange), [dateRange]);
  const canCreateCrm = canRole(currentUser?.role, "crm:write");
  const canOpenSettings = canRole(currentUser?.role, "settings:read");
  const dateRangeIsIncomplete = !draftDateRange.start || !draftDateRange.end;
  const dateRangeIsInvalid =
    !dateRangeIsIncomplete &&
    draftDateRange.start > draftDateRange.end;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword
        })
      });
      const data = (await response.json()) as {
        user?: AuthenticatedUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        setLoginError(data.error || "Unable to sign in.");
        return;
      }

      setCurrentUser(data.user);
      setLoginPassword("");
    } catch {
      setLoginError("Unable to reach the local auth service.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
  }

  function toggleDatePicker() {
    setDraftDateRange(dateRange);
    setDatePickerOpen((value) => !value);
    setSearchOpen(false);
    setFilterOpen(false);
    setNewOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }

  function applyDateRange() {
    if (dateRangeIsIncomplete || dateRangeIsInvalid) {
      return;
    }

    setDateRange(draftDateRange);
    setDatePickerOpen(false);
  }

  function applyDateRangePreset(range: DateRange) {
    setDraftDateRange(range);
    setDateRange(range);
    setDatePickerOpen(false);
  }

  function goToCreate(path: string) {
    setSearchOpen(false);
    setNewOpen(false);
    router.push(path);
  }

  if (!loaded) {
    return null;
  }

  if (!currentUser) {
    return (
      <main className="login-page">
        <form className="login-card" aria-labelledby="login-title" onSubmit={login}>
          <div className="brand-mark">
            <img src="/pulse-mark.svg" alt="" />
          </div>
          <h1 id="login-title">Pulse</h1>
          <p>Local development login for the Pulse workstation.</p>

          <label className="field-label" htmlFor="local-email">
            Email
          </label>
          <input
            id="local-email"
            className="select-field"
            type="email"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
          />

          <label className="field-label login-password-label" htmlFor="local-password">
            Password
          </label>
          <input
            id="local-password"
            className="select-field"
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
          />

          {loginError ? <div className="form-alert error">{loginError}</div> : null}

          <button className="primary-button" type="submit">
            Sign In
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className={collapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar" aria-label="Pulse navigation">
        <div className="sidebar-brand">
          <img className="pulse-logo pulse-logo-full" src="/pulse-logo.svg" alt="Pulse" />
          <img className="pulse-logo pulse-logo-mark" src="/pulse-mark.svg" alt="Pulse" />
          <button 
            className="collapse-button" 
            type="button" 
            onClick={() => handleCollapsedToggle()}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            <ChevronsLeft size={19} />
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>

        <nav className="nav-list">
          <Link
            className={
              activePage === "hub" || pathname === "/hub"
                ? "nav-link nav-link-active"
                : "nav-link"
            }
            href="/hub"
          >
            <Home size={20} strokeWidth={1.9} />
            <span>Hub</span>
          </Link>

          {navItems
            .filter((item) => item.key !== "settings" || canOpenSettings)
            .map((item) => (
              <Link
                key={item.key}
                className={
                  activePage === item.key ||
                  pathname === item.href ||
                  (item.key === "requests" && pathname === "/leads") ||
                  (item.key === "directory" && pathname.startsWith("/clients"))
                    ? "nav-link nav-link-active"
                    : "nav-link"
                }
                href={item.href}
              >
                <item.icon size={20} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-card">
            <div className="org-icon">
              <Building2 size={24} />
            </div>
            <div>
              <strong>R2 Communications</strong>
              <span>Chicago, IL</span>
            </div>
            <ChevronDown size={18} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          <div className="top-actions">
            <div className="topbar-popover-anchor search-anchor">
              <button
                className="toolbar-button icon-only"
                type="button"
                aria-label="Search"
                aria-expanded={searchOpen}
                aria-haspopup="dialog"
                title="Search"
                onClick={() => {
                  setSearchOpen((value) => !value);
                  setFilterOpen(false);
                  setDatePickerOpen(false);
                  setNewOpen(false);
                  setNotificationsOpen(false);
                  setProfileOpen(false);
                }}
              >
                <Search size={18} />
              </button>
              {searchOpen ? (
                <div className="mini-popover search-popover" role="dialog" aria-label="Global search">
                  <label className="search-wrap">
                    <Search size={18} />
                    <input
                      aria-label="Global search"
                      autoFocus
                      placeholder="Search clients, quotes, projects, POs, invoices..."
                      type="search"
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                    />
                  </label>
                  {searchValue ? (
                    <p>
                      Searching static mockup for <strong>{searchValue}</strong>. Backend search will connect later.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="topbar-popover-anchor">
              <button
                className="toolbar-button icon-only"
                type="button"
                aria-label="Filters"
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                title="Filters"
                onClick={() => {
                  setFilterOpen((value) => !value);
                  setSearchOpen(false);
                  setDatePickerOpen(false);
                  setNewOpen(false);
                  setNotificationsOpen(false);
                  setProfileOpen(false);
                }}
              >
                <SlidersHorizontal size={18} />
              </button>
              {filterOpen ? (
                <div className="mini-popover filter-popover">
                  <strong>Filters</strong>
                  <button type="button">Open only</button>
                  <button type="button">Needs approval</button>
                  <button type="button">Assigned to me</button>
                </div>
              ) : null}
            </div>
            <button
              className="toolbar-button date-button"
              type="button"
              aria-expanded={datePickerOpen}
              aria-haspopup="dialog"
              onClick={toggleDatePicker}
            >
              <CalendarDays size={18} />
              {dateRangeLabel}
              <ChevronDown size={16} />
            </button>
            <button
              className="new-button icon-only"
              type="button"
              aria-label="Create new"
              title="New"
              disabled={!canCreateCrm}
              onClick={() => {
                if (!canCreateCrm) {
                  return;
                }
                setNewOpen((value) => !value);
                setSearchOpen(false);
                setDatePickerOpen(false);
                setFilterOpen(false);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
            >
              <Plus size={20} />
            </button>
            <button
              className="toolbar-button icon-only"
              type="button"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="notification-button"
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNotificationsOpen((value) => !value);
                setSearchOpen(false);
                setDatePickerOpen(false);
                setFilterOpen(false);
                setNewOpen(false);
                setProfileOpen(false);
              }}
            >
              <Bell size={22} />
              <span>6</span>
            </button>
            <button
              className="profile-chip"
              type="button"
              onClick={() => {
                setProfileOpen((value) => !value);
                setSearchOpen(false);
                setDatePickerOpen(false);
                setFilterOpen(false);
                setNewOpen(false);
                setNotificationsOpen(false);
              }}
            >
              <div className="avatar">
                {currentUser.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <strong>{currentUser.name}</strong>
                <span>{currentUser.roleLabel}</span>
              </div>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <div className="action-popovers">
          {datePickerOpen ? (
            <div className="mini-popover date-range-popover" role="dialog" aria-label="Select date range">
              <strong>Date Range</strong>
              <div className="date-range-fields">
                <label>
                  <span>Start</span>
                  <input
                    type="date"
                    value={draftDateRange.start}
                    onChange={(event) =>
                      setDraftDateRange((current) => ({
                        ...current,
                        start: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    type="date"
                    value={draftDateRange.end}
                    onChange={(event) =>
                      setDraftDateRange((current) => ({
                        ...current,
                        end: event.target.value
                      }))
                    }
                  />
                </label>
              </div>
              {dateRangeIsInvalid ? (
                <p className="date-range-error">End date must be after the start date.</p>
              ) : null}
              <div className="date-range-presets">
                {dateRangePresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyDateRangePreset(preset.getRange())}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="date-range-actions">
                <button type="button" onClick={() => setDatePickerOpen(false)}>
                  Cancel
                </button>
                <button
                  className="date-range-apply"
                  type="button"
                  disabled={dateRangeIsIncomplete || dateRangeIsInvalid}
                  onClick={applyDateRange}
                >
                  Apply Range
                </button>
              </div>
            </div>
          ) : null}

          {newOpen ? (
            <div className="mini-popover quick-create-popover">
              <strong>Create</strong>
              <button type="button" disabled={!canCreateCrm} onClick={() => goToCreate("/requests")}>Request</button>
              <button type="button" disabled={!canCreateCrm} onClick={() => goToCreate("/clients/new")}>Directory client</button>
              <button type="button" onClick={() => goToCreate("/quotes")}>Quote / Proposal output</button>
              <button type="button" onClick={() => goToCreate("/projects")}>Project</button>
            </div>
          ) : null}

          {notificationsOpen ? (
            <div className="mini-popover notifications-popover">
              <strong>Notifications</strong>
              <p>3 quotes awaiting approval</p>
              <p>2 projects waiting on materials</p>
              <p>1 invoice overdue</p>
            </div>
          ) : null}

          {profileOpen ? (
            <div className="mini-popover profile-popover">
              <strong>{currentUser.name}</strong>
              <p>{currentUser.roleLabel}</p>
              <p>{currentUser.email}</p>
              <button type="button" onClick={() => void logout()}>Logout</button>
            </div>
          ) : null}
        </div>

        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
