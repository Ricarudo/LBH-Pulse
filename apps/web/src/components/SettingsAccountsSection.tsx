"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Plus, RotateCcw } from "lucide-react";
import { roleLabels, type LocalRole } from "@/lib/auth/permissions";
import type { LocalAccountRecord } from "@/types/localUser";

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
      setMessage(`${data.user.name} must change password on next login.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-accounts-workspace" aria-labelledby="accounts-title">
      <div className="settings-section-header">
        <div>
          <h3 id="accounts-title">Accounts</h3>
          <p>{message}</p>
        </div>
        <button
          className="toolbar-button compact"
          type="button"
          onClick={() => void loadAccounts(selectedUserId)}
          disabled={loading}
        >
          <RotateCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="settings-account-create">
        <div className="settings-item-toolbar">
          <strong>Create local account</strong>
          <button
            className="primary-button"
            type="button"
            onClick={() => void createAccount()}
            disabled={saving}
          >
            <Plus size={17} />
            Create User
          </button>
        </div>
        <div className="settings-form-grid">
          <label>
            <span>Name</span>
            <input
              value={createDraft.name}
              onChange={(event) => updateCreateDraft({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={createDraft.email}
              onChange={(event) => updateCreateDraft({ email: event.target.value })}
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={createDraft.role}
              onChange={(event) => updateCreateDraft({ role: event.target.value as LocalRole })}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Temporary password</span>
            <input
              type="password"
              value={createDraft.password}
              onChange={(event) => updateCreateDraft({ password: event.target.value })}
            />
          </label>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={createDraft.active}
              onChange={(event) => updateCreateDraft({ active: event.target.checked })}
            />
            <span>Active account</span>
          </label>
        </div>
      </div>

      <div className="settings-checklist-layout">
        <div className="settings-template-list" aria-label="Pulse accounts">
          {users.map((user) => (
            <button
              key={user.id}
              className={
                user.id === selectedUser?.id
                  ? "settings-template-button active"
                  : "settings-template-button"
              }
              type="button"
              onClick={() => selectUser(user)}
            >
              <strong>{user.name}</strong>
              <small>
                {user.roleLabel} - {user.active ? "Active" : "Inactive"}
              </small>
            </button>
          ))}
        </div>

        <div className="settings-checklist-editor">
          {selectedUser && editDraft ? (
            <>
              <div className="settings-account-summary">
                <span className={selectedUser.active ? "status-pill" : "status-pill danger"}>
                  {selectedUser.active ? "Active" : "Inactive"}
                </span>
                <span>{selectedUser.authProvider}</span>
                <span>Last login: {selectedUser.lastLoginAt || "Never"}</span>
                {selectedUser.mustChangePassword ? <span>Password change required</span> : null}
                {selectedUser.id === currentUserId ? <span>Current session</span> : null}
              </div>

              <div className="settings-form-grid">
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
                    onChange={(event) => updateEditDraft({ active: event.target.checked })}
                  />
                  <span>Active account</span>
                </label>
              </div>

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
                    type="password"
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                  />
                </label>
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
          ) : (
            <p className="panel-note">No Pulse accounts are available.</p>
          )}
        </div>
      </div>
    </section>
  );
}
