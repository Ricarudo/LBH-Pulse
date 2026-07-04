"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Plus, RotateCcw, Search, X } from "lucide-react";
import { roleLabels, type LocalRole } from "@/lib/auth/permissions";
import type { LocalAccountRecord } from "@/types/localUser";
import { formatWorkspaceDate } from "@/lib/formatting";

type AccountsResponse = {
  users: LocalAccountRecord[];
};

type AccountResponse = {
  user: LocalAccountRecord;
};

const roleOptions: LocalRole[] = ["Admin", "Sales", "ProjectManager", "Technician"];

const blankCreateDraft = {
  name: "",
  email: "",
  role: "Sales" as LocalRole,
  password: "",
  active: true
};

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

type CreateDraft = typeof blankCreateDraft;

type EditDraft = {
  name: string;
  email: string;
  role: LocalRole;
  active: boolean;
};

async function accountJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Account request failed.");
  }

  return data as T;
}

function toEditDraft(user: LocalAccountRecord): EditDraft {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active
  };
}

function sortAccounts(users: LocalAccountRecord[]) {
  return [...users].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}

function replaceAccount(users: LocalAccountRecord[], account: LocalAccountRecord) {
  return sortAccounts(users.map((user) => (user.id === account.id ? account : user)));
}

export function SettingsAccountsSection({
  currentUserId
}: {
  currentUserId: string;
}) {
  const [users, setUsers] = useState<LocalAccountRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [createDraft, setCreateDraft] = useState<CreateDraft>(blankCreateDraft);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [revealedPassword, setRevealedPassword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [message, setMessage] = useState("Admin account controls are ready.");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users]
  );

  async function loadAccounts(preferredUserId?: string) {
    try {
      setLoading(true);
      const data = await accountJson<AccountsResponse>("/api/settings/accounts", {
        cache: "no-store"
      });
      const sortedUsers = sortAccounts(data.users);
      const nextSelected =
        sortedUsers.find((user) => user.id === preferredUserId) ??
        sortedUsers.find((user) => user.id === selectedUserId) ??
        sortedUsers[0] ??
        null;

      setUsers(sortedUsers);
      setSelectedUserId(nextSelected?.id ?? "");
      setEditDraft(nextSelected ? toEditDraft(nextSelected) : null);
      setMessage("Pulse accounts are loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Pulse accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      setEditDraft(toEditDraft(selectedUser));
    } else {
      setEditDraft(null);
    }
    setTemporaryPassword("");
  }, [selectedUser?.id]);

  function selectUser(user: LocalAccountRecord) {
    setSelectedUserId(user.id);
    setEditDraft(toEditDraft(user));
    setTemporaryPassword("");
  }

  function updateCreateDraft(updates: Partial<CreateDraft>) {
    setCreateDraft((current) => ({ ...current, ...updates }));
    setMessage("You have unsaved account changes.");
  }

  function updateEditDraft(updates: Partial<EditDraft>) {
    setEditDraft((current) => (current ? { ...current, ...updates } : current));
    setMessage("You have unsaved account changes.");
  }

  async function createAccount() {
    try {
      setSaving(true);
      const data = await accountJson<AccountResponse>("/api/settings/accounts", {
        method: "POST",
        body: JSON.stringify(createDraft)
      });

      setUsers((current) => sortAccounts([...current, data.user]));
      setSelectedUserId(data.user.id);
      setEditDraft(toEditDraft(data.user));
      setCreateDraft(blankCreateDraft);
      setRevealedPassword(createDraft.password);
      setCreateOpen(false);
      setMessage(`${data.user.name} can now sign in with a temporary password.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create Pulse account.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedAccount() {
    if (!selectedUser || !editDraft) {
      return;
    }

    try {
      setSaving(true);
      const data = await accountJson<AccountResponse>(
        `/api/settings/accounts/${selectedUser.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(editDraft)
        }
      );

      setUsers((current) => replaceAccount(current, data.user));
      setSelectedUserId(data.user.id);
      setEditDraft(toEditDraft(data.user));
      setMessage(`${data.user.name} account saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Pulse account.");
    } finally {
      setSaving(false);
    }
  }

  async function resetSelectedPassword() {
    if (!selectedUser || !temporaryPassword) {
      setMessage("Enter a temporary password before resetting this account.");
      return;
    }

    try {
      setSaving(true);
      const data = await accountJson<AccountResponse>(
        `/api/settings/accounts/${selectedUser.id}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({ temporaryPassword })
        }
      );

      setUsers((current) => replaceAccount(current, data.user));
      setSelectedUserId(data.user.id);
      setEditDraft(toEditDraft(data.user));
      setTemporaryPassword("");
      setRevealedPassword(temporaryPassword);
      setMessage(`${data.user.name} must change password on next login.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter((account) => {
    const matchesQuery = `${account.name} ${account.email} ${account.roleLabel}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? account.active : !account.active);
    return matchesQuery && matchesStatus;
  });

  return (
    <section className="settings-accounts-workspace" aria-labelledby="accounts-title">
      <div className="settings-section-header">
        <div>
          <h2 id="accounts-title">Users & access</h2>
          <p>Provision local accounts, assign roles, and review access status.</p>
        </div>
        <div className="workspace-actions">
          <button className="toolbar-button compact" type="button" onClick={() => void loadAccounts(selectedUserId)} disabled={loading}><RotateCcw size={16} />Refresh</button>
          <button className="primary-button" type="button" onClick={() => {
            const password = generateTemporaryPassword();
            setCreateDraft({ ...blankCreateDraft, password });
            setCreateOpen(true);
          }}><Plus size={17} />New user</button>
        </div>
      </div>

      {revealedPassword ? <div className="settings-secret-banner" role="status"><div><strong>Temporary password</strong><p>Copy it now. It will not be shown again after you leave this screen.</p><code>{revealedPassword}</code></div><button className="toolbar-button compact" onClick={() => void navigator.clipboard.writeText(revealedPassword)}><Copy size={16} />Copy</button><button className="icon-button" aria-label="Dismiss temporary password" onClick={() => setRevealedPassword("")}><X size={16} /></button></div> : null}
      {message ? <div className="settings-inline-message" aria-live="polite">{message}</div> : null}

      <div className="settings-table-toolbar">
        <label className="settings-search"><Search size={16} /><input aria-label="Search users" placeholder="Search name, email, or role" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filter users by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>

      <div className="settings-users-layout">
        <div className="settings-user-table-wrap">
          <table className="settings-user-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Provider</th><th>Last sign-in</th></tr></thead><tbody>
            {filteredUsers.map((account) => <tr key={account.id} className={selectedUser?.id === account.id ? "selected" : ""} onClick={() => selectUser(account)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") selectUser(account); }}>
              <td><span className="settings-user-avatar">{account.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></td>
              <td>{account.roleLabel}</td><td><span className={account.active ? "status-pill success" : "status-pill danger"}>{account.active ? "Active" : "Inactive"}</span></td><td>{account.authProvider}</td><td>{formatWorkspaceDate(account.lastLoginAt, true) || "Never"}</td>
            </tr>)}
          </tbody></table>
          {!filteredUsers.length ? <p className="settings-empty">No users match these filters.</p> : null}
        </div>
        <aside className="settings-user-detail settings-card">
          {selectedUser && editDraft ? (
            <>
              <div className="settings-section-title"><div><h3>{selectedUser.name}</h3><p>{selectedUser.email}</p></div></div>
              <div className="settings-account-summary">
                <span className={selectedUser.active ? "status-pill" : "status-pill danger"}>
                  {selectedUser.active ? "Active" : "Inactive"}
                </span>
                <span>{selectedUser.authProvider}</span>
                <span>Last login: {selectedUser.lastLoginAt || "Never"}</span>
                {selectedUser.mustChangePassword ? <span>Password change required</span> : null}
                {selectedUser.id === currentUserId ? <span>Current session</span> : null}
              </div>

              <div className="settings-form settings-user-edit-form">
                <label>
                  <span>Name</span>
                  <input
                    value={editDraft.name}
                    onChange={(event) => updateEditDraft({ name: event.target.value })}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={editDraft.email}
                    onChange={(event) => updateEditDraft({ email: event.target.value })}
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={editDraft.role}
                    disabled={selectedUser.id === currentUserId}
                    onChange={(event) => updateEditDraft({ role: event.target.value as LocalRole })}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={editDraft.active}
                    disabled={selectedUser.id === currentUserId}
                    onChange={(event) => updateEditDraft({ active: event.target.checked })}
                  />
                  <span>Active account</span>
                </label>
              </div>

              {selectedUser.id === currentUserId ? <p className="settings-callout">Another administrator must change your role or account status.</p> : null}
              <div className="settings-editor-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void saveSelectedAccount()}
                  disabled={saving}
                >
                  <CheckCircle2 size={17} />
                  Save Account
                </button>
              </div>

              <div className="settings-password-reset">
                <div>
                  <strong>Reset password</strong>
                  <p>Set a temporary local password. The user must change it on next login.</p>
                </div>
                <label>
                  <span>Temporary password</span>
                  <input
                    type="text"
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                  />
                </label>
                <button className="toolbar-button compact" type="button" onClick={() => setTemporaryPassword(generateTemporaryPassword())}>Generate</button>
                <button
                  className="toolbar-button compact"
                  type="button"
                  onClick={() => void resetSelectedPassword()}
                  disabled={saving || selectedUser.authProvider !== "LOCAL"}
                >
                  <KeyRound size={16} />
                  Reset Password
                </button>
              </div>
            </>
          ) : <p className="settings-empty">Select a user to review access.</p>}
        </aside>
      </div>

      {createOpen ? <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title"><div className="settings-section-title"><div><h2 id="create-user-title">Create local user</h2><p>The user must change this temporary password at first sign-in.</p></div><button className="icon-button" aria-label="Close" onClick={() => setCreateOpen(false)}><X size={18} /></button></div>
        <div className="settings-form settings-create-user-form">
          <label><span>Name</span><input autoFocus value={createDraft.name} onChange={(event) => updateCreateDraft({ name: event.target.value })} /></label>
          <label><span>Email</span><input type="email" value={createDraft.email} onChange={(event) => updateCreateDraft({ email: event.target.value })} /></label>
          <label><span>Role</span><select value={createDraft.role} onChange={(event) => updateCreateDraft({ role: event.target.value as LocalRole })}>{roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
          <label><span>Temporary password</span><div className="settings-input-action"><input value={createDraft.password} minLength={10} onChange={(event) => updateCreateDraft({ password: event.target.value })} /><button type="button" onClick={() => updateCreateDraft({ password: generateTemporaryPassword() })}>Regenerate</button></div></label>
          <label className="settings-checkbox-row"><input type="checkbox" checked={createDraft.active} onChange={(event) => updateCreateDraft({ active: event.target.checked })} /><span>Active account</span></label>
        </div>
        <div className="settings-modal-actions"><button className="toolbar-button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" onClick={() => void createAccount()} disabled={saving}>{saving ? "Creating…" : "Create user"}</button></div>
      </section></div> : null}
    </section>
  );
}
