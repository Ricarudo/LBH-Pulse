"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  FormEvent,
  useContext,
  useEffect,
  useState
} from "react";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import type {
  AccentTheme,
  ThemeMode,
  UserPreferencesRecord,
  WorkspaceSettingsRecord
} from "@/types/settings";
import { setWorkspaceFormatting } from "@/lib/formatting";
import { MobileBottomNav } from "@/components/mobile/MobilePrimitives";
import { PageTransition } from "@/components/PageTransition";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FolderKanban,
  Home,
  Menu,
  ReceiptText,
  Search,
  Settings,
  UserRound
} from "lucide-react";

const themeModeStorageKey = "pulse.themeMode";
const accentStorageKey = "pulse.accentTheme";

const defaultWorkspace: WorkspaceSettingsRecord = {
  name: "R2 Communications",
  timeZone: "America/Puerto_Rico",
  locale: "en-US",
  dateFormat: "MM/DD/YYYY",
  weekStartsOn: 0,
  updatedAt: ""
};

type PulsePreferencesContextValue = {
  themeMode: ThemeMode;
  accentTheme: AccentTheme;
  resolvedTheme: "light" | "dark";
  workspace: WorkspaceSettingsRecord;
  saveAppearance: (preferences: UserPreferencesRecord) => Promise<void>;
  setWorkspaceContext: (workspace: WorkspaceSettingsRecord) => void;
};

const PulsePreferencesContext = createContext<PulsePreferencesContextValue | null>(null);

export function usePulsePreferences() {
  const value = useContext(PulsePreferencesContext);
  if (!value) throw new Error("usePulsePreferences must be used inside PulseShell.");
  return value;
}

type PulsePage =
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

