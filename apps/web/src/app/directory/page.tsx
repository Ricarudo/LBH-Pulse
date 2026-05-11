import Link from "next/link";
import {
  Building2,
  Factory,
  Handshake,
  MapPin,
  PackageCheck,
  Truck,
  UserRound,
  UsersRound
} from "lucide-react";
import { PulseShell } from "@/components/PulseShell";

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
    status: "Coming soon",
    icon: UserRound
  },
  {
    label: "Sites / Locations",
    detail: "Customer offices, facilities, campuses, and job locations.",
    status: "Coming soon",
    icon: MapPin
  },
  {
    label: "Vendors",
    detail: "Companies R2 buys from or coordinates with for project work.",
    status: "Coming soon",
    icon: Truck
  },
  {
    label: "Suppliers",
    detail: "Material and equipment sources for quote and project work.",
    status: "Coming soon",
    icon: PackageCheck
  },
  {
    label: "Subcontractors",
    detail: "External labor and specialist teams available for projects.",
    status: "Coming soon",
    icon: UsersRound
  },
  {
    label: "Manufacturers",
    detail: "Product brands, standards, and manufacturer relationships.",
    status: "Coming soon",
    icon: Factory
  },
  {
    label: "Reps / Partner Contacts",
    detail: "Manufacturer reps, partner contacts, and relationship owners.",
    status: "Coming soon",
    icon: Handshake
  }
];

export default function DirectoryPage() {
  return (
    <PulseShell
      activePage="directory"
      title="Directory"
      subtitle="Supporting relationship records for Requests, Quotes, and Projects."
    >
      <section className="mock-panel business-panel" aria-labelledby="directory-title">
        <div className="section-heading">
          <div>
            <h2 id="directory-title">Directory Records</h2>
            <p>Clients are active today. The remaining relationship records will be promoted into searchable modules as the domain model expands.</p>
          </div>
        </div>

        <div className="object-grid">
          {directorySections.map((section, index) => {
            const Icon = section.icon;
            const card = (
              <article className="object-card">
                <div className={`object-icon tone-${index % 2 === 0 ? "blue" : "green"}`}>
                  <Icon size={30} />
                </div>
                <div>
                  <h3>{section.label}</h3>
                  <p>{section.detail}</p>
                  <strong>{section.status}</strong>
                </div>
              </article>
            );

            return section.href ? (
              <Link className="directory-card-link" href={section.href} key={section.label}>
                {card}
              </Link>
            ) : (
              <div className="directory-card-link disabled" key={section.label}>
                {card}
              </div>
            );
          })}
        </div>
      </section>
    </PulseShell>
  );
}
