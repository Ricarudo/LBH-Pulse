"use client";
import { ListFeedback, ListToolbar } from "@/components/lists/ListControls";
import { useDashboardList } from "@/lib/useDashboardList";
import { options, businessDate, dateRange, type ListDefinition } from "@/lib/listState";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, ImageIcon, PackagePlus } from "lucide-react";
import { canUser } from "@pulse/contracts/auth";
import { ViewportPortal } from "@/components/ViewportPortal";
import { createItem, fetchItemCategories, fetchItems } from "@/lib/api/items";
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
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState(blankDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const definition = useMemo<ListDefinition<ItemRecord>>(() => ({
    id: "items", label: "items", defaultView: "all", defaultSort: "name", defaultDirection: "asc",
    filters: [
      { key: "type", label: "Type", options: options(itemTypes) },
      { key: "status", label: "Status", options: options(itemStatuses) },
      { key: "category", label: "Category", options: options(categories) }
    ],
    dates: [{ key: "createdAt", label: "Created", value: row => row.createdAt }, { key: "updatedAt", label: "Updated", value: row => row.updatedAt }],
    sorts: [{ key: "name", label: "Name", value: row => row.name, direction: "asc" }, { key: "updatedAt", label: "Updated", date: true, value: row => row.updatedAt, direction: "desc" }, { key: "sellPrice", label: "Sell price", numeric: true, value: row => row.sellPrice, direction: "desc" }],
    search: row => row.name, rowId: row => row.id
  }), [categories]);
  // Results are filtered and sorted by the API before its 200-record cap.
  const list = useDashboardList(definition, []);
  const queryKey = JSON.stringify(list.state);


  useEffect(() => {
    const controller = new AbortController();
    fetchItemCategories({ cache: "no-store", signal: controller.signal })
      .then((data) => setCategories(data.categories))
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load item categories.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      async function loadItems() {
        try {
          setLoading(true);
          setError("");
          const data = await fetchItems(
            {
              q: list.state.q.slice(0, 100),
              types: list.state.filters.type as ItemType[] | undefined,
              statuses: list.state.filters.status as ItemStatus[] | undefined,
              categories: list.state.filters.category,
              includeInactive: true,
              sort: list.state.sort as "name" | "updatedAt" | "sellPrice",
              direction: list.state.direction,
              ...(list.state.datePreset !== "any" ? {
                dateField: list.state.dateField as "createdAt" | "updatedAt",
                timeZone: list.timeZone,
                ...(list.state.datePreset === "missing" ? { dateMode: "missing" as const } : (() => {
                  const range = dateRange(list.state, businessDate(new Date(), list.timeZone));
                  return { dateFrom: range.from || undefined, dateTo: range.to || undefined };
                })())
              } : {})
            },
            { cache: "no-store", signal: controller.signal }
          );
          if (!controller.signal.aborted) setItems(data.items);
        } catch (loadError) {
          if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load items.");
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }
      void loadItems();
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [queryKey, list.timeZone]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredItems = items;

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
    <section className="items-module dashboard-list">
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
        <ListToolbar list={list} count={loading ? "Loading…" : filteredItems.length === 200 ? "Showing the first 200 matching items" : `${filteredItems.length} matching items`} />

        <ListFeedback error={error} onRetry={() => window.location.reload()} />
        <ListFeedback loading={loading && !error} />
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
      {toast ? <ViewportPortal><div className="work-queue-toast" role="status">{toast}</div></ViewportPortal> : null}
    </section>
  );
}
