"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Eye,
  Filter,
  ImageIcon,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  X
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import {
  createItem,
  deactivateItem,
  fetchItems,
  updateItem
} from "@/lib/api/items";
import { formatMoney } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  itemRelationTypes,
  itemStatuses,
  itemTypes,
  type ItemRecord,
  type ItemRelationType,
  type ItemStatus,
  type ItemType
} from "@pulse/contracts/items";

type ItemRelationDraft = {
  childItemId: string;
  relationType: ItemRelationType;
  defaultQuantity: string;
  sortOrder: string;
};

type ItemDraft = {
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

const blankDraft: ItemDraft = {
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

function draftFromItem(item: ItemRecord): ItemDraft {
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

function payloadFromDraft(draft: ItemDraft) {
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

function statusClass(status: ItemStatus) {
  return status === "INACTIVE" ? "status-pill danger" : "status-pill";
}

function ItemThumbnail({ item }: { item: ItemRecord }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="item-catalog-image" aria-hidden="true">
      {item.primaryImageUrl && !imageFailed ? (
        <img
          alt=""
          loading="lazy"
          src={item.primaryImageUrl}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ImageIcon size={24} />
      )}
    </div>
  );
}

export function ItemsModule() {
  const { user } = useCurrentUser();
  const canWrite = canUser(user, "items:write");
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | ItemType>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ItemStatus>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(blankDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadItems() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchItems(
          { includeInactive: true },
          { cache: "no-store" }
        );
        setItems(data.items);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load items.");
      } finally {
        setLoading(false);
      }
    }
    void loadItems();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.sku,
        item.partNumber,
        item.manufacturer,
        item.brand,
        item.category,
        item.subcategory,
        item.description
      ].join(" ").toLowerCase();
      return (
        (!normalized || haystack.includes(normalized)) &&
        (typeFilter === "All" || item.itemType === typeFilter) &&
        (statusFilter === "All" || item.status === statusFilter) &&
        (categoryFilter === "All" || item.category === categoryFilter)
      );
    });
  }, [categoryFilter, items, query, statusFilter, typeFilter]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(items.map((item) => item.category).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [items]
  );

  function openCreate() {
    setEditingItem(null);
    setDraft({ ...blankDraft, relations: [] });
    setFormOpen(true);
  }

  function openEdit(item: ItemRecord) {
    setEditingItem(item);
    setDraft(draftFromItem(item));
    setFormOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditingItem(null);
    setDraft({ ...blankDraft, relations: [] });
    setFormOpen(false);
  }

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

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setToast("Item name is required.");
      return;
    }
    try {
      setSaving(true);
      const payload = payloadFromDraft(draft);
      const data = editingItem
        ? await updateItem(editingItem.id, payload)
        : await createItem(payload);
      setItems((current) =>
        editingItem
          ? current.map((item) => (item.id === data.item.id ? data.item : item))
          : [data.item, ...current]
      );
      setToast(editingItem ? "Item updated." : "Item created.");
      closeEditor();
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : "Unable to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function markInactive(item: ItemRecord) {
    try {
      const data = await deactivateItem(item.id);
      setItems((current) =>
        current.map((currentItem) => currentItem.id === data.item.id ? data.item : currentItem)
      );
      setToast(`${item.name} marked inactive.`);
    } catch (inactiveError) {
      setToast(inactiveError instanceof Error ? inactiveError.message : "Unable to mark inactive.");
    }
  }

  return (
    <section className="items-module">
      <header className="clients-command-bar">
        <div className="clients-command-primary">
          <Link className="toolbar-button compact clients-directory-return" href="/directory">
            <ArrowLeft size={16} />
            Directory
          </Link>
          <div>
            <nav className="breadcrumb clients-command-breadcrumb" aria-label="Breadcrumb">
              <Link href="/hub">Home</Link>
              <span>/</span>
              <Link href="/directory">Directory</Link>
              <span>/</span>
              <span>Items</span>
            </nav>
            <h1>Items</h1>
            <p className="clients-command-summary">
              <strong>Directory</strong>
              <span aria-hidden="true"> · </span>
              Reusable products, labor, services, kits, and related quote suggestions.
            </p>
          </div>
        </div>
        {canWrite ? (
          <button className="primary-button" type="button" onClick={openCreate}>
            <PackagePlus size={17} />
            New Item
          </button>
        ) : null}
      </header>

      <section className="items-surface">
        <div className="items-catalog-toolbar">
          <label className="lead-search">
            <Search size={17} />
            <input
              aria-label="Search items"
              placeholder="Search name, SKU, part number, brand..."
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="items-catalog-filters">
            <Filter size={16} />
            <select
              aria-label="Filter items by category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option value={category} key={category}>{category}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "All" | ItemType)}>
              <option value="All">All types</option>
              {itemTypes.map((type) => <option value={type} key={type}>{type}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | ItemStatus)}>
              <option value="All">All statuses</option>
              {itemStatuses.map((status) => <option value={status} key={status}>{status}</option>)}
            </select>
          </div>
          <span className="items-result-count">
            {filteredItems.length} of {items.length} items
          </span>
        </div>

        {error ? <div className="work-queue-state error">{error}</div> : null}
        {loading ? <div className="work-queue-state">Loading items...</div> : null}
        {!loading && !error ? (
          filteredItems.length ? (
            <div className="items-catalog-grid">
              {filteredItems.map((item) => (
                <article className="item-catalog-card" key={item.id}>
                  <Link
                    className="item-catalog-image-link"
                    href={`/directory/items/${item.id}`}
                    aria-label={`View ${item.name}`}
                  >
                    <ItemThumbnail item={item} />
                  </Link>
                  <div className="item-catalog-body">
                    <div className="item-catalog-badges">
                      <span>{item.itemType}</span>
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                    <Link className="item-catalog-title" href={`/directory/items/${item.id}`}>
                      {item.name}
                    </Link>
                    <p>{item.description || item.quoteDescription || "No description available."}</p>
                    <div className="item-catalog-meta">
                      <span>{item.partNumber || item.sku || "No part number"}</span>
                      <span>{item.category || "Uncategorized"}</span>
                      {item.relations.length ? <span>{item.relations.length} relations</span> : null}
                    </div>
                  </div>
                  <div className="item-catalog-price">
                    <span>Sell price</span>
                    <strong>{formatMoney(item.sellPrice)}</strong>
                    <small>{formatMoney(item.cost)} cost</small>
                  </div>
                  <div className="items-row-actions">
                    <Link className="toolbar-button compact" href={`/directory/items/${item.id}`}>
                      <Eye size={15} />
                      View
                    </Link>
                    {canWrite ? (
                      <button className="toolbar-button compact" type="button" onClick={() => openEdit(item)}>
                        <Pencil size={15} />
                        Edit
                      </button>
                    ) : null}
                    {canWrite && item.status === "ACTIVE" ? (
                      <button className="toolbar-button compact danger" type="button" onClick={() => void markInactive(item)}>
                        Inactive
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="work-queue-state"><Boxes size={20} />No items match this view.</div>
          )
        ) : null}
      </section>

      {formOpen ? (
        <div className="client-create-dialog-scrim" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeEditor();
        }}>
          <form className="client-create-dialog item-editor-dialog" role="dialog" aria-modal="true" onSubmit={saveItem}>
            <div className="client-create-dialog-header">
              <div>
                <span className="dashboard-eyebrow">{editingItem ? "Edit item" : "New item"}</span>
                <h3>{editingItem ? editingItem.name : "Create Item"}</h3>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={closeEditor}>
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
              <button className="toolbar-button compact" type="button" onClick={closeEditor}>Cancel</button>
              <button className="primary-button compact" type="submit" disabled={saving}>{saving ? "Saving..." : "Save item"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {toast ? <div className="work-queue-toast" role="status">{toast}</div> : null}
    </section>
  );
}
