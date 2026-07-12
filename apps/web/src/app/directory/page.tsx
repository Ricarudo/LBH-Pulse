"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Boxes,
  Building2,
  CheckCircle2,
  Clock3,
  Factory,
  Handshake,
  MapPin,
  PackageCheck,
  Sparkles,
  Truck,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { PulseShell } from "@/components/PulseShell";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { canUser } from "@pulse/contracts/auth";

const directoryTutorialStorageKey = "pulse.directoryTutorialSeen";

const directorySections = [
  {
    label: "Clients",
    detail: "Accounts, billing context, preferences, sites, and contacts.",
    href: "/clients",
    status: "Active",
    icon: Building2
  },
  {
    label: "Contacts",
    detail: "People connected to clients, partners, vendors, and projects.",
    href: "/contacts",
    status: "Active",
    icon: UserRound
  },
  {
    label: "Items",
    detail: "Products, labor, services, kits, and quote BOM suggestions.",
    href: "/directory/items",
    status: "Active",
    icon: Boxes
  },
  {
    label: "Sites / Locations",
    detail: "Customer offices, facilities, campuses, and job locations.",
    href: "/directory/sites",
    status: "Active",
    icon: MapPin
  },
  {
    label: "Vendors",
    detail: "Companies R2 buys from or coordinates with for project work.",
    href: undefined,
    status: "Coming soon",
    icon: Truck
  },
  {
    label: "Suppliers",
    detail: "Material and equipment sources for quote and project work.",
    href: undefined,
    status: "Coming soon",
    icon: PackageCheck
  },
  {
    label: "Subcontractors",
    detail: "External labor and specialist teams available for projects.",
    href: undefined,
    status: "Coming soon",
    icon: UsersRound
  },
  {
    label: "Manufacturers",
    detail: "Product brands, standards, and manufacturer relationships.",
    href: undefined,
    status: "Coming soon",
    icon: Factory
  },
  {
    label: "Reps / Partner Contacts",
    detail: "Manufacturer reps, partner contacts, and relationship owners.",
    href: undefined,
    status: "Coming soon",
    icon: Handshake
  }
] as const;

type DirectorySection = (typeof directorySections)[number];

