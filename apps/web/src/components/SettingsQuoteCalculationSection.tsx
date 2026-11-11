"use client";
import { useEffect, useState } from "react";
import { STANDARD_LABOR_CLASS_ID } from "@pulse/contracts/quote-builder";
import type { BuilderConfigurationResponse, CalculationSettings, LaborClass } from "@pulse/contracts/quote-builder";
import { loadCalculationConfiguration, saveCalculationSettings, saveCompanyLaborClass } from "@/lib/api/quoteBuilder";
import { DecimalField } from "@/modules/quotes/builder/BuilderFields";

const fields: Array<{ title: string; values: Array<[Exclude<keyof CalculationSettings, "indirectRoles">, string, boolean]> }> = [
  { title: "Material defaults", values: [["materialMargin", "Material target margin", true], ["materialFreight", "Material freight", true], ["materialContingency", "Material contingency", true], ["materialIvuRate", "Material IVU (embedded in material price)", true]] },
  { title: "Labor and timeline", values: [["overtimeMultiplier", "Default overtime multiplier", false], ["practicalTimelineFactor", "Practical timeline factor", false], ["payrollBurden", "Payroll burden", true], ["laborContingency", "Labor contingency", true], ["laborMargin", "Labor target margin", true], ["fondo", "Fondo", true]] },
  { title: "Project overhead and service tax", values: [["vehicleWeeklyCost", "Vehicle weekly cost", false], ["annualRent", "Annual rent", false], ["annualBondInsurance", "Annual bond / insurance", false], ["b2bServiceTaxRate", "B2B / Service Tax", true]] }
];
const blankClass = (): Omit<LaborClass, "id"> => ({ name: "", hourlyRate: null, enabled: true });

