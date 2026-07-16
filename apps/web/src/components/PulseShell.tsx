"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  FormEvent,
  type MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m
} from "motion/react";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import { roleColorForeground } from "@pulse/contracts/access-control";
import type {
  AccentTheme,
  MotionMode,
  ThemeMode,
  UserPreferencesRecord,
  WorkspaceSettingsRecord
} from "@pulse/contracts/settings";
import { setWorkspaceFormatting } from "@/lib/formatting";
import { responsiveBreakpoints } from "@/lib/responsive";
import {
  getMobileActiveKey,
  canAccessPath,
  isNavigationItemActive,
  mobileOverflowGroups,
  mobilePrimaryItems,
  navigationGroups,
  type PulsePage
} from "@/lib/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";
import { MobileBottomNav } from "@/components/mobile/MobilePrimitives";
import { PageTransition } from "@/components/PageTransition";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Palette,
  UserRound,
  X
} from "lucide-react";

const themeModeStorageKey = "pulse.themeMode";
const accentStorageKey = "pulse.accentTheme";
const motionModeStorageKey = "pulse.motionMode";
const sidebarStorageKey = "pulse.sidebarCollapsed";

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
  motionMode: MotionMode;
  resolvedTheme: "light" | "dark";
  workspace: WorkspaceSettingsRecord;
  saveAppearance: (preferences: UserPreferencesRecord) => Promise<void>;
  setWorkspaceContext: (workspace: WorkspaceSettingsRecord) => void;
};

const PulsePreferencesContext = createContext<PulsePreferencesContextValue | null>(null);
type PulseAuthContextValue = {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};
const PulseAuthContext = createContext<PulseAuthContextValue | null>(null);

export function usePulseAuth() {
  const value = useContext(PulseAuthContext);
  if (!value) throw new Error("usePulseAuth must be used inside PulseShell.");
  return value;
}

export function usePulsePreferences() {
  const value = useContext(PulsePreferencesContext);
  if (!value) throw new Error("usePulsePreferences must be used inside PulseShell.");
  return value;
}

