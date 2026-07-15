"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
  X
} from "lucide-react";
import {
  normalizePermissions,
  permissionDefinitions,
  roleColorForeground,
  type AccessRoleRecord,
  type Permission
} from "@pulse/contracts/access-control";
import { ViewportPortal } from "@/components/ViewportPortal";

type RolesResponse = { roles: AccessRoleRecord[] };
type RoleResponse = { role: AccessRoleRecord };

const resourceLabels: Record<string, string> = {
  requests: "Requests",
  clients: "Clients, contacts & sites",
  items: "Item catalog",
  quotes: "Quotes & proposals",
  projects: "Projects",
  billing: "Billing",
  collaboration: "Collaboration",
  activity: "Recent changes",
  analytics: "Analytics",
  audit: "Security audit",
  settings: "Workspace administration",
  users: "User administration",
  roles: "Role administration"
};

async function roleJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Role request failed.");
  }
  return data as T;
}

function comparable(roles: AccessRoleRecord[]) {
  return roles
    .filter((role) => !role.archived)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: [...role.permissions].sort()
    }));
}

function requiredBy(permissions: Permission[], dependency: Permission) {
  return permissions.find(
    (permission) => permission !== dependency && normalizePermissions([permission]).includes(dependency)
  );
}

function PermissionToggle({
  role,
  permission,
  onToggle,
  showState = false
}: {
  role: AccessRoleRecord;
  permission: Permission;
  onToggle: (roleId: string, permission: Permission) => void;
  showState?: boolean;
}) {
  const definition = permissionDefinitions.find((item) => item.key === permission)!;
  const checked = role.protected || role.permissions.includes(permission);
  const dependency = requiredBy(role.permissions, permission);
  const dependencyLabel = permissionDefinitions.find((item) => item.key === dependency)?.label ?? dependency;
  const disabled = role.protected || Boolean(definition.protected) || Boolean(dependency);
  const title = role.protected
    ? "Administrator always has full access."
    : definition.protected
      ? "This permission is reserved for Administrator."
      : dependency
        ? `Required by ${dependencyLabel}.`
        : undefined;
  const stateLabel = role.protected
    ? "Locked on"
    : definition.protected
      ? "Administrator only"
      : dependency
        ? `Required by ${dependencyLabel}`
        : checked
          ? "On"
          : "Off";
  const stateId = `permission-state-${role.id}-${permission.replace(":", "-")}`;

  const toggle = (
    <button
      className={checked ? "toggle on access-toggle" : "toggle access-toggle"}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${role.name}: ${definition.label} ${resourceLabels[definition.resource]}`}
      aria-describedby={showState ? stateId : undefined}
      disabled={disabled}
      title={title}
      onClick={() => onToggle(role.id, permission)}
    >
      <span className="sr-only">{checked ? "Enabled" : "Disabled"}</span>
    </button>
  );

  if (!showState) return toggle;

  return (
    <div className="settings-role-toggle-control">
      {toggle}
      <span
        id={stateId}
        className={disabled ? "settings-role-toggle-state is-locked" : "settings-role-toggle-state"}
      >
        {stateLabel}
      </span>
    </div>
  );
}

export function SettingsRolesSection() {
  const [roles, setRoles] = useState<AccessRoleRecord[]>([]);
  const [drafts, setDrafts] = useState<AccessRoleRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [message, setMessage] = useState("Loading roles…");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("#64748B");
  const [copyFromRoleId, setCopyFromRoleId] = useState("");
  const [archiveRole, setArchiveRole] = useState<AccessRoleRecord | null>(null);
  const [replacementRoleId, setReplacementRoleId] = useState("");

  const activeSavedRoles = roles.filter((role) => !role.archived);
  const archivedRoles = roles.filter((role) => role.archived);
  const dirty = useMemo(
    () => JSON.stringify(comparable(drafts)) !== JSON.stringify(comparable(activeSavedRoles)),
    [activeSavedRoles, drafts]
  );
  const selectedRole = drafts.find((role) => role.id === selectedRoleId) ?? drafts[0];

  async function loadRoles(preferredRoleId?: string) {
    try {
      setLoading(true);
      const data = await roleJson<RolesResponse>("/api/settings/roles", { cache: "no-store" });
      const active = data.roles.filter((role) => !role.archived);
      setRoles(data.roles);
      setDrafts(active);
      setSelectedRoleId(
        active.some((role) => role.id === preferredRoleId)
          ? preferredRoleId!
          : active.some((role) => role.id === selectedRoleId)
            ? selectedRoleId
            : active[0]?.id ?? ""
      );
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load roles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateRole(roleId: string, updates: Partial<AccessRoleRecord>) {
    setDrafts((current) => current.map((role) => role.id === roleId ? { ...role, ...updates } : role));
    setMessage("You have unsaved role changes.");
  }

  function togglePermission(roleId: string, permission: Permission) {
    const role = drafts.find((candidate) => candidate.id === roleId);
    if (!role || role.protected || permission === "roles:manage") return;
    if (role.permissions.includes(permission)) {
      const dependency = requiredBy(role.permissions, permission);
      if (dependency) {
        const label = permissionDefinitions.find((item) => item.key === dependency)?.label ?? dependency;
        setMessage(`${permissionDefinitions.find((item) => item.key === permission)?.label ?? permission} is required by ${label}.`);
        return;
      }
      updateRole(roleId, { permissions: role.permissions.filter((item) => item !== permission) });
      return;
    }
    updateRole(roleId, { permissions: normalizePermissions([...role.permissions, permission]) });
  }

  async function saveMatrix() {
    try {
      setSaving(true);
      const data = await roleJson<RolesResponse>("/api/settings/roles/matrix", {
        method: "PUT",
        body: JSON.stringify({
          roles: drafts.map((role) => ({
            id: role.id,
            version: role.version,
            name: role.name,
            color: role.color,
            permissions: role.permissions
          }))
        })
      });
      const active = data.roles.filter((role) => !role.archived);
      setRoles(data.roles);
      setDrafts(active);
      setMessage("Role access saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save role access.");
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    try {
      setSaving(true);
      const data = await roleJson<RoleResponse>("/api/settings/roles", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          color: createColor,
          copyFromRoleId: copyFromRoleId || null
        })
      });
      setCreateOpen(false);
      setCreateName("");
      setCopyFromRoleId("");
      await loadRoles(data.role.id);
      setMessage(`${data.role.name} created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create role.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveRole) return;
    try {
      setSaving(true);
      const data = await roleJson<RolesResponse>(`/api/settings/roles/${encodeURIComponent(archiveRole.id)}/archive`, {
        method: "POST",
        body: JSON.stringify({
          version: archiveRole.version,
          replacementRoleId: archiveRole.assignedUserCount ? replacementRoleId : null
        })
      });
      setArchiveRole(null);
      setReplacementRoleId("");
      setRoles(data.roles);
      setDrafts(data.roles.filter((role) => !role.archived));
      setMessage(`${archiveRole.name} archived.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive role.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreRole(role: AccessRoleRecord) {
    try {
      setSaving(true);
      const data = await roleJson<RolesResponse>(`/api/settings/roles/${encodeURIComponent(role.id)}/restore`, {
        method: "POST",
        body: JSON.stringify({ version: role.version })
      });
      setRoles(data.roles);
      setDrafts(data.roles.filter((item) => !item.archived));
      setSelectedRoleId(role.id);
      setMessage(`${role.name} restored.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore role.");
    } finally {
      setSaving(false);
    }
  }

  const groupedDefinitions = permissionDefinitions.reduce<Array<{ resource: string; definitions: typeof permissionDefinitions }>>(
    (groups, definition) => {
      const previous = groups.at(-1);
      if (previous?.resource === definition.resource) previous.definitions.push(definition);
      else groups.push({ resource: definition.resource, definitions: [definition] });
      return groups;
    },
    []
  );

  return (
    <section className="settings-access-workspace" aria-labelledby="roles-title">
      <div className="settings-section-header">
        <div>
          <h2 id="roles-title">Access matrix</h2>
          <p>Compare effective access, create custom roles, and keep every module enforced by the API.</p>
        </div>
        <div className="workspace-actions">
          <button className="toolbar-button compact" type="button" onClick={() => void loadRoles(selectedRoleId)} disabled={loading || dirty}><RotateCcw size={16} />Refresh</button>
          <button className="toolbar-button compact" type="button" onClick={() => { setDrafts(activeSavedRoles); setMessage("Unsaved changes discarded."); }} disabled={!dirty || saving}><Undo2 size={16} />Discard</button>
          <button className="primary-button" type="button" onClick={() => void saveMatrix()} disabled={!dirty || saving}><Save size={17} />{saving ? "Saving…" : "Save changes"}</button>
          <button className="primary-button" type="button" onClick={() => setCreateOpen(true)} disabled={dirty || saving}><Plus size={17} />New role</button>
        </div>
      </div>

      <div className={dirty ? "settings-role-save-state dirty" : "settings-role-save-state"} aria-live="polite">
        {dirty ? <><ShieldCheck size={17} /><strong>Unsaved permission changes</strong></> : <><CheckCircle2 size={17} /><strong>Role matrix is up to date</strong></>}
        <span>{message}</span>
      </div>

      <label className="settings-role-mobile-select">
        <span>Role</span>
        <select value={selectedRole?.id ?? ""} onChange={(event) => setSelectedRoleId(event.target.value)}>
          {drafts.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>

      <div className="settings-role-matrix-wrap" aria-busy={loading}>
        <table className="settings-role-matrix">
          <thead>
            <tr>
              <th className="permission-column">Permission</th>
              {drafts.map((role) => (
                <th key={role.id} className={selectedRole?.id === role.id ? "selected-role-column" : ""}>
                  <div className="settings-role-header">
                    <span className="role-badge" style={{ backgroundColor: role.color, color: roleColorForeground(role.color) }}>{role.name}</span>
                    <small>{role.assignedUserCount} user{role.assignedUserCount === 1 ? "" : "s"}</small>
                    <label><span className="sr-only">{role.name} name</span><input value={role.name} maxLength={50} disabled={role.protected} onFocus={() => setSelectedRoleId(role.id)} onChange={(event) => updateRole(role.id, { name: event.target.value })} /></label>
                    <label className="role-color-input"><span className="sr-only">{role.name} color</span><input type="color" value={role.color} onFocus={() => setSelectedRoleId(role.id)} onChange={(event) => updateRole(role.id, { color: event.target.value.toUpperCase() })} /><code>{role.color}</code></label>
                    {role.protected ? <span className="settings-role-protected"><LockKeyhole size={13} />Protected</span> : <button type="button" className="settings-role-archive-button" disabled={dirty || saving} onClick={() => { setArchiveRole(role); setReplacementRoleId(drafts.find((item) => item.id !== role.id)?.id ?? ""); }}><Archive size={14} />Archive</button>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedDefinitions.map((group) => group.definitions.map((definition, index) => (
              <tr key={definition.key} className={index === 0 ? "permission-group-start" : ""}>
                <th className="permission-column">
                  {index === 0 ? <span className="permission-resource">{resourceLabels[group.resource]}</span> : null}
                  <strong>{definition.label}</strong>
                  <small>{definition.description}</small>
                </th>
                {drafts.map((role) => (
                  <td key={role.id} className={selectedRole?.id === role.id ? "selected-role-column" : ""}>
                    <PermissionToggle role={role} permission={definition.key} onToggle={togglePermission} />
                  </td>
                ))}
              </tr>
            ))) }
          </tbody>
        </table>
      </div>

      {selectedRole ? (
        <div className="settings-role-mobile-card settings-card">
          <div className="settings-section-title">
            <div><span className="role-badge" style={{ backgroundColor: selectedRole.color, color: roleColorForeground(selectedRole.color) }}>{selectedRole.name}</span><p>{selectedRole.assignedUserCount} assigned users</p></div>
          </div>
          {groupedDefinitions.map((group) => (
            <section key={group.resource} className="settings-role-mobile-group">
              <h3>{resourceLabels[group.resource]}</h3>
              {group.definitions.map((definition) => <div key={definition.key}><span><strong>{definition.label}</strong><small>{definition.description}</small></span><PermissionToggle role={selectedRole} permission={definition.key} onToggle={togglePermission} showState /></div>)}
            </section>
          ))}
        </div>
      ) : null}

      {archivedRoles.length ? (
        <section className="settings-card settings-archived-roles">
          <div className="settings-card-heading"><div><h2>Archived roles</h2><p>Archived roles keep their permission history and can be restored without moving users back.</p></div></div>
          {archivedRoles.map((role) => <div key={role.id}><span className="role-badge" style={{ backgroundColor: role.color, color: roleColorForeground(role.color) }}>{role.name}</span><button className="toolbar-button compact" type="button" disabled={dirty || saving} onClick={() => void restoreRole(role)}><RotateCcw size={15} />Restore</button></div>)}
        </section>
      ) : null}

      {createOpen ? (
        <ViewportPortal>
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}>
            <form className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="create-role-title" onSubmit={(event) => { event.preventDefault(); void createRole(); }}>
              <div className="settings-section-title"><div><h2 id="create-role-title">Create role</h2><p>Start blank or copy effective permissions from an active role.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setCreateOpen(false)}><X size={18} /></button></div>
              <div className="settings-form settings-create-role-form">
                <label><span>Name</span><input autoFocus required minLength={2} maxLength={50} value={createName} onChange={(event) => setCreateName(event.target.value)} /></label>
                <label><span>Color</span><div className="settings-role-color-editor"><input type="color" value={createColor} onChange={(event) => setCreateColor(event.target.value.toUpperCase())} /><input pattern="#[0-9A-Fa-f]{6}" value={createColor} onChange={(event) => setCreateColor(event.target.value)} /><span className="role-badge" style={{ backgroundColor: createColor, color: roleColorForeground(createColor) }}>Preview</span></div></label>
                <label><span>Starting permissions</span><select value={copyFromRoleId} onChange={(event) => setCopyFromRoleId(event.target.value)}><option value="">No access</option>{drafts.map((role) => <option key={role.id} value={role.id}>Copy {role.name}</option>)}</select></label>
              </div>
              <div className="settings-modal-actions"><button className="toolbar-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving || createName.trim().length < 2}>{saving ? "Creating…" : "Create role"}</button></div>
            </form>
          </div>
        </ViewportPortal>
      ) : null}

      {archiveRole ? (
        <ViewportPortal>
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setArchiveRole(null)}>
            <form className="settings-modal" role="alertdialog" aria-modal="true" aria-labelledby="archive-role-title" onSubmit={(event) => { event.preventDefault(); void confirmArchive(); }}>
              <div className="settings-section-title"><div><h2 id="archive-role-title">Archive {archiveRole.name}?</h2><p>The role remains in audit history and can be restored later.</p></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setArchiveRole(null)}><X size={18} /></button></div>
              {archiveRole.assignedUserCount ? <label className="settings-form"><span>Move {archiveRole.assignedUserCount} assigned user{archiveRole.assignedUserCount === 1 ? "" : "s"} to</span><select required value={replacementRoleId} onChange={(event) => setReplacementRoleId(event.target.value)}>{drafts.filter((role) => role.id !== archiveRole.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label> : <p className="settings-callout">No users are assigned to this role.</p>}
              <div className="settings-modal-actions"><button className="toolbar-button" type="button" onClick={() => setArchiveRole(null)}>Cancel</button><button className="primary-button danger" disabled={saving || (archiveRole.assignedUserCount > 0 && !replacementRoleId)}><Archive size={16} />{saving ? "Archiving…" : "Archive role"}</button></div>
            </form>
          </div>
        </ViewportPortal>
      ) : null}
    </section>
  );
}
