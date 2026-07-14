"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Filter,
  ImageIcon,
  PackagePlus,
  Search
} from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { createItem, fetchItems } from "@/lib/api/items";
import { formatMoney } from "@/lib/formatting";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  itemStatuses,
  itemTypes,
  type ItemRecord,
  type ItemStatus,
  type ItemType
} from "@pulse/contracts/items";
import { ItemEditorDialog, blankDraft, payloadFromDraft } from "@/modules/items/ItemEditorDialog";

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
  const [draft, setDraft] = useState(blankDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const activeFilterCount = [
    categoryFilter !== "All",
    typeFilter !== "All",
    statusFilter !== "All"
  ].filter(Boolean).length;

  function openCreate() {
    setDraft({ ...blankDraft, relations: [] });
    setFormOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setDraft({ ...blankDraft, relations: [] });
    setFormOpen(false);
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
      const data = await createItem(payload);
      setItems((current) => [data.item, ...current]);
      setToast("Item created.");
      closeEditor();
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : "Unable to save item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="items-module">
      <header className="clients-command-bar items-command-bar">
        <div className="clients-command-primary">
          <Link
            className="toolbar-button compact clients-directory-return"
            href="/directory"
            aria-label="Back to Directory"
          >
            <ArrowLeft size={16} />
            <span className="items-directory-return-label">Directory</span>
          </Link>
          <div>
            <nav className="breadcrumb clients-command-breadcrumb items-command-breadcrumb" aria-label="Breadcrumb">
              <Link className="items-command-home" href="/hub">Home</Link>
              <span className="items-command-home-separator" aria-hidden="true">/</span>
              <Link href="/directory">Directory</Link>
              <span>/</span>
              <span>Items</span>
            </nav>
            <h1>Items</h1>
            <p className="clients-command-summary items-command-summary">
              <strong>Directory</strong>
              <span aria-hidden="true"> · </span>
              Reusable products, labor, services, kits, and related quote suggestions.
            </p>
          </div>
        </div>
        {canWrite ? (
          <button
            className="primary-button items-new-item-button"
            type="button"
            aria-label="New item"
            onClick={openCreate}
          >
            <PackagePlus size={17} />
            <span className="items-new-item-label">New Item</span>
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
          <div className="items-catalog-filter-area" data-open={filtersOpen}>
            <button
              className="toolbar-button compact items-mobile-filters-toggle"
              type="button"
              aria-controls="items-catalog-filters"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Filter size={16} />
              <span>Filters</span>
              {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
            </button>
            <div className="items-catalog-filters" id="items-catalog-filters">
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
                <Link
                  className="item-catalog-card"
                  href={`/directory/items/${item.id}`}
                  aria-label={`Open ${item.name}`}
                  key={item.id}
                >
                  <ItemThumbnail item={item} />
                  <div className="item-catalog-body">
                    <div className="item-catalog-badges">
                      <span>{item.itemType}</span>
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                    <span className="item-catalog-title">{item.name}</span>
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
                </Link>
              ))}
            </div>
          ) : (
            <div className="work-queue-state"><Boxes size={20} />No items match this view.</div>
          )
        ) : null}
      </section>

      {formOpen ? (
        <ItemEditorDialog
          editingItem={null}
          items={items}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onClose={closeEditor}
          onSubmit={saveItem}
        />
      ) : null}
      {toast ? <div className="work-queue-toast" role="status">{toast}</div> : null}
    </section>
  );
}
