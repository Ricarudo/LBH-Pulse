"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { findLocalUser, localUsers, type LocalUser } from "@/lib/localUsers";
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
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  UserRound,
  UsersRound
} from "lucide-react";

const storageKey = "pulse.localUserId";
const themeStorageKey = "pulse.theme";
type PulseTheme = "light" | "dark";

type PulseShellProps = {
  activePage:
    | "hub"
    | "leads"
    | "clients"
    | "quotes"
    | "projects"
    | "procurement"
    | "field"
    | "billing"
    | "statistics"
    | "settings";
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

const navItems = [
  { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
  { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
  { href: "/procurement", label: "Procurement", key: "procurement", icon: ShoppingCart },
  { href: "/field", label: "Field Ops", key: "field", icon: UsersRound },
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
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(localUsers[0].id);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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
    const user = findLocalUser(window.localStorage.getItem(storageKey));
    const savedTheme = window.localStorage.getItem(themeStorageKey);

    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }

    if (user) {
      setCurrentUser(user);
      setSelectedUserId(user.id);
    }

    setLoaded(true);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  const selectedUser = useMemo(
    () => findLocalUser(selectedUserId) ?? localUsers[0],
    [selectedUserId]
  );
  const dateRangeLabel = useMemo(() => formatDateRange(dateRange), [dateRange]);
  const dateRangeIsIncomplete = !draftDateRange.start || !draftDateRange.end;
  const dateRangeIsInvalid =
    !dateRangeIsIncomplete &&
    draftDateRange.start > draftDateRange.end;

  function login() {
    window.localStorage.setItem(storageKey, selectedUser.id);
    setCurrentUser(selectedUser);
  }

  function logout() {
    window.localStorage.removeItem(storageKey);
    setCurrentUser(null);
  }

  function toggleDatePicker() {
    setDraftDateRange(dateRange);
    setDatePickerOpen((value) => !value);
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
    setNewOpen(false);
    router.push(path);
  }

  if (!loaded) {
    return null;
  }

  if (!currentUser) {
    return (
      <main className="login-page">
        <section className="login-card" aria-labelledby="login-title">
          <div className="brand-mark">
            <img src="/pulse-mark.svg" alt="" />
          </div>
          <h1 id="login-title">Pulse</h1>
          <p>Local development login for the Pulse workspace.</p>

          <label className="field-label" htmlFor="local-user">
            User
          </label>
          <select
            id="local-user"
            className="select-field"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            {localUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.roleLabel}
              </option>
            ))}
          </select>

          <button className="primary-button" type="button" onClick={login}>
            Sign In
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className={collapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar" aria-label="Pulse navigation">
        <div className="sidebar-brand">
          <img className="pulse-logo pulse-logo-full" src="/pulse-logo.svg" alt="Pulse" />
          <img className="pulse-logo pulse-logo-mark" src="/pulse-mark.svg" alt="Pulse" />
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

          <div
            className={
              activePage === "leads" || activePage === "clients"
                ? "nav-group nav-group-active"
                : "nav-group"
            }
          >
            <Link
              className={
                activePage === "leads" || activePage === "clients"
                  ? "nav-link nav-link-active nav-parent"
                  : "nav-link nav-parent"
              }
              href="/leads"
            >
              <UserRound size={20} strokeWidth={1.9} />
              <span>CRM</span>
            </Link>
            <div className="nav-sublist">
              <Link
                className={
                  activePage === "leads" || pathname === "/leads"
                    ? "nav-sublink nav-sublink-active"
                    : "nav-sublink"
                }
                href="/leads"
              >
                Leads
              </Link>
              <Link
                className={
                  activePage === "clients" || pathname === "/clients"
                    ? "nav-sublink nav-sublink-active"
                    : "nav-sublink"
                }
                href="/clients"
              >
                Clients
              </Link>
            </div>
          </div>

          {navItems.map((item) => (
            <Link
              key={item.key}
              className={
                activePage === item.key || pathname === item.href
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
          <button className="collapse-button" type="button" onClick={() => setCollapsed((value) => !value)}>
            <ChevronsLeft size={19} />
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
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
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          <div className="top-actions">
            <label className="search-wrap">
              <Search size={20} />
              <input
                aria-label="Global search"
                placeholder="Search clients, quotes, projects, POs, invoices..."
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>
            <div className="topbar-popover-anchor">
              <button
                className="toolbar-button"
                type="button"
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setFilterOpen((value) => !value);
                  setDatePickerOpen(false);
                }}
              >
                <SlidersHorizontal size={18} />
                Filters
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
              className="new-button"
              type="button"
              onClick={() => {
                setNewOpen((value) => !value);
                setDatePickerOpen(false);
              }}
            >
              <Plus size={20} />
              New
              <ChevronDown size={16} />
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
                setDatePickerOpen(false);
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
                setDatePickerOpen(false);
              }}
            >
              <div className="avatar">AM</div>
              <div>
                <strong>Alex Morgan</strong>
                <span>Sales Manager</span>
              </div>
              <ChevronDown size={16} />
            </button>
          </div>
        </header>

        <div className="action-popovers">
          {searchValue ? (
            <div className="mini-popover search-popover">
              Searching static mockup for <strong>{searchValue}</strong>. Backend search will connect later.
            </div>
          ) : null}

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
              <button type="button" onClick={() => goToCreate("/leads")}>Lead</button>
              <button type="button" onClick={() => goToCreate("/clients/new")}>Client</button>
              <button type="button" onClick={() => goToCreate("/quotes")}>Quote / Proposal output</button>
              <button type="button" onClick={() => goToCreate("/projects")}>Project</button>
              <button type="button" onClick={() => goToCreate("/procurement")}>Purchase order</button>
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
              <button type="button" onClick={logout}>Logout</button>
            </div>
          ) : null}
        </div>

        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