export function SettingsQuoteCalculationSection({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<BuilderConfigurationResponse | null>(null);
  const [settings, setSettings] = useState<CalculationSettings | null>(null);
  const [settingsConfigurationId, setSettingsConfigurationId] = useState("");
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [classId, setClassId] = useState<string | undefined>(); const [classDraft, setClassDraft] = useState(blankClass);
  useEffect(() => {
    const controller = new AbortController();
    void loadCalculationConfiguration(controller.signal).then(value => {
      setData(value); setSettingsConfigurationId(value.configurationId); const { laborClasses: _, ...configuration } = value.configuration; setSettings(configuration);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  async function saveSettings() {
    if (!settings || !data) return;
    setBusy(true); setError(""); setMessage("");
    try { const next = await saveCalculationSettings(settings, settingsConfigurationId); setData(next); setSettingsConfigurationId(next.configurationId); setMessage("Settings saved. Open Builders keep their loaded rates until reload."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save settings."); }
    finally { setBusy(false); }
  }
  async function saveClass() {
    setBusy(true); setError("");
    try {
      const next = await saveCompanyLaborClass(classDraft, classId);
      const { laborClasses: previousClasses, ...previousSettings } = data!.configuration;
      const { laborClasses: nextClasses, ...nextSettings } = next.configuration;
      // A class write must not approve overwriting another administrator's settings edits.
      if (settingsConfigurationId === data!.configurationId && JSON.stringify(previousSettings) === JSON.stringify(nextSettings)) setSettingsConfigurationId(next.configurationId);
      setData(next); setClassDraft(blankClass()); setClassId(undefined); setMessage("Labor class saved.");
    }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save labor class."); }
    finally { setBusy(false); }
  }
  if (!settings || !data) return <section className="settings-card">{error ? <p role="alert">{error}</p> : "Loading calculation settings…"}</section>;
  const updateRole = (index: number, patch: Partial<NonNullable<CalculationSettings["indirectRoles"]>[number]>) => setSettings({ ...settings, indirectRoles: settings.indirectRoles!.map((role, i) => i === index ? { ...role, ...patch } : role) });
  return <div className="settings-content-stack qb-settings">
    <section className="settings-card"><h2>Quote calculation</h2><p>Defaults for new lines and newly loaded workspaces. Open Builders keep the rates they loaded until an explicit reload.</p><p>Blank means <strong>not configured</strong>. Enter 0 explicitly when a cost does not apply.</p>{error ? <p className="qb-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}</section>
    <fieldset className="qb-settings-fields" disabled={!canManage || busy}>
      {fields.map(section => <section className="settings-card" key={section.title}><h3>{section.title}</h3><div className="qb-fields">{section.values.map(([key, label, percentage]) => <DecimalField key={key} label={label} value={settings[key]} percentage={percentage} onChange={value => setSettings({ ...settings, [key]: value })} />)}</div></section>)}
      <section className="settings-card"><h3>Indirect labor / supervision</h3><p>Enabled role cost = practical weeks × weekly cost × allocation percentage.</p>
        {settings.indirectRoles === null ? <div className="qb-notice">Indirect labor is not configured. <button type="button" className="toolbar-button compact" onClick={() => setSettings({ ...settings, indirectRoles: [] })}>Confirm no roles apply</button></div> : settings.indirectRoles.length === 0 ? <p>No indirect roles apply (explicitly configured).</p> : null}
        {settings.indirectRoles?.map((role, index) => <div className="qb-role" key={role.id}>
          <label className="qb-field"><span>Role name</span><input value={role.name} maxLength={100} onChange={event => updateRole(index, { name: event.target.value })} /></label>
          <DecimalField label="Weekly cost" value={role.weeklyCost} onChange={value => updateRole(index, { weeklyCost: value })} />
          <DecimalField label="Allocation" percentage value={role.allocationPercent} onChange={value => updateRole(index, { allocationPercent: value })} />
          <label><input type="checkbox" checked={role.enabled} onChange={event => updateRole(index, { enabled: event.target.checked })} /> Enabled</label>
          <button type="button" className="toolbar-button compact" onClick={() => setSettings({ ...settings, indirectRoles: settings.indirectRoles!.filter((_, i) => i !== index) })}>Remove role</button>
        </div>)}
        <button type="button" className="toolbar-button" onClick={() => setSettings({ ...settings, indirectRoles: [...settings.indirectRoles ?? [], { id: crypto.randomUUID(), name: "New role", enabled: true, weeklyCost: null, allocationPercent: null }] })}>Add indirect role</button>
      </section>
      <button type="button" className="primary-button" onClick={() => void saveSettings()}>{busy ? "Saving…" : "Save calculation settings"}</button>
    </fieldset>
    <section className="settings-card"><h3>Company labor classes</h3><p>New lines use Standard when the Item has no labor class. Edit its hourly rate here. Disabling a class preserves existing references.</p>
      <ul className="qb-class-list">{data.configuration.laborClasses.map(role => <li key={role.id}><span><strong>{role.name}</strong>{role.id === STANDARD_LABOR_CLASS_ID ? " · Default" : ""} · {role.hourlyRate === null ? "Rate not configured" : `$${role.hourlyRate} / hour`} · {role.enabled ? "Active" : "Disabled"}</span><button className="toolbar-button compact" type="button" disabled={!canManage || busy} onClick={() => { setClassId(role.id); setClassDraft({ name: role.name, hourlyRate: role.hourlyRate, enabled: role.enabled }); }}>Edit</button></li>)}</ul>
      <fieldset className="qb-fields" disabled={!canManage || busy}><legend>{classId ? "Edit labor class" : "Add labor class"}</legend>
        <label className="qb-field"><span>Class name</span><input value={classDraft.name} maxLength={100} onChange={event => setClassDraft({ ...classDraft, name: event.target.value })} /></label>
        <DecimalField label="Hourly rate" value={classDraft.hourlyRate} onChange={value => setClassDraft({ ...classDraft, hourlyRate: value })} />
        <label><input type="checkbox" checked={classDraft.enabled} onChange={event => setClassDraft({ ...classDraft, enabled: event.target.checked })} /> Enabled</label>
        <button type="button" className="primary-button compact" disabled={!classDraft.name.trim()} onClick={() => void saveClass()}>Save class</button>
        {classId ? <button type="button" className="toolbar-button compact" onClick={() => { setClassId(undefined); setClassDraft(blankClass()); }}>Cancel edit</button> : null}
      </fieldset>
    </section>
  </div>;
}
