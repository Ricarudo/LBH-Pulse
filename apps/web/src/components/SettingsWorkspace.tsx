"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";

const defaultSettings = {
  localLogin: true,
  approvalAlerts: true,
  commandView: true,
  proposalOutputs: true,
  serviceModule: false
};

export function SettingsWorkspace() {
  const [settings, setSettings] = useState(defaultSettings);
  const [message, setMessage] = useState("Local settings are ready for review.");

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
    </section>
  );
}

