"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { canRole } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  requestTypes,
  serviceCategories
} from "@/types/request";
import type {
  RequestChecklistTemplateItemRecord,
  RequestChecklistTemplateRecord
} from "@/types/requestChecklistTemplate";

const defaultSettings = {
  localLogin: true,
  approvalAlerts: true,
  commandView: true,
  proposalOutputs: true,
  serviceModule: false
};

type TemplatesResponse = {
  templates: RequestChecklistTemplateRecord[];
};

type TemplateResponse = {
  template: RequestChecklistTemplateRecord;
};

async function settingsJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Settings request failed.");
  }

  return data as T;
}

function copyTemplate(template: RequestChecklistTemplateRecord) {
  return {
    ...template,
    items: template.items.map((item) => ({ ...item }))
  };
}

function sortedItems(items: RequestChecklistTemplateItemRecord[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function SettingsWorkspace() {
  const { user, isLoading } = useCurrentUser();
  const [settings, setSettings] = useState(defaultSettings);
  const [message, setMessage] = useState("Local settings are ready for review.");
  const [templates, setTemplates] = useState<RequestChecklistTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<RequestChecklistTemplateRecord | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesSaving, setTemplatesSaving] = useState(false);
  const canReadSettings = canRole(user?.role, "settings:read");
  const canWriteSettings = canRole(user?.role, "settings:write");

  async function loadTemplates(preferredTemplateId?: string) {
    try {
      setTemplatesLoading(true);
      const data = await settingsJson<TemplatesResponse>("/api/settings/request-checklists", {
        cache: "no-store"
      });
      const nextSelected =
        data.templates.find((template) => template.id === preferredTemplateId) ??
        data.templates.find((template) => template.id === selectedTemplateId) ??
        data.templates[0] ??
        null;

      setTemplates(data.templates);
      setSelectedTemplateId(nextSelected?.id ?? "");
      setTemplateDraft(nextSelected ? copyTemplate(nextSelected) : null);
      setMessage("Request checklist templates are loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load checklist templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && canReadSettings) {
      void loadTemplates();
    }
  }, [isLoading, canReadSettings]);

  if (!isLoading && !canReadSettings) {
    return (
      <section className="panel settings-panel" aria-labelledby="settings-title">
        <div className="panel-header">
          <div>
            <h2 id="settings-title">Workspace Settings</h2>
            <p className="panel-note">
              Your role does not allow access to workspace settings.
            </p>
          </div>
        </div>
      </section>
    );
  }

  function toggleSetting(key: keyof typeof defaultSettings) {
    setSettings((current) => ({
      ...current,
      [key]: !current[key]
    }));
    setMessage("You have unsaved local setting changes.");
  }

  function saveSettings() {
    setMessage("Settings saved locally for this starter mockup.");
  }

  function resetSettings() {
    setSettings(defaultSettings);
    setMessage("Settings reset to Pulse starter defaults.");
  }

  function selectTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    setSelectedTemplateId(templateId);
    setTemplateDraft(template ? copyTemplate(template) : null);
  }

  function updateTemplateDraft(
    updates: Partial<Pick<RequestChecklistTemplateRecord, "name" | "requestType" | "serviceCategory" | "active">>
  ) {
    setTemplateDraft((current) => (current ? { ...current, ...updates } : current));
  }

  function updateTemplateItem(
    index: number,
    updates: Partial<RequestChecklistTemplateItemRecord>
  ) {
    setTemplateDraft((current) => {
      if (!current) {
        return current;
      }

      const items = sortedItems(current.items).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      );

      return { ...current, items };
    });
  }

  function addTemplateItem() {
    setTemplateDraft((current) => {
      if (!current) {
        return current;
      }

      const nextSortOrder =
        current.items.reduce((largest, item) => Math.max(largest, item.sortOrder), 0) + 1;

      return {
        ...current,
        items: [
          ...current.items,
          {
            id: "",
            label: "New checklist item",
            description: "",
            required: true,
            appliesWhen: "",
            sortOrder: nextSortOrder,
            group: "Intake",
            active: true
          }
        ]
      };
    });
  }

  async function saveTemplate() {
    if (!templateDraft || !canWriteSettings) {
      setMessage("Your role does not allow editing checklist templates.");
      return;
    }

    try {
      setTemplatesSaving(true);
      const data = await settingsJson<TemplateResponse>(
        `/api/settings/request-checklists/${templateDraft.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: templateDraft.name,
            requestType: templateDraft.requestType,
            serviceCategory: templateDraft.serviceCategory,
            active: templateDraft.active,
            items: sortedItems(templateDraft.items).map((item) => ({
              id: item.id,
              label: item.label,
              description: item.description,
              required: item.required,
              appliesWhen: item.appliesWhen,
              sortOrder: item.sortOrder,
              group: item.group,
              active: item.active
            }))
          })
        }
      );

      setTemplates((current) =>
        current.map((template) => (template.id === data.template.id ? data.template : template))
      );
      setSelectedTemplateId(data.template.id);
      setTemplateDraft(copyTemplate(data.template));
      setMessage(`${data.template.name} saved for future Requests.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save checklist template.");
    } finally {
      setTemplatesSaving(false);
    }
  }

  const draftItems = templateDraft ? sortedItems(templateDraft.items) : [];

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-header">
        <div>
          <h2 id="settings-title">Workspace Settings</h2>
          <p className="panel-note">{message}</p>
        </div>
        <div className="workspace-actions">
          <button className="toolbar-button compact" type="button" onClick={resetSettings}>
            <RotateCcw size={17} />
            Reset
          </button>
          <button className="primary-button" type="button" onClick={saveSettings}>
            <CheckCircle2 size={17} />
            Save Settings
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <button className="setting-row" type="button" onClick={() => toggleSetting("localLogin")}>
          <span>
            <strong>Local development login</strong>
            <small>Keep the current local user picker available while Entra ID is designed.</small>
          </span>
          <span className={settings.localLogin ? "toggle on" : "toggle"} />
        </button>
        <button className="setting-row" type="button" onClick={() => toggleSetting("approvalAlerts")}>
          <span>
            <strong>Approval alerts</strong>
            <small>Show quote and billing approval reminders in Pulse.</small>
          </span>
          <span className={settings.approvalAlerts ? "toggle on" : "toggle"} />
        </button>
        <button className="setting-row" type="button" onClick={() => toggleSetting("commandView")}>
          <span>
            <strong>Command view</strong>
            <small>Keep the read-only operations board visible on the hub.</small>
          </span>
          <span className={settings.commandView ? "toggle on" : "toggle"} />
        </button>
        <button className="setting-row" type="button" onClick={() => toggleSetting("proposalOutputs")}>
          <span>
            <strong>Quote proposal outputs</strong>
            <small>Manage client proposal outputs as a quote subcategory.</small>
          </span>
          <span className={settings.proposalOutputs ? "toggle on" : "toggle"} />
        </button>
        <button className="setting-row disabled" type="button" onClick={() => toggleSetting("serviceModule")}>
          <span>
            <strong>Service module</strong>
            <small>Out of scope for the current Pulse starter.</small>
          </span>
          <span className={settings.serviceModule ? "toggle on" : "toggle"} />
        </button>
      </div>

      <section className="settings-checklist-workspace" aria-labelledby="request-checklists-title">
        <div className="settings-section-header">
          <div>
            <h3 id="request-checklists-title">Request Checklists</h3>
            <p>Templates saved here apply to new Requests only.</p>
          </div>
          <button
            className="toolbar-button compact"
            type="button"
            onClick={() => void loadTemplates(selectedTemplateId)}
            disabled={templatesLoading}
          >
            <RotateCcw size={16} />
            Refresh
          </button>
        </div>

        <div className="settings-checklist-layout">
          <div className="settings-template-list" aria-label="Request checklist templates">
            {templates.map((template) => (
              <button
                key={template.id}
                className={
                  template.id === selectedTemplateId
                    ? "settings-template-button active"
                    : "settings-template-button"
                }
                type="button"
                onClick={() => selectTemplate(template.id)}
              >
                <strong>{template.name}</strong>
                <small>
                  {template.serviceCategory || template.requestType || "Fallback"} -{" "}
                  {template.active ? "Active" : "Inactive"}
                </small>
              </button>
            ))}
          </div>

          <div className="settings-checklist-editor">
            {templateDraft ? (
              <>
                <div className="settings-form-grid">
                  <label>
                    <span>Template name</span>
                    <input
                      value={templateDraft.name}
                      onChange={(event) => updateTemplateDraft({ name: event.target.value })}
                      disabled={!canWriteSettings}
                    />
                  </label>
                  <label>
                    <span>Service category</span>
                    <select
                      value={templateDraft.serviceCategory}
                      onChange={(event) =>
                        updateTemplateDraft({
                          serviceCategory: event.target.value as RequestChecklistTemplateRecord["serviceCategory"]
                        })
                      }
                      disabled={!canWriteSettings}
                    >
                      <option value="">None</option>
                      {serviceCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Request type</span>
                    <select
                      value={templateDraft.requestType}
                      onChange={(event) =>
                        updateTemplateDraft({
                          requestType: event.target.value as RequestChecklistTemplateRecord["requestType"]
                        })
                      }
                      disabled={!canWriteSettings}
                    >
                      <option value="">None</option>
                      {requestTypes.map((requestType) => (
                        <option key={requestType} value={requestType}>{requestType}</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-checkbox-row">
                    <input
                      type="checkbox"
                      checked={templateDraft.active}
                      onChange={(event) => updateTemplateDraft({ active: event.target.checked })}
                      disabled={!canWriteSettings || templateDraft.key === "general"}
                    />
                    <span>Active template</span>
                  </label>
                </div>

                <div className="settings-item-toolbar">
                  <strong>Template Items</strong>
                  <button
                    className="toolbar-button compact"
                    type="button"
                    onClick={addTemplateItem}
                    disabled={!canWriteSettings}
                  >
                    <Plus size={16} />
                    Add Item
                  </button>
                </div>

                <div className="settings-item-list">
                  {draftItems.map((item, index) => (
                    <article
                      className={item.active ? "settings-item-row" : "settings-item-row inactive"}
                      key={item.id || `new-${index}`}
                    >
                      <label>
                        <span>Label</span>
                        <input
                          value={item.label}
                          onChange={(event) => updateTemplateItem(index, { label: event.target.value })}
                          disabled={!canWriteSettings}
                        />
                      </label>
                      <label>
                        <span>Group</span>
                        <input
                          value={item.group}
                          onChange={(event) => updateTemplateItem(index, { group: event.target.value })}
                          disabled={!canWriteSettings}
                        />
                      </label>
                      <label>
                        <span>Description</span>
                        <input
                          value={item.description}
                          onChange={(event) => updateTemplateItem(index, { description: event.target.value })}
                          disabled={!canWriteSettings}
                        />
                      </label>
                      <label>
                        <span>Applies when</span>
                        <select
                          value={item.appliesWhen}
                          onChange={(event) => updateTemplateItem(index, { appliesWhen: event.target.value })}
                          disabled={!canWriteSettings}
                        >
                          <option value="">Always</option>
                          <option value="siteVisitRequired">Site visit required</option>
                        </select>
                      </label>
                      <label>
                        <span>Order</span>
                        <input
                          type="number"
                          min="0"
                          value={item.sortOrder}
                          onChange={(event) =>
                            updateTemplateItem(index, {
                              sortOrder: Number.parseInt(event.target.value, 10) || 0
                            })
                          }
                          disabled={!canWriteSettings}
                        />
                      </label>
                      <label className="settings-checkbox-row">
                        <input
                          type="checkbox"
                          checked={item.required}
                          onChange={(event) => updateTemplateItem(index, { required: event.target.checked })}
                          disabled={!canWriteSettings}
                        />
                        <span>Required</span>
                      </label>
                      <label className="settings-checkbox-row">
                        <input
                          type="checkbox"
                          checked={item.active}
                          onChange={(event) => updateTemplateItem(index, { active: event.target.checked })}
                          disabled={!canWriteSettings}
                        />
                        <span>Active</span>
                      </label>
                    </article>
                  ))}
                </div>

                <div className="settings-editor-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveTemplate()}
                    disabled={!canWriteSettings || templatesSaving}
                  >
                    <CheckCircle2 size={17} />
                    Save Template
                  </button>
                </div>
              </>
            ) : (
              <p className="panel-note">No request checklist templates are available.</p>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