type PulseShellProps = {
  activePage?: PulsePage;
  title?: string;
  subtitle?: string;
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

const pageLabels: Record<PulsePage, string> = {
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

type ShellRouteMeta = {
  activePage: PulsePage;
  title: string;
  subtitle: string;
  compactHeader?: boolean;
};

const defaultShellRouteMeta: ShellRouteMeta = {
  activePage: "hub",
  title: "Dashboard",
  subtitle: "R2's connected view across requests, quotes, projects, directory records, and billing."
};

function getShellRouteMeta(pathname: string): ShellRouteMeta {
  if (pathname.startsWith("/requests") || pathname === "/leads") {
    return {
      activePage: "requests",
      title: "Requests",
      subtitle: "Incoming calls, emails, RFPs, site visits, and quote requests.",
      compactHeader: true
    };
  }

  if (pathname.startsWith("/clients")) {
    return {
      activePage: "directory",
      title: "Directory",
      subtitle: pathname.startsWith("/clients/new")
        ? "Create a client account with sites, contacts, and preferences."
        : "Client accounts, contacts, sites, and relationship context."
    };
  }

  if (pathname.startsWith("/contacts")) {
    return {
      activePage: "directory",
      title: "Directory",
      subtitle: "People connected to client accounts, sites, and relationships."
    };
  }

  if (pathname.startsWith("/directory")) {
    return {
      activePage: "directory",
      title: "Directory",
      subtitle: "Supporting relationship records for Requests, Quotes, and Projects."
    };
  }

  if (pathname.startsWith("/quotes")) {
    return {
      activePage: "quotes",
      title: "Quotes",
      subtitle: "Quotes include the client-ready proposal output as a subcategory."
    };
  }

  if (pathname.startsWith("/projects")) {
    return {
      activePage: "projects",
      title: "Projects",
      subtitle: "Project execution, tasks, closeout, and job costing live here."
    };
  }

  if (pathname.startsWith("/procurement")) {
    return {
      activePage: "procurement",
      title: "Projects",
      subtitle: "Purchase orders, vendor coordination, and material readiness."
    };
  }

  if (pathname.startsWith("/field")) {
    return {
      activePage: "field",
      title: "Projects",
      subtitle: "Field jobs, technician activity, labor tracking, and site status."
    };
  }

  if (pathname.startsWith("/billing")) {
    return {
      activePage: "billing",
      title: "Billing",
      subtitle: "Invoices, collections follow-up, and project billing readiness."
    };
  }

  if (pathname.startsWith("/statistics")) {
    return {
      activePage: "statistics",
      title: "Analytics",
      subtitle: "High-level starter metrics for Pulse operations visibility."
    };
  }

  if (pathname.startsWith("/activity")) {
    return {
      activePage: "activity",
      title: "Activity",
      subtitle: "Recent activity across Requests, Directory records, Opportunities, and Quotes."
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      activePage: "settings",
      title: "Settings",
      subtitle: "Personal preferences, workspace administration, and Request checklist templates."
    };
  }

  return defaultShellRouteMeta;
}

const PulseShellContext = createContext(false);

export function PulseShell({
  activePage,
  title,
  subtitle,
  compactHeader = false,
  children
}: PulseShellProps) {
  const hasParentShell = useContext(PulseShellContext);

  if (hasParentShell) {
    return <>{children}</>;
  }

  return (
    <PulseShellFrame
      activePage={activePage}
      title={title}
      subtitle={subtitle}
      compactHeader={compactHeader}
    >
      {children}
    </PulseShellFrame>
  );
}

function PulseShellFrame({
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("blue");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [workspace, setWorkspace] = useState<WorkspaceSettingsRecord>(defaultWorkspace);
  const pathname = usePathname();
  const routeMeta = getShellRouteMeta(pathname);
  const activeShellPage = activePage ?? routeMeta.activePage;
  const shellTitle = title ?? routeMeta.title;
  const shellSubtitle = subtitle ?? routeMeta.subtitle;
  const shellCompactHeader = compactHeader || routeMeta.compactHeader === true;
  const mobileActiveKey = pathname.startsWith("/clients")
    ? "clients"
    : activeShellPage === "directory" ||
        activeShellPage === "billing" ||
        activeShellPage === "statistics" ||
        activeShellPage === "settings" ||
        activeShellPage === "procurement" ||
        activeShellPage === "field" ||
        activeShellPage === "activity"
      ? "more"
      : activeShellPage;

  useEffect(() => {
    const savedMode = window.localStorage.getItem(themeModeStorageKey);
    const savedAccent = window.localStorage.getItem(accentStorageKey);
    if (savedMode === "system" || savedMode === "light" || savedMode === "dark") setThemeMode(savedMode);
    if (savedAccent === "blue" || savedAccent === "violet" || savedAccent === "teal" || savedAccent === "orange") setAccentTheme(savedAccent);

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
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const storedMode = window.localStorage.getItem(themeModeStorageKey);
      const initialMode = themeMode === "system" &&
        (storedMode === "light" || storedMode === "dark")
        ? storedMode
        : themeMode;
      const storedAccent = window.localStorage.getItem(accentStorageKey);
      const initialAccent = accentTheme === "blue" &&
        (storedAccent === "violet" || storedAccent === "teal" || storedAccent === "orange")
        ? storedAccent
        : accentTheme;
      const next = initialMode === "system" ? (media.matches ? "dark" : "light") : initialMode;
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.accent = initialAccent;
    }
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode, accentTheme]);

  useEffect(() => {
    if (!currentUser) return;
    async function loadSettingsContext() {
      try {
        const [preferencesResponse, workspaceResponse] = await Promise.all([
          fetch("/api/settings/preferences", { cache: "no-store" }),
          fetch("/api/settings/workspace", { cache: "no-store" })
        ]);
        if (preferencesResponse.ok) {
          const data = await preferencesResponse.json() as { preferences: UserPreferencesRecord };
          setThemeMode(data.preferences.themeMode);
          setAccentTheme(data.preferences.accentTheme);
          window.localStorage.setItem(themeModeStorageKey, data.preferences.themeMode);
          window.localStorage.setItem(accentStorageKey, data.preferences.accentTheme);
        }
        if (workspaceResponse.ok) {
          const data = await workspaceResponse.json() as { workspace: WorkspaceSettingsRecord };
          setWorkspace(data.workspace);
          setWorkspaceFormatting(data.workspace);
        }
      } catch {
        // The cached appearance and safe workspace defaults remain usable offline.
      }
    }
    void loadSettingsContext();
  }, [currentUser?.id]);

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

  async function saveAppearance(preferences: UserPreferencesRecord) {
    const previous = { themeMode, accentTheme };
    setThemeMode(preferences.themeMode);
    setAccentTheme(preferences.accentTheme);
    window.localStorage.setItem(themeModeStorageKey, preferences.themeMode);
    window.localStorage.setItem(accentStorageKey, preferences.accentTheme);
    const response = await fetch("/api/settings/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences)
    });
    if (!response.ok) {
      setThemeMode(previous.themeMode);
      setAccentTheme(previous.accentTheme);
      throw new Error("Unable to save appearance preferences.");
    }
  }

  function handleCollapsedToggle() {
    if (window.innerWidth < 980) {
      return;
    }
    setCollapsed((value) => !value);
  }

  const canOpenSettings = Boolean(currentUser);
  const pageTitle = shellTitle || pageLabels[activeShellPage];
  const breadcrumbLabel = pageTitle;
  const pageIntro = shellCompactHeader ? "" : shellSubtitle;

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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setChangePasswordError("");
    } catch {
      setLoginError("Unable to reach the local auth service.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setChangePasswordError("");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangePasswordError("");

    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("New passwords do not match.");
      return;
    }

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      const data = (await response.json()) as {
        user?: AuthenticatedUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        setChangePasswordError(data.error || "Unable to change password.");
        return;
      }

      setCurrentUser(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      setChangePasswordError("Unable to reach the local auth service.");
    }
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

  if (currentUser.mustChangePassword) {
    return (
      <main className="login-page">
        <form className="login-card" aria-labelledby="password-change-title" onSubmit={changePassword}>
          <div className="brand-mark">
            <img src="/pulse-mark.svg" alt="" />
          </div>
          <h1 id="password-change-title">Update Password</h1>
          <p>Set a new local Pulse password before opening the workspace.</p>

          <label className="field-label" htmlFor="current-password">
            Current password
          </label>
          <input
            id="current-password"
            className="select-field"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />

          <label className="field-label login-password-label" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className="select-field"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <label className="field-label login-password-label" htmlFor="confirm-new-password">
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            className="select-field"
            type="password"
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
          />

          {changePasswordError ? <div className="form-alert error">{changePasswordError}</div> : null}

          <button className="primary-button" type="submit">
            Update Password
          </button>
          <button className="toolbar-button compact login-secondary-button" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </form>
      </main>
    );
  }

  return (
    <PulseShellContext.Provider value>
      <PulsePreferencesContext.Provider value={{
        themeMode,
        accentTheme,
        resolvedTheme,
        workspace,
        saveAppearance,
        setWorkspaceContext: (next) => {
          setWorkspace(next);
          setWorkspaceFormatting(next);
        }
      }}>
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
          <span className="workspace-context">{workspace.name}</span>
          <span className="environment-badge">Local Dev</span>
          <button
            className="profile-chip"
            type="button"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((value) => !value);
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
              <p>{workspace.name}</p>
              <div className="profile-menu-section">
                <span>Switch role / dev user</span>
                {devUserLabels.map((label) => (
                  <button key={label} type="button" disabled>
                    {label}
                  </button>
                ))}
                <small>Sign out, then use the local login screen to switch users.</small>
              </div>
              <Link href="/settings/account" onClick={() => setProfileOpen(false)}>
                Settings
              </Link>
              <Link href="/settings/appearance" onClick={() => setProfileOpen(false)}>
                Appearance
              </Link>
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
                    activeShellPage === item.key ||
                    pathname === item.href ||
                    (item.key === "requests" && pathname === "/leads") ||
                    (item.key === "directory" &&
                      (pathname.startsWith("/clients") ||
                        pathname.startsWith("/contacts")))
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
    </PulsePreferencesContext.Provider>
    </PulseShellContext.Provider>
  );
}