function DirectoryModuleCard({ section, index }: { section: DirectorySection; index: number }) {
  const Icon = section.icon;
  const isActive = Boolean(section.href);
  const card = (
    <article className={`directory-module-card ${isActive ? "is-active" : "is-disabled"}`}>
      <div className={`directory-module-icon tone-${index % 4}`} aria-hidden="true">
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="directory-module-body">
        <div className="directory-module-title-row">
          <h3>{section.label}</h3>
          {isActive ? <ArrowUpRight size={18} aria-hidden="true" /> : null}
        </div>
        <p>{section.detail}</p>
        <div className="directory-module-footer">
          <span className={`directory-module-status ${isActive ? "is-active" : "is-disabled"}`}>
            {isActive ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
            {section.status}
          </span>
          <span className="directory-module-action">
            {isActive ? "Open module" : "Not available yet"}
          </span>
        </div>
      </div>
    </article>
  );

  return section.href ? (
    <Link className="directory-module-link" href={section.href}>
      {card}
    </Link>
  ) : (
    <div className="directory-module-link is-disabled" aria-disabled="true">
      {card}
    </div>
  );
}

export default function DirectoryPage() {
  const { user } = useCurrentUser();
  const [showTutorial, setShowTutorial] = useState<boolean | null>(null);
  const activeSections = directorySections.filter((section) =>
    Boolean(section.href) && (
      section.label === "Items"
        ? canUser(user, "items:read")
        : canUser(user, "clients:read")
    )
  );
  const comingSoonSections = directorySections.filter((section) => !section.href);

  useEffect(() => {
    try {
      setShowTutorial(window.localStorage.getItem(directoryTutorialStorageKey) !== "true");
    } catch {
      setShowTutorial(true);
    }
  }, []);

  function dismissTutorial() {
    try {
      window.localStorage.setItem(directoryTutorialStorageKey, "true");
    } catch {
      // The page can still be dismissed when browser storage is unavailable.
    }
    setShowTutorial(false);
  }

  const tutorialVisible = showTutorial !== false;

  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Supporting relationship records for Requests, Quotes, and Projects."
    >
      <div className="directory-page">
        {tutorialVisible ? (
          <section className="directory-hero" aria-labelledby="directory-title">
            <button
              className="directory-tutorial-close"
              type="button"
              aria-label="Dismiss Directory orientation"
              title="Dismiss orientation"
              onClick={dismissTutorial}
            >
              <X size={18} />
            </button>
            <div className="directory-hero-copy">
              <span className="directory-eyebrow">
                <span className="directory-eyebrow-icon" aria-hidden="true">
                  <Sparkles size={14} />
                </span>
                Quick orientation
              </span>
              <h1 id="directory-title">Everything your projects are connected to.</h1>
              <p>
                Keep the people, places, products, and partner relationships behind every
                request in one organized directory.
              </p>
              <div className="directory-hero-actions">
                <Link className="directory-primary-action" href="/clients" onClick={dismissTutorial}>
                  <Building2 size={17} />
                  Open clients
                  <ArrowUpRight size={16} />
                </Link>
                <span className="directory-hero-note">
                  <CheckCircle2 size={16} />
                  {activeSections.length} modules ready to use
                </span>
                <button className="directory-tutorial-dismiss" type="button" onClick={dismissTutorial}>
                  Explore modules
                  <ArrowDown size={16} />
                </button>
              </div>
            </div>

            <div className="directory-hero-aside" aria-label="Directory connection summary">
              <div className="directory-hero-aside-heading">
                <span>One source of truth</span>
                <span className="directory-live-indicator">
                  <span aria-hidden="true" /> Live
                </span>
              </div>
              <div className="directory-hero-aside-icon" aria-hidden="true">
                <Boxes size={25} />
              </div>
              <strong>Built for the full project lifecycle</strong>
              <p>Directory records flow into Requests, Quotes, Projects, and Billing.</p>
              <div className="directory-hero-connections">
                <span>Requests</span>
                <span>Quotes</span>
                <span>Projects</span>
                <span>Billing</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="directory-module-intro" aria-labelledby="directory-module-overview-title">
            <div>
              <span className="directory-section-eyebrow">Directory modules</span>
              <h1 id="directory-module-overview-title">Manage the records behind your work.</h1>
              <p>Choose a module to keep Requests, Quotes, Projects, and Billing connected.</p>
            </div>
            <span className="directory-module-intro-badge">
              <CheckCircle2 size={16} />
              {activeSections.length} active modules
            </span>
          </section>
        )}

        {tutorialVisible ? (
          <section className="directory-summary" aria-label="Directory summary">
            <div className="directory-summary-item">
              <div className="directory-summary-icon tone-blue" aria-hidden="true">
                <CheckCircle2 size={19} />
              </div>
              <div>
                <span>Available now</span>
                <strong>{activeSections.length} active modules</strong>
              </div>
            </div>
            <div className="directory-summary-item">
              <div className="directory-summary-icon tone-amber" aria-hidden="true">
                <Clock3 size={19} />
              </div>
              <div>
                <span>On the roadmap</span>
                <strong>{comingSoonSections.length} coming soon</strong>
              </div>
            </div>
            <div className="directory-summary-item directory-summary-wide">
              <div className="directory-summary-icon tone-green" aria-hidden="true">
                <Sparkles size={19} />
              </div>
              <div>
                <span>Designed for connected work</span>
                <strong>One record, many workflows</strong>
              </div>
            </div>
          </section>
        ) : null}

        <section className="directory-section" aria-labelledby="directory-active-title">
          <div className="directory-section-heading">
            <div>
              <span className="directory-section-eyebrow">Ready to use</span>
              <h2 id="directory-active-title">Active modules</h2>
              <p>Open a module to manage the records your team uses every day.</p>
            </div>
            <span className="directory-section-count">
              <CheckCircle2 size={15} />
              {activeSections.length} available
            </span>
          </div>
          <div className="directory-module-grid">
            {activeSections.map((section, index) => (
              <DirectoryModuleCard key={section.label} section={section} index={index} />
            ))}
          </div>
        </section>

        <section className="directory-section directory-section-upcoming" aria-labelledby="directory-upcoming-title">
          <div className="directory-section-heading">
            <div>
              <span className="directory-section-eyebrow">Expanding next</span>
              <h2 id="directory-upcoming-title">Coming soon</h2>
              <p>These relationship areas are planned and will appear here as they become available.</p>
            </div>
            <span className="directory-section-count is-muted">
              <Clock3 size={15} />
              {comingSoonSections.length} planned
            </span>
          </div>
          <div className="directory-module-grid">
            {comingSoonSections.map((section, index) => (
              <DirectoryModuleCard
                key={section.label}
                section={section}
                index={index + activeSections.length}
              />
            ))}
          </div>
        </section>
      </div>
    </PulseShell>
  );
}