type PulseShellProps = {
  activePage?: PulsePage;
  title?: string;
  subtitle?: string;
  compactHeader?: boolean;
  hideHeader?: boolean;
  children: React.ReactNode;
};

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
  settings: "Settings"
};

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
      title: "Procurement",
      subtitle: "Purchase orders, vendor coordination, and material readiness."
    };
  }

  if (pathname.startsWith("/field")) {
    return {
      activePage: "field",
      title: "Field Ops",
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
      subtitle: "Company performance, from first request to final invoice."
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

function AccessDenied() {
  return (
    <section className="access-denied" aria-labelledby="access-denied-title">
      <div className="settings-icon-box"><UserRound size={22} /></div>
      <h1 id="access-denied-title">Access denied</h1>
      <p>Your current role does not have access to this area.</p>
      <Link className="primary-button compact" href="/hub">Return to Dashboard</Link>
    </section>
  );
}

export function PulseShell({
  activePage,
  title,
  subtitle,
  compactHeader = false,
  hideHeader = false,
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
      hideHeader={hideHeader}
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
  hideHeader = false,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("blue");
  const [motionMode, setMotionMode] = useState<MotionMode>("luxurious");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [workspace, setWorkspace] = useState<WorkspaceSettingsRecord>(defaultWorkspace);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDialogRef = useRef<HTMLDivElement>(null);
  const hasSidebarPreferenceRef = useRef(false);
  const pathname = usePathname();
  const routeMeta = getShellRouteMeta(pathname);
  const activeShellPage = activePage ?? routeMeta.activePage;
  const shellTitle = title ?? routeMeta.title;
  const shellSubtitle = subtitle ?? routeMeta.subtitle;
  const shellCompactHeader = compactHeader || routeMeta.compactHeader === true;
  const shouldHideHeader =
    hideHeader ||
    pathname === "/hub" ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/directory") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/contacts") ||
    pathname.startsWith("/quotes") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/billing") ||
    pathname === "/statistics" ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");
  const mobileActiveKey = getMobileActiveKey(pathname);
  const environmentLabel =
    process.env.NEXT_PUBLIC_PULSE_ENV_LABEL ||
    (process.env.NODE_ENV === "development" ? "Local Dev" : "");

  const refreshCurrentUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) return;

      const data = (await response.json()) as { user: AuthenticatedUser | null };
      setCurrentUser(data.user);
    } catch {
      // Mobile file pickers temporarily background the page and can interrupt
      // the focus-triggered session request. Keep the last authenticated user
      // until the server explicitly reports that the session is no longer valid.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(themeModeStorageKey);
    const savedAccent = window.localStorage.getItem(accentStorageKey);
    const savedMotion = window.localStorage.getItem(motionModeStorageKey);
    const savedSidebar = window.localStorage.getItem(sidebarStorageKey);
    if (savedMode === "system" || savedMode === "light" || savedMode === "dark") setThemeMode(savedMode);
    if (savedAccent === "blue" || savedAccent === "violet" || savedAccent === "teal" || savedAccent === "orange") setAccentTheme(savedAccent);
    if (savedMotion === "luxurious" || savedMotion === "subtle") setMotionMode(savedMotion);
    if (savedSidebar === "true" || savedSidebar === "false") {
      hasSidebarPreferenceRef.current = true;
      setCollapsed(savedSidebar === "true");
    } else {
      setCollapsed(window.innerWidth < responsiveBreakpoints.largeDesktop);
    }

  }, []);

  useEffect(() => {
    void refreshCurrentUser();
  }, [pathname, refreshCurrentUser]);

  useEffect(() => {
    const refreshOnFocus = () => void refreshCurrentUser();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refreshCurrentUser]);

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
      document.documentElement.dataset.motion = motionMode;
    }
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themeMode, accentTheme, motionMode]);

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
          setMotionMode(data.preferences.motionMode);
          window.localStorage.setItem(themeModeStorageKey, data.preferences.themeMode);
          window.localStorage.setItem(accentStorageKey, data.preferences.accentTheme);
          window.localStorage.setItem(motionModeStorageKey, data.preferences.motionMode);
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
      if (!hasSidebarPreferenceRef.current) {
        setCollapsed(window.innerWidth < responsiveBreakpoints.largeDesktop);
      }
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setPendingHref("");
    setMoreOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => setPendingHref(""), 1200);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  useEffect(() => {
    if (!profileOpen) return;

    function closeProfile() {
      setProfileOpen(false);
      window.setTimeout(() => profileButtonRef.current?.focus(), 0);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !profileMenuRef.current?.contains(target) &&
        !profileButtonRef.current?.contains(target)
      ) {
        closeProfile();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeProfile();
        return;
      }
      if (event.key === "Tab") {
        setProfileOpen(false);
        return;
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        const items = Array.from(
          profileMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
        );
        if (!items.length) return;
        event.preventDefault();
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1 + items.length) % items.length
                : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      profileMenuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    }, 0);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeMore() {
      setMoreOpen(false);
      window.setTimeout(() => moreButtonRef.current?.focus(), 0);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMore();
        return;
      }
      if (event.key !== "Tab" || !moreDialogRef.current) return;
      const focusable = Array.from(
        moreDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      moreDialogRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  async function saveAppearance(preferences: UserPreferencesRecord) {
    const previous = { themeMode, accentTheme, motionMode };
    setThemeMode(preferences.themeMode);
    setAccentTheme(preferences.accentTheme);
    setMotionMode(preferences.motionMode);
    window.localStorage.setItem(themeModeStorageKey, preferences.themeMode);
    window.localStorage.setItem(accentStorageKey, preferences.accentTheme);
    window.localStorage.setItem(motionModeStorageKey, preferences.motionMode);
    const response = await fetch("/api/settings/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences)
    });
    if (!response.ok) {
      setThemeMode(previous.themeMode);
      setAccentTheme(previous.accentTheme);
      setMotionMode(previous.motionMode);
      window.localStorage.setItem(motionModeStorageKey, previous.motionMode);
      throw new Error("Unable to save appearance preferences.");
    }
  }

  function handleCollapsedToggle() {
    if (window.innerWidth < responsiveBreakpoints.desktop) {
      return;
    }
    setCollapsed((value) => {
      const next = !value;
      hasSidebarPreferenceRef.current = true;
      window.localStorage.setItem(sidebarStorageKey, String(next));
      return next;
    });
  }

  function beginNavigation(href: string) {
    setPendingHref(href);
  }

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

  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPath(currentUser, item.href))
    }))
    .filter((group) => group.items.length > 0);
  const visibleMobilePrimaryItems = mobilePrimaryItems.filter(
    (item) => item.key === "more" || canAccessPath(currentUser, item.href)
  );
  const visibleMobileOverflowGroups = mobileOverflowGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPath(currentUser, item.href))
    }))
    .filter((group) => group.items.length > 0);
  const routeAllowed = canAccessPath(currentUser, pathname);

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
    <PulseAuthContext.Provider value={{ user: currentUser, isLoading: !loaded, refresh: refreshCurrentUser }}>
      <PulseShellContext.Provider value>
        <PulsePreferencesContext.Provider value={{
        themeMode,
        accentTheme,
        motionMode,
        resolvedTheme,
        workspace,
        saveAppearance,
        setWorkspaceContext: (next) => {
          setWorkspace(next);
          setWorkspaceFormatting(next);
        }
      }}>
        <LazyMotion features={domAnimation}>
          <MotionConfig reducedMotion="user">
            <div className={collapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
              <header className="global-topbar">
                <Link
                  className="global-brand"
                  href="/hub"
                  aria-label="Pulse dashboard"
                  onNavigate={() => beginNavigation("/hub")}
                >
                  <img src="/pulse-mark.svg" alt="" />
                  <span>Pulse</span>
                </Link>

                <GlobalSearch user={currentUser} onNavigationStart={beginNavigation} />

                <div className="global-actions">
                  <span className="workspace-context" title={workspace.name}>
                    {workspace.name}
                  </span>
                  {environmentLabel ? (
                    <span className="environment-badge">{environmentLabel}</span>
                  ) : null}
                  <button
                    ref={profileButtonRef}
                    className="profile-chip"
                    type="button"
                    aria-haspopup="menu"
                    aria-controls="pulse-profile-menu"
                    aria-expanded={profileOpen}
                    onClick={() => setProfileOpen((value) => !value)}
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
                      <span
                        className="role-badge compact"
                        style={{
                          backgroundColor: currentUser.accessRole.color,
                          color: roleColorForeground(currentUser.accessRole.color)
                        }}
                      >
                        {currentUser.roleLabel}
                      </span>
                    </div>
                    <ChevronDown size={16} />
                  </button>
                  <AnimatePresence>
                    {profileOpen ? (
                      <m.div
                        ref={profileMenuRef}
                        id="pulse-profile-menu"
                        className="mini-popover profile-popover"
                        role="menu"
                        initial={{ opacity: 0, y: -9, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ duration: motionMode === "subtle" ? 0.14 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="profile-menu-identity">
                          <div className="avatar">{currentUser.name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <strong>{currentUser.name}</strong>
                            <p>{currentUser.email}</p>
                            <span
                              className="role-badge"
                              style={{
                                backgroundColor: currentUser.accessRole.color,
                                color: roleColorForeground(currentUser.accessRole.color)
                              }}
                            >
                              {currentUser.roleLabel}
                            </span>
                            <small>{workspace.name}</small>
                          </div>
                        </div>
                        <div className="profile-menu-section compact">
                          <span>Switch account</span>
                          <small>Sign out, then choose another account on the local login screen.</small>
                        </div>
                        <Link
                          href="/settings/account"
                          role="menuitem"
                          onNavigate={() => beginNavigation("/settings/account")}
                        >
                          <UserRound size={16} />
                          Account settings
                        </Link>
                        <Link
                          href="/settings/appearance"
                          role="menuitem"
                          onNavigate={() => beginNavigation("/settings/appearance")}
                        >
                          <Palette size={16} />
                          Appearance
                        </Link>
                        <button role="menuitem" type="button" onClick={() => void logout()}>
                          <LogOut size={16} />
                          Sign out
                        </button>
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <AnimatePresence>
                  {pendingHref ? (
                    <m.div
                      className="navigation-progress"
                      aria-hidden="true"
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 0.82, opacity: 1 }}
                      exit={{ scaleX: 1, opacity: 0 }}
                      transition={{ duration: motionMode === "subtle" ? 0.18 : 0.42, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                </AnimatePresence>
              </header>

              <div className="shell-body">
                <aside className="sidebar" aria-label="Pulse navigation">
                  <div className="sidebar-toggle-row">
                    <button
                      className="collapse-button"
                      type="button"
                      onClick={handleCollapsedToggle}
                      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                      title={collapsed ? "Expand navigation" : "Collapse navigation"}
                    >
                      {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
                      <span>{collapsed ? "Expand" : "Collapse"}</span>
                    </button>
                  </div>

                  <nav className="nav-list">
                    {visibleNavigationGroups.map((group) => (
                      <div className="nav-section" key={group.label}>
                        <span className="nav-section-label">{group.label}</span>
                        {group.items.map((item) => {
                          const active = isNavigationItemActive(pathname, item.key);
                          return (
                            <Link
                              key={item.key}
                              className={active ? "nav-link nav-link-active" : "nav-link"}
                              href={item.href}
                              title={collapsed ? item.label : undefined}
                              aria-current={active ? "page" : undefined}
                              onNavigate={() => beginNavigation(item.href)}
                            >
                              {active ? (
                                <m.span
                                  className="nav-active-indicator"
                                  layoutId="desktop-navigation-active"
                                  transition={{ type: "spring", stiffness: 430, damping: 36 }}
                                />
                              ) : null}
                              <item.icon size={20} strokeWidth={1.9} />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </nav>
                </aside>

                <main className={pathname === "/statistics" ? "main main-analytics" : "main"}>
                  <PageTransition
                    header={!shouldHideHeader ? (
                      <header className="page-header">
                        <div>
                          <nav className="breadcrumb" aria-label="Breadcrumb">
                            <Link href="/hub" onNavigate={() => beginNavigation("/hub")}>Home</Link>
                            <span>/</span>
                            <span>{breadcrumbLabel}</span>
                          </nav>
                          <h1 className="page-title">{pageTitle}</h1>
                          {pageIntro ? <p className="page-subtitle">{pageIntro}</p> : null}
                        </div>
                      </header>
                    ) : null}
                    isNavigating={Boolean(pendingHref)}
                    motionMode={motionMode}
                  >
                    {routeAllowed ? children : <AccessDenied />}
                  </PageTransition>
                </main>
              </div>

              <MobileBottomNav
                activeKey={mobileActiveKey}
                items={visibleMobilePrimaryItems}
                pathname={pathname}
                moreOpen={moreOpen}
                moreButtonRef={moreButtonRef}
                onMoreClick={() => setMoreOpen(true)}
                onNavigate={beginNavigation}
              />

              <AnimatePresence>
                {moreOpen ? (
                  <m.div
                    className="shell-dialog-backdrop mobile-more-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
                      if (event.target === event.currentTarget) setMoreOpen(false);
                    }}
                  >
                    <m.div
                      ref={moreDialogRef}
                      id="pulse-mobile-more"
                      className="mobile-more-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="pulse-mobile-more-title"
                      initial={{ opacity: 0, y: 54, scale: 0.975 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 32, scale: 0.985 }}
                      transition={{ type: "spring", stiffness: 350, damping: 32 }}
                    >
                      <div className="mobile-more-heading">
                        <div>
                          <span>Pulse navigation</span>
                          <h2 id="pulse-mobile-more-title">More</h2>
                        </div>
                        <button type="button" aria-label="Close navigation" onClick={() => setMoreOpen(false)}>
                          <X size={20} />
                        </button>
                      </div>
                      <div className="mobile-more-groups">
                        {visibleMobileOverflowGroups.map((group) => (
                          <section key={group.label}>
                            <h3>{group.label}</h3>
                            <div>
                              {group.items.map((item) => {
                                const exactActive =
                                  pathname === item.href ||
                                  (item.href === "/clients" && pathname.startsWith("/clients")) ||
                                  (item.href === "/contacts" && pathname.startsWith("/contacts")) ||
                                  (item.href === "/settings/account" && pathname.startsWith("/settings"));
                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={exactActive ? "page" : undefined}
                                    className={exactActive ? "active" : undefined}
                                    onNavigate={() => beginNavigation(item.href)}
                                  >
                                    <item.icon size={19} />
                                    <span>{item.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    </m.div>
                  </m.div>
                ) : null}
              </AnimatePresence>
            </div>
          </MotionConfig>
        </LazyMotion>
        </PulsePreferencesContext.Provider>
      </PulseShellContext.Provider>
    </PulseAuthContext.Provider>
  );
}
