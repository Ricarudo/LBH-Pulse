"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ClipboardCheck,
  KeyRound,
  Palette,
  Plug,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canRole } from "@/lib/auth/permissions";
import { usePulsePreferences } from "@/components/PulseShell";
import { SettingsAccountsSection } from "@/components/SettingsAccountsSection";
import { SettingsChecklistsSection } from "@/components/SettingsChecklistsSection";
import type { ThemeMode, AccentTheme, WorkspaceSettingsRecord } from "@/types/settings";

export type SettingsSection =
  | "account"
  | "appearance"
  | "general"
  | "users"
  | "request-checklists"
  | "roadmap";

const personalTabs = [
  { key: "account", label: "Account", icon: UserRound },
  { key: "appearance", label: "Appearance", icon: Palette }
] as const;

const adminTabs = [
  { key: "general", label: "General", icon: Building2 },
  { key: "users", label: "Users & access", icon: UsersRound },
  { key: "request-checklists", label: "Request checklists", icon: ClipboardCheck },
  { key: "roadmap", label: "Roadmap", icon: Plug }
] as const;

async function responseJson<T>(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Unable to save settings.");
  }
  return data as T;
}

function AccountSection() {
  const { user } = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }
    try {
      setSaving(true);
      await responseJson(await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <div className="settings-empty">Loading account…</div>;
  return (
    <div className="settings-content-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><UserRound size={20} /></div>
          <div><h2>Your account</h2><p>Identity and access assigned to your Pulse account.</p></div>
        </div>
        <dl className="settings-definition-grid">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd>{user.roleLabel}</dd></div>
          <div><dt>Sign-in provider</dt><dd>{user.authProvider === "LOCAL" ? "Local account" : "Microsoft Entra"}</dd></div>
        </dl>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><KeyRound size={20} /></div>
          <div><h2>Password</h2><p>Use at least 10 characters and avoid reused passwords.</p></div>
        </div>
        {user.authProvider === "LOCAL" ? (
          <form className="settings-form settings-password-form" onSubmit={savePassword}>
            <label><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label><span>New password</span><input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
            <label><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            <div className="settings-form-actions">
              {message ? <p className="settings-inline-message" aria-live="polite">{message}</p> : <span />}
              <button className="primary-button" disabled={saving}>{saving ? "Updating…" : "Update password"}</button>
            </div>
          </form>
        ) : <p className="settings-callout">Password changes are managed by your Microsoft Entra administrator.</p>}
      </section>
    </div>
  );
}

const modes: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow this device" },
  { value: "light", label: "Light", description: "Bright surfaces" },
  { value: "dark", label: "Dark", description: "Low-light comfort" }
];
const accents: Array<{ value: AccentTheme; label: string }> = [
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
  { value: "teal", label: "Teal" },
  { value: "orange", label: "Orange" }
];

