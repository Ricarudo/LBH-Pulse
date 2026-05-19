"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { canRole, type AuthenticatedUser } from "@/lib/auth/permissions";
import { MobileBottomNav } from "@/components/mobile/MobilePrimitives";
import { PageTransition } from "@/components/PageTransition";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FolderKanban,
  Home,
  Menu,
  Moon,
  ReceiptText,
  Search,
  Settings,
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
  compactHeader?: boolean;
  children: React.ReactNode;
};

const navItems = [
  { href: "/hub", label: "Hub", key: "hub", icon: Home },
  { href: "/requests", label: "Requests", key: "requests", icon: UserRound },
  { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
  { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
  { href: "/directory", label: "Directory", key: "directory", icon: Building2 },
  { href: "/billing", label: "Billing", key: "billing", icon: ReceiptText },
  { href: "/statistics", label: "Analytics", key: "statistics", icon: BarChart3 },
  { href: "/settings", label: "Settings", key: "settings", icon: Settings }
] as const;

const mobileNavItems = [
  { href: "/hub", label: "Dashboard", key: "hub", icon: Home },
  { href: "/requests", label: "Requests", key: "requests", icon: UserRound },
  { href: "/clients", label: "Clients", key: "clients", icon: Building2 },
  { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
  { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
  { href: "/directory", label: "More", key: "more", icon: Menu }
] as const;

const pageLabels: Record<PulseShellProps["activePage"], string> = {
  hub: "Dashboard",
  requests: "Requests",
  directory: "Directory",
  leads: "Requests",
  clients: "Directory",
  quotes: "Quotes",
  projects: "Projects",
  procurement: "Projects",
  field: "Projects",
  billing: "Billing",
  statistics: "Analytics",
  activity: "Activity",
  settings: "Settings"
};

const devUserLabels = [
  "Admin User / Administrator",
  "Sales User / Sales",
  "Project Manager / Project Manager",
  "Technician User / Technician"
];

export function PulseShell({
  activePage,
  title,
  subtitle,
  compactHeader = false,
  children
}: PulseShellProps) {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("admin@r2.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [theme, setTheme] = useState<PulseTheme>("light");
  const pathname = usePathname();
  const mobileActiveKey = pathname.startsWith("/clients")
    ? "clients"
    : activePage === "directory" ||
        activePage === "billing" ||
        activePage === "statistics" ||
        activePage === "settings" ||
        activePage === "procurement" ||
        activePage === "field" ||
        activePage === "activity"
      ? "more"
      : activePage;

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
      if (window.innerWidth < 980) {
        setCollapsed(true);
      }
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
    if (window.innerWidth < 980) {
      return;
    }
    setCollapsed((value) => !value);
  }

  const canOpenSettings = canRole(currentUser?.role, "settings:read");
  const pageTitle = pageLabels[activePage] || title;
  const breadcrumbLabel = pageTitle;
  const pageIntro = compactHeader ? "" : subtitle;

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

  function handleGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <header className="global-topbar">
        <Link className="global-brand" href="/hub" aria-label="Pulse dashboard">
          <img src="/pulse-mark.svg" alt="" />
          <span>Pulse</span>
        </Link>

        <form className="global-search" role="search" onSubmit={handleGlobalSearch}>
          <Search size={18} />
          <input
            aria-label="Global app-wide search"
            placeholder="Search across Pulse..."
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <span>App-wide</span>
        </form>

        <div className="global-actions">
          <span className="environment-badge">Local Dev</span>
          <div className="topbar-popover-anchor">
            <button
              className="notification-button"
              type="button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((value) => !value);
                setProfileOpen(false);
              }}
            >
              <Bell size={21} />
              <span>6</span>
            </button>
            {notificationsOpen ? (
              <div className="mini-popover notifications-popover">
                <strong>Notifications</strong>
                <p>Visual placeholder only. Notification workflows will connect later.</p>
                <p>3 quotes awaiting approval</p>
                <p>2 projects waiting on materials</p>
                <p>1 invoice overdue</p>
              </div>
            ) : null}
          </div>
          <button
            className="profile-chip"
            type="button"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((value) => !value);
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
          <span className="role-indicator">{currentUser.roleLabel}</span>
          {profileOpen ? (
            <div className="mini-popover profile-popover">
              <strong>{currentUser.name}</strong>
              <p>{currentUser.email}</p>
              <p>{currentUser.roleLabel}</p>
              <div className="profile-menu-section">
                <span>Switch role / dev user</span>
                {devUserLabels.map((label) => (
                  <button key={label} type="button" disabled>
                    {label}
                  </button>
                ))}
                <small>Sign out, then use the local login screen to switch users.</small>
              </div>
              <Link href="/settings" onClick={() => setProfileOpen(false)}>
                Settings
              </Link>
              <button type="button" onClick={toggleTheme}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <button type="button" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="shell-body">
        <aside className="sidebar" aria-label="Pulse navigation">
          <div className="sidebar-toggle-row">
            <button
              className="collapse-button"
              type="button"
              onClick={() => handleCollapsedToggle()}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              <span>{collapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>

          <nav className="nav-list">
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
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={20} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </Link>
              ))}
          </nav>
        </aside>

        <main className="main">
          <header className="page-header">
            <div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/hub">Home</Link>
                <span>/</span>
                <span>{breadcrumbLabel}</span>
              </nav>
              <h1 className="page-title">{pageTitle}</h1>
              {pageIntro ? <p className="page-subtitle">{pageIntro}</p> : null}
            </div>
          </header>

          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <MobileBottomNav
        activeKey={mobileActiveKey}
        items={mobileNavItems}
        pathname={pathname}
      />
    </div>
  );
}
