"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  ImageIcon,
  PackageCheck,
  ReceiptText,
  TrendingUp
} from "lucide-react";
import type { ItemDetailResponse } from "@pulse/contracts/items";
import { fetchItemDetail } from "@/lib/api/items";
import { formatMoney, formatWorkspaceDate } from "@/lib/formatting";

type ItemDetailWorkspaceProps = {
  itemId: string;
};

function priceChangeLabel(previous: number | null, current: number) {
  if (previous === null) return "Starting price";
  if (current > previous) return "Increased";
  if (current < previous) return "Decreased";
  return "Unchanged";
}

export function ItemDetailWorkspace({ itemId }: ItemDetailWorkspaceProps) {
  const [detail, setDetail] = useState<ItemDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    async function loadItem() {
      try {
        setLoading(true);
        setError("");
        setDetail(await fetchItemDetail(itemId, { cache: "no-store" }));
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load this item."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadItem();
  }, [itemId]);

  if (loading) {
    return (
      <section className="item-detail-workspace">
        <div className="work-queue-state">Loading item statistics...</div>
      </section>
    );
  }

  if (error || !detail) {
    return (
      <section className="item-detail-workspace">
        <div className="work-queue-state error">
          <strong>{error || "Item not found."}</strong>
          <Link className="toolbar-button compact" href="/directory/items">
            <ArrowLeft size={15} />
            Back to items
          </Link>
        </div>
      </section>
    );
  }

  const { item, statistics, priceHistory, recentQuotes } = detail;
  const grossMargin = item.sellPrice - item.cost;

  return (
    <section className="item-detail-workspace">
      <header className="item-detail-command-bar">
        <div>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/directory">Directory</Link>
            <span>/</span>
            <Link href="/directory/items">Items</Link>
            <span>/</span>
            <span>{item.name}</span>
          </nav>
          <Link className="toolbar-button compact" href="/directory/items">
            <ArrowLeft size={15} />
            Back to items
          </Link>
        </div>
        {item.productUrl ? (
          <a
            className="primary-button compact"
            href={item.productUrl}
            target="_blank"
            rel="noreferrer"
          >
            Product page
            <ExternalLink size={15} />
          </a>
        ) : null}
      </header>

      <section className="item-detail-hero">
        <div className="item-detail-image">
          {item.primaryImageUrl && !imageFailed ? (
            <img
              alt={item.name}
              src={item.primaryImageUrl}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="item-detail-image-fallback">
              <ImageIcon size={34} />
              <span>No item image</span>
            </div>
          )}
        </div>
        <div className="item-detail-hero-copy">
          <div className="item-detail-eyebrow">
            <span>{item.category || "Uncategorized"}</span>
            {item.subcategory ? <span>{item.subcategory}</span> : null}
          </div>
          <h1>{item.name}</h1>
          <div className="item-detail-badges">
            <span className="status-pill">{item.itemType}</span>
            <span className={item.status === "INACTIVE" ? "status-pill danger" : "status-pill"}>
              {item.status}
            </span>
            {item.taxable ? <span className="item-detail-taxable">Taxable</span> : null}
          </div>
          <p>{item.description || item.quoteDescription || "No description available."}</p>
          <dl className="item-detail-identity">
            <div>
              <dt>Part number</dt>
              <dd>{item.partNumber || "—"}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd>{item.sku || "—"}</dd>
            </div>
            <div>
              <dt>Manufacturer</dt>
              <dd>{item.manufacturer || item.brand || "—"}</dd>
            </div>
            <div>
              <dt>Unit</dt>
              <dd>{item.unitOfMeasure || "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="item-detail-metrics" aria-label="Item statistics">
        <article>
          <div><span>Current price</span><strong>{formatMoney(item.sellPrice)}</strong><small>{formatMoney(item.cost)} cost</small></div>
          <CircleDollarSign size={20} />
        </article>
        <article>
          <div><span>Gross margin</span><strong>{formatMoney(grossMargin)}</strong><small>{item.markupPercent}% markup</small></div>
          <TrendingUp size={20} />
        </article>
        <article>
          <div><span>Used on quotes</span><strong>{statistics.quoteCount}</strong><small>{statistics.quoteLineCount} quote lines</small></div>
          <ReceiptText size={20} />
        </article>
        <article>
          <div><span>Total quoted</span><strong>{formatMoney(statistics.totalQuotedValue)}</strong><small>{statistics.totalQuantity} units</small></div>
          <PackageCheck size={20} />
        </article>
      </section>

      <div className="item-detail-content-grid">
        <section className="item-detail-panel">
          <div className="item-detail-panel-heading">
            <div>
              <span className="dashboard-eyebrow">Catalog pricing</span>
              <h2>Price history</h2>
            </div>
            <span>{statistics.priceChangeCount} changes</span>
          </div>
          {priceHistory.length ? (
            <div className="item-price-history-list">
              {priceHistory.map((history) => (
                <article key={history.id}>
                  <div className="item-price-history-date">
                    <CalendarClock size={16} />
                    <div>
                      <strong>{priceChangeLabel(history.previousSellPrice, history.newSellPrice)}</strong>
                      <span>{formatWorkspaceDate(history.changedAt, true)}</span>
                    </div>
                  </div>
                  <div className="item-price-history-values">
                    <span>Cost</span>
                    <strong>{history.previousCost === null ? "—" : formatMoney(history.previousCost)}</strong>
                    <ArrowRight size={14} />
                    <strong>{formatMoney(history.newCost)}</strong>
                  </div>
                  <div className="item-price-history-values">
                    <span>Sell</span>
                    <strong>{history.previousSellPrice === null ? "—" : formatMoney(history.previousSellPrice)}</strong>
                    <ArrowRight size={14} />
                    <strong>{formatMoney(history.newSellPrice)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="item-detail-empty">No pricing history has been recorded yet.</div>
          )}
        </section>

        <aside className="item-detail-panel item-detail-facts-panel">
          <div className="item-detail-panel-heading">
            <div>
              <span className="dashboard-eyebrow">Catalog record</span>
              <h2>Item details</h2>
            </div>
          </div>
          <dl className="item-detail-facts">
            <div><dt>Brand</dt><dd>{item.brand || "—"}</dd></div>
            <div><dt>Category</dt><dd>{item.category || "—"}</dd></div>
            <div><dt>Subcategory</dt><dd>{item.subcategory || "—"}</dd></div>
            <div><dt>Relations</dt><dd>{item.relations.length}</dd></div>
            <div><dt>Default labor</dt><dd>{item.defaultLaborHours ? `${item.defaultLaborHours} hours` : "None"}</dd></div>
            <div><dt>Last updated</dt><dd>{formatWorkspaceDate(item.updatedAt, true)}</dd></div>
          </dl>
          {item.datasheetUrl ? (
            <a href={item.datasheetUrl} target="_blank" rel="noreferrer">
              Open datasheet <ExternalLink size={14} />
            </a>
          ) : null}
        </aside>
      </div>

      <section className="item-detail-panel item-quote-history-panel">
        <div className="item-detail-panel-heading">
          <div>
            <span className="dashboard-eyebrow">Sales usage</span>
            <h2>Recent quotes</h2>
          </div>
          {statistics.latestQuotedAt ? (
            <span>Last used {formatWorkspaceDate(statistics.latestQuotedAt)}</span>
          ) : null}
        </div>
        {recentQuotes.length ? (
          <div className="item-quote-usage-list">
            {recentQuotes.map((quote) => (
              <article key={quote.quoteId}>
                <div>
                  <Link href={`/quotes/${quote.quoteId}`}>{quote.quoteNumber}</Link>
                  <strong>{quote.quoteTitle}</strong>
                  <span>{quote.quoteStatus} · {formatWorkspaceDate(quote.quotedAt)}</span>
                </div>
                <div><span>Quantity</span><strong>{quote.quantity}</strong></div>
                <div><span>Unit price</span><strong>{formatMoney(quote.unitPrice)}</strong></div>
                <div><span>Quoted value</span><strong>{formatMoney(quote.quotedValue)}</strong></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="item-detail-empty">
            <Boxes size={20} />
            This item has not been added to a quote yet.
          </div>
        )}
      </section>
    </section>
  );
}
