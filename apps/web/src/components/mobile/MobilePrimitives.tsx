"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type MobileNavItem = {
  href: string;
  label: string;
  key: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

type MobileBottomNavProps = {
  items: readonly MobileNavItem[];
  activeKey: string;
  pathname: string;
};

export function MobileBottomNav({
  items,
  activeKey,
  pathname
}: MobileBottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Pulse mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          activeKey === item.key ||
          pathname === item.href ||
          (item.key === "requests" && pathname === "/leads") ||
          (item.key === "clients" && pathname.startsWith("/clients"));

        return (
          <Link
            key={item.key}
            className={active ? "mobile-bottom-nav-link active" : "mobile-bottom-nav-link"}
            href={item.href}
          >
            <Icon size={19} strokeWidth={1.9} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type MobilePageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function MobilePageHeader({
  eyebrow,
  title,
  subtitle,
  action
}: MobilePageHeaderProps) {
  return (
    <header className="mobile-page-header">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {action ? <div className="mobile-page-header-action">{action}</div> : null}
    </header>
  );
}

type MobileSearchFilterBarProps = {
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  filterLabel?: string;
  activeFilterCount?: number;
  filtersOpen?: boolean;
  onFilterClick?: () => void;
  children?: ReactNode;
};

export function MobileSearchFilterBar({
  searchValue,
  searchPlaceholder,
  onSearchChange,
  filterLabel = "Filters",
  activeFilterCount = 0,
  filtersOpen = false,
  onFilterClick,
  children
}: MobileSearchFilterBarProps) {
  return (
    <section className="mobile-search-filter-bar">
      <label>
        <span>Search</span>
        <input
          aria-label={searchPlaceholder}
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        aria-expanded={filtersOpen}
        onClick={onFilterClick}
        disabled={!onFilterClick}
      >
        {filterLabel}
        {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
      </button>
      {children && filtersOpen ? (
        <div className="mobile-filter-drawer">{children}</div>
      ) : null}
    </section>
  );
}

type MobileSummaryCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "neutral";
  onClick?: () => void;
};

export function MobileSummaryCard({
  label,
  value,
  detail,
  tone = "neutral",
  onClick
}: MobileSummaryCardProps) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </>
  );

  if (onClick) {
    return (
      <button className={`mobile-summary-card tone-${tone}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={`mobile-summary-card tone-${tone}`}>{content}</article>;
}

export function MobileSummaryCardRow({ children }: { children: ReactNode }) {
  return <section className="mobile-summary-card-row">{children}</section>;
}

type MobileBadgeProps = {
  children: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "cyan" | "neutral";
};

export function MobileBadge({ children, tone = "neutral" }: MobileBadgeProps) {
  return <span className={`mobile-badge tone-${tone}`}>{children}</span>;
}

export function MobileProgressBar({
  value,
  max,
  label
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="mobile-progress">
      <div>
        {label ? <span>{label}</span> : null}
        <strong>{value}/{max}</strong>
      </div>
      <span className="mobile-progress-track">
        <i style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

export function MobileRecordCard({
  selected,
  children,
  href,
  onClick
}: {
  selected?: boolean;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <Link className={selected ? "mobile-record-card selected" : "mobile-record-card"} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={selected ? "mobile-record-card selected" : "mobile-record-card"}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MobileExpandedPanel({ children }: { children: ReactNode }) {
  return <section className="mobile-expanded-panel">{children}</section>;
}

export function MobileActionButton({
  children,
  variant = "secondary",
  disabled,
  onClick
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`mobile-action-button ${variant}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MobileEmptyState({
  title,
  detail
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="mobile-empty-state">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function MobileLoadingState({ label }: { label: string }) {
  return <div className="mobile-loading-state">{label}</div>;
}
