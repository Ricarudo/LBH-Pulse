"use client";

import type { ClientPreference } from "@pulse/contracts/clients";

export function ClientPreferencesEditor({ value, onChange }: { value: ClientPreference[]; onChange: (value: ClientPreference[]) => void }) {
  function change(index: number, field: keyof ClientPreference, text: string) {
    onChange(value.map((entry, i) => i === index ? { ...entry, [field]: text } : entry));
  }
  return <div className="client-form-wide">
    {value.map((entry, index) => <div className="client-form-grid" key={index}>
      <label>Category<input required value={entry.category} onChange={(event) => change(index, "category", event.target.value)} /></label>
      <label>Preference<input required value={entry.value} onChange={(event) => change(index, "value", event.target.value)} /></label>
      <label>Notes<input value={entry.notes} onChange={(event) => change(index, "notes", event.target.value)} /></label>
      <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove preference</button>
    </div>)}
    <button type="button" onClick={() => onChange([...value, { category: "", value: "", notes: "" }])}>Add preference</button>
  </div>;
}
