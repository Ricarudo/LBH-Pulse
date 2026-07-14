"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import {
  itemRelationTypes,
  itemStatuses,
  itemTypes,
  type ItemRecord,
  type ItemRelationType,
  type ItemStatus,
  type ItemType
} from "@pulse/contracts/items";

export type ItemRelationDraft = {
  childItemId: string;
  relationType: ItemRelationType;
  defaultQuantity: string;
  sortOrder: string;
};

export type ItemDraft = {
  name: string;
  description: string;
  itemType: ItemType;
  status: ItemStatus;
  sku: string;
  partNumber: string;
  manufacturer: string;
  brand: string;
  category: string;
  subcategory: string;
  unitOfMeasure: string;
  cost: string;
  sellPrice: string;
  markupPercent: string;
  taxable: boolean;
  primaryImageUrl: string;
  productUrl: string;
  datasheetUrl: string;
  internalNotes: string;
  quoteDescription: string;
  defaultLaborHours: string;
  defaultLaborItemId: string;
  relations: ItemRelationDraft[];
};

export const blankDraft: ItemDraft = {
  name: "",
  description: "",
  itemType: "PRODUCT",
  status: "ACTIVE",
  sku: "",
  partNumber: "",
  manufacturer: "",
  brand: "",
  category: "",
  subcategory: "",
  unitOfMeasure: "each",
  cost: "0",
  sellPrice: "0",
  markupPercent: "0",
  taxable: true,
  primaryImageUrl: "",
  productUrl: "",
  datasheetUrl: "",
  internalNotes: "",
  quoteDescription: "",
  defaultLaborHours: "0",
  defaultLaborItemId: "",
  relations: []
};

export function draftFromItem(item: ItemRecord): ItemDraft {
  return {
    name: item.name,
    description: item.description,
    itemType: item.itemType,
    status: item.status,
    sku: item.sku,
    partNumber: item.partNumber,
    manufacturer: item.manufacturer,
    brand: item.brand,
    category: item.category,
    subcategory: item.subcategory,
    unitOfMeasure: item.unitOfMeasure || "each",
    cost: String(item.cost),
    sellPrice: String(item.sellPrice),
    markupPercent: String(item.markupPercent),
    taxable: item.taxable,
    primaryImageUrl: item.primaryImageUrl,
    productUrl: item.productUrl,
    datasheetUrl: item.datasheetUrl,
    internalNotes: item.internalNotes,
    quoteDescription: item.quoteDescription,
    defaultLaborHours: String(item.defaultLaborHours),
    defaultLaborItemId: item.defaultLaborItemId ?? "",
    relations: item.relations.map((relation) => ({
      childItemId: relation.childItemId,
      relationType: relation.relationType,
      defaultQuantity: String(relation.defaultQuantity),
      sortOrder: String(relation.sortOrder)
    }))
  };
}

export function payloadFromDraft(draft: ItemDraft) {
  return {
    ...draft,
    cost: Number(draft.cost || 0),
    sellPrice: Number(draft.sellPrice || 0),
    markupPercent: Number(draft.markupPercent || 0),
    defaultLaborHours: Number(draft.defaultLaborHours || 0),
    defaultLaborItemId: draft.defaultLaborItemId,
    relations: draft.relations
      .filter((relation) => relation.childItemId)
      .map((relation) => ({
        childItemId: relation.childItemId,
        relationType: relation.relationType,
        defaultQuantity: Number(relation.defaultQuantity || 1),
        sortOrder: Number(relation.sortOrder || 0)
      }))
  };
}