function AppearanceSection() {
  const { themeMode, accentTheme, saveAppearance } = usePulsePreferences();
  const [message, setMessage] = useState("");

  async function update(next: { themeMode: ThemeMode; accentTheme: AccentTheme }) {
    try {
      setMessage("Saving…");
      await saveAppearance(next);
      setMessage("Appearance saved to your account.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save appearance.");
    }
  }

  return (
    <div className="settings-content-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon-box"><Palette size={20} /></div>
          <div><h2>Color mode</h2><p>Choose a mode or let Pulse follow this device.</p></div>
        </div>
        <div className="appearance-choice-grid">
          {modes.map((mode) => (
            <button key={mode.value} className={themeMode === mode.value ? "appearance-choice selected" : "appearance-choice"} onClick={() => void update({ themeMode: mode.value, accentTheme })}>
              <span className={`appearance-preview ${mode.value}`} />
              <strong>{mode.label}{themeMode === mode.value ? <Check size={16} /> : null}</strong>
              <small>{mode.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading"><div><h2>Accent color</h2><p>Used for navigation, focus, and primary actions.</p></div></div>
        <div className="accent-choice-row">
          {accents.map((accent) => (
            <button key={accent.value} className={accentTheme === accent.value ? "accent-choice selected" : "accent-choice"} onClick={() => void update({ themeMode, accentTheme: accent.value })}>
              <span className={`accent-swatch ${accent.value}`} />
              {accent.label}{accentTheme === accent.value ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
        <p className="settings-inline-message" aria-live="polite">{message}</p>
      </section>
    </div>
  );
}

function GeneralSection() {
  const { workspace, setWorkspaceContext } = usePulsePreferences();
  const [draft, setDraft] = useState<WorkspaceSettingsRecord>(workspace);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const timeZones = useMemo(() => {
    const supportedValuesOf = (Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    }).supportedValuesOf;
    return supportedValuesOf
      ? supportedValuesOf("timeZone")
      : ["America/Puerto_Rico", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"];
  }, []);
  useEffect(() => setDraft(workspace), [workspace]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(workspace), [draft, workspace]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      const data = await responseJson<{ workspace: WorkspaceSettingsRecord }>(await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      }));
      setWorkspaceContext(data.workspace);
      setDraft(data.workspace);
      setMessage("Workspace settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save workspace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <div className="settings-icon-box"><Building2 size={20} /></div>
        <div><h2>Workspace identity & region</h2><p>These defaults format dates and provide workspace context across Pulse.</p></div>
      </div>
      <form className="settings-form settings-general-form" onSubmit={save}>
        <label className="wide"><span>Workspace name</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="wide"><span>Time zone</span><input list="pulse-time-zones" value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })} /><datalist id="pulse-time-zones">{timeZones.map((zone) => <option key={zone} value={zone} />)}</datalist></label>
        <label><span>Formatting locale</span><select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as WorkspaceSettingsRecord["locale"] })}><option value="en-US">English (United States)</option><option value="es-PR">Español (Puerto Rico)</option></select></label>
        <label><span>Date format</span><select value={draft.dateFormat} onChange={(event) => setDraft({ ...draft, dateFormat: event.target.value as WorkspaceSettingsRecord["dateFormat"] })}><option>MM/DD/YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></label>
        <label><span>Week starts on</span><select value={draft.weekStartsOn} onChange={(event) => setDraft({ ...draft, weekStartsOn: Number(event.target.value) as 0 | 1 })}><option value={0}>Sunday</option><option value={1}>Monday</option></select></label>
        <div className="settings-form-actions wide">
          <p className="settings-inline-message" aria-live="polite">{message || (dirty ? "You have unsaved changes." : "")}</p>
          <button className="primary-button" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </section>
  );
}

function RoadmapSection() {
  const cards = [
    { icon: Bell, title: "Notifications", text: "A real inbox, read state, and delivery preferences will arrive together." },
    { icon: ShieldCheck, title: "Microsoft Entra", text: "Single sign-on and directory provisioning are planned after local access is stabilized." },
    { icon: Plug, title: "Integrations", text: "Connected services will appear here only when status and setup controls are useful." }
  ];
  return (
    <div className="settings-roadmap-grid">
      {cards.map((card) => <article className="settings-card roadmap-card" key={card.title}><div className="settings-icon-box"><card.icon size={21} /></div><span className="status-pill">Planned</span><h2>{card.title}</h2><p>{card.text}</p></article>)}
    </div>
  );
}

export function SettingsWorkspace({ section }: { section: SettingsSection }) {
  const { user, isLoading } = useCurrentUser();
  const isAdmin = canRole(user?.role, "settings:read");
  const tabs = isAdmin ? [...personalTabs, ...adminTabs] : personalTabs;
  const allowed = tabs.some((tab) => tab.key === section);
  const active = allowed ? section : "account";
  const activeTab = tabs.find((tab) => tab.key === active) ?? personalTabs[0];

  if (isLoading) return <div className="settings-shell settings-loading" aria-live="polite">Loading settings…</div>;
  return (
    <section className="settings-shell">
      <div className="settings-intro">
        <div>
          <nav className="breadcrumb settings-breadcrumb" aria-label="Breadcrumb">
            <Link href="/hub">Home</Link>
            <span>/</span>
            <span>Settings</span>
          </nav>
          <h1>{activeTab.label}</h1>
          <p className="settings-summary">
            <strong>Preferences & administration</strong>
            <span aria-hidden="true"> · </span>
            Manage your account and the way this workspace operates.
          </p>
        </div>
      </div>
      <nav className="settings-tabs" aria-label="Settings categories">
        {tabs.map((tab) => <Link key={tab.key} href={`/settings/${tab.key}`} className={active === tab.key ? "settings-tab active" : "settings-tab"} aria-current={active === tab.key ? "page" : undefined}><tab.icon size={17} /><span>{tab.label}</span></Link>)}
      </nav>
      <label className="settings-mobile-nav"><span>Settings category</span><select value={active} onChange={(event) => { window.location.href = `/settings/${event.target.value}`; }}>{tabs.map((tab) => <option value={tab.key} key={tab.key}>{tab.label}</option>)}</select></label>
      <div className="settings-content">
        {active === "account" ? <AccountSection /> : null}
        {active === "appearance" ? <AppearanceSection /> : null}
        {active === "general" ? <GeneralSection /> : null}
        {active === "users" && user ? <SettingsAccountsSection currentUserId={user.id} /> : null}
        {active === "request-checklists" ? <SettingsChecklistsSection /> : null}
        {active === "roadmap" ? <RoadmapSection /> : null}
      </div>
    </section>
  );
}