type ItemEditorDialogProps = {
  editingItem: ItemRecord | null;
  items: ItemRecord[];
  draft: ItemDraft;
  setDraft: Dispatch<SetStateAction<ItemDraft>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export function ItemEditorDialog({
  editingItem,
  items,
  draft,
  setDraft,
  saving,
  onClose,
  onSubmit
}: ItemEditorDialogProps) {
  function addRelation() {
    setDraft((current) => ({
      ...current,
      relations: [
        ...current.relations,
        {
          childItemId: "",
          relationType: "KIT_COMPONENT",
          defaultQuantity: "1",
          sortOrder: String(current.relations.length)
        }
      ]
    }));
  }

  return (
    <div
      className="client-create-dialog-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="client-create-dialog item-editor-dialog"
        role="dialog"
        aria-modal="true"
        onSubmit={onSubmit}
      >
        <div className="client-create-dialog-header">
          <div>
            <span className="dashboard-eyebrow">{editingItem ? "Edit item" : "New item"}</span>
            <h3>{editingItem ? editingItem.name : "Create Item"}</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="material-field-grid">
          <label className="material-field"><span>Name</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="material-field"><span>Type</span><select value={draft.itemType} onChange={(event) => setDraft({ ...draft, itemType: event.target.value as ItemType })}>{itemTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="material-field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ItemStatus })}>{itemStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="material-field"><span>SKU</span><input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} /></label>
          <label className="material-field"><span>Part Number</span><input value={draft.partNumber} onChange={(event) => setDraft({ ...draft, partNumber: event.target.value })} /></label>
          <label className="material-field"><span>Manufacturer</span><input value={draft.manufacturer} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value })} /></label>
          <label className="material-field"><span>Brand</span><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} /></label>
          <label className="material-field"><span>Category</span><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
          <label className="material-field"><span>Subcategory</span><input value={draft.subcategory} onChange={(event) => setDraft({ ...draft, subcategory: event.target.value })} /></label>
          <label className="material-field"><span>Unit</span><input value={draft.unitOfMeasure} onChange={(event) => setDraft({ ...draft, unitOfMeasure: event.target.value })} /></label>
          <label className="material-field"><span>Cost</span><input min="0" step="0.01" type="number" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} /></label>
          <label className="material-field"><span>Sell Price</span><input min="0" step="0.01" type="number" value={draft.sellPrice} onChange={(event) => setDraft({ ...draft, sellPrice: event.target.value })} /></label>
          <label className="material-field"><span>Markup %</span><input min="0" step="0.01" type="number" value={draft.markupPercent} onChange={(event) => setDraft({ ...draft, markupPercent: event.target.value })} /></label>
          <label className="material-field"><span>Default Labor Hours</span><input min="0" step="0.25" type="number" value={draft.defaultLaborHours} onChange={(event) => setDraft({ ...draft, defaultLaborHours: event.target.value })} /></label>
          <label className="material-field"><span>Default Labor Item</span><select value={draft.defaultLaborItemId} onChange={(event) => setDraft({ ...draft, defaultLaborItemId: event.target.value, ...(event.target.value ? {} : { defaultLaborHours: "0" }) })}><option value="">None</option>{items.filter((item) => item.itemType === "LABOR" && item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="material-field item-checkbox-field"><span>Taxable</span><input type="checkbox" checked={draft.taxable} onChange={(event) => setDraft({ ...draft, taxable: event.target.checked })} /></label>
          <label className="material-field item-field-wide"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="material-field item-field-wide"><span>Quote Description</span><textarea value={draft.quoteDescription} onChange={(event) => setDraft({ ...draft, quoteDescription: event.target.value })} /></label>
          <label className="material-field"><span>Image URL</span><input value={draft.primaryImageUrl} onChange={(event) => setDraft({ ...draft, primaryImageUrl: event.target.value })} /></label>
          <label className="material-field"><span>Product URL</span><input value={draft.productUrl} onChange={(event) => setDraft({ ...draft, productUrl: event.target.value })} /></label>
          <label className="material-field"><span>Datasheet URL</span><input value={draft.datasheetUrl} onChange={(event) => setDraft({ ...draft, datasheetUrl: event.target.value })} /></label>
          <label className="material-field item-field-wide"><span>Internal Notes</span><textarea value={draft.internalNotes} onChange={(event) => setDraft({ ...draft, internalNotes: event.target.value })} /></label>
        </div>

        <section className="item-relations-editor">
          <div className="settings-section-title">
            <div><h3>Item Relations</h3><p>Use kit components for assemblies and suggestions for related, required, or optional add-ons.</p></div>
            <button className="toolbar-button compact" type="button" onClick={addRelation}><Plus size={15} />Add relation</button>
          </div>
          {draft.relations.map((relation, index) => (
            <div className="item-relation-row" key={`${relation.childItemId}-${index}`}>
              <select value={relation.relationType} onChange={(event) => setDraft((current) => ({ ...current, relations: current.relations.map((item, relationIndex) => relationIndex === index ? { ...item, relationType: event.target.value as ItemRelationType } : item) }))}>
                {itemRelationTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
              <select value={relation.childItemId} onChange={(event) => setDraft((current) => ({ ...current, relations: current.relations.map((item, relationIndex) => relationIndex === index ? { ...item, childItemId: event.target.value } : item) }))}>
                <option value="">Select item</option>
                {items.filter((item) => item.id !== editingItem?.id && item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <input type="number" min="0.001" step="0.001" value={relation.defaultQuantity} onChange={(event) => setDraft((current) => ({ ...current, relations: current.relations.map((item, relationIndex) => relationIndex === index ? { ...item, defaultQuantity: event.target.value } : item) }))} />
              <button className="toolbar-button compact" type="button" onClick={() => setDraft((current) => ({ ...current, relations: current.relations.filter((_, relationIndex) => relationIndex !== index) }))}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <div className="client-create-dialog-actions">
          <button className="toolbar-button compact" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button compact" type="submit" disabled={saving}>{saving ? "Saving..." : "Save item"}</button>
        </div>
      </form>
    </div>
  );
}
