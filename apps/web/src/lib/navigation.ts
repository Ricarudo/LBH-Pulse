import type { ComponentType } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  Menu,
  ReceiptText,
  Settings,
  UserRound
} from "lucide-react";
import type { GlobalSearchKind } from "@/types/search";

export type PulsePage =
  | "hub"
  | "requests"
  | "directory"
  | "leads"
  | "clients"
  | "quotes"
  | "projects"
  | "procurement"
  | "field"
  | "billing"
  | "statistics"
  | "activity"
  | "settings";

export type NavigationKey =
  | "hub"
  | "requests"
  | "quotes"
  | "projects"
  | "directory"
  | "billing"
  | "activity"
  | "statistics"
  | "settings"
  | "more";

export type NavigationItem = {
  href: string;
  label: string;
  key: NavigationKey;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Core",
    items: [
      { href: "/hub", label: "Dashboard", key: "hub", icon: Home },
      { href: "/requests", label: "Requests", key: "requests", icon: Inbox },
      { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
      { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
      { href: "/directory", label: "Directory", key: "directory", icon: Building2 },
      { href: "/billing", label: "Billing", key: "billing", icon: ReceiptText }
    ]
  },
  {
    label: "Insights",
    items: [
      { href: "/activity", label: "Activity", key: "activity", icon: Activity },
      { href: "/statistics", label: "Analytics", key: "statistics", icon: BarChart3 }
    ]
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", key: "settings", icon: Settings }
    ]
  }
] as const;

export const desktopNavigationItems = navigationGroups.flatMap(
  (group) => group.items
);

export const mobilePrimaryItems: readonly NavigationItem[] = [
  { href: "/hub", label: "Dashboard", key: "hub", icon: Home },
  { href: "/requests", label: "Requests", key: "requests", icon: Inbox },
  { href: "/quotes", label: "Quotes", key: "quotes", icon: FileText },
  { href: "/projects", label: "Projects", key: "projects", icon: FolderKanban },
  { href: "#pulse-more", label: "More", key: "more", icon: Menu }
] as const;

export const mobileOverflowGroups = [
  {
    label: "Directory",
    items: [
      { href: "/directory", label: "Directory overview", icon: Building2 },
      { href: "/clients", label: "Clients", icon: Building2 },
      { href: "/contacts", label: "Contacts", icon: UserRound }
    ]
  },
  {
    label: "Operations & insights",
    items: [
      { href: "/billing", label: "Billing", icon: ReceiptText },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/statistics", label: "Analytics", icon: BarChart3 }
    ]
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", icon: Settings }
    ]
  }
] as const;

export const navigationCommands = desktopNavigationItems.map((item) => ({
  id: `navigate-${item.key}`,
  label: item.label,
  detail: "Open Pulse module",
  href: item.href,
  icon: item.icon
}));

export function getActiveNavigationKey(pathname: string): NavigationKey {
  if (pathname.startsWith("/requests") || pathname === "/leads") return "requests";
  if (pathname.startsWith("/quotes")) return "quotes";
  if (
    pathname.startsWith("/projects") ||
    pathname.startsWith("/procurement") ||
    pathname.startsWith("/field")
  ) {
    return "projects";
  }
  if (
    pathname.startsWith("/directory") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/contacts")
  ) {
    return "directory";
  }
  if (pathname.startsWith("/billing")) return "billing";
  if (pathname.startsWith("/activity")) return "activity";
  if (pathname.startsWith("/statistics")) return "statistics";
  if (pathname.startsWith("/settings")) return "settings";
  return "hub";
}

export function getMobileActiveKey(pathname: string): NavigationKey {
  const active = getActiveNavigationKey(pathname);
  return active === "directory" ||
    active === "billing" ||
    active === "activity" ||
    active === "statistics" ||
    active === "settings"
    ? "more"
    : active;
}

export function isNavigationItemActive(
  pathname: string,
  key: NavigationKey
) {
  return getActiveNavigationKey(pathname) === key;
}

export function searchResultHref(kind: GlobalSearchKind, id: string) {
  if (kind === "request") return `/requests/${id}`;
  if (kind === "client") return `/clients/${id}`;
  if (kind === "quote") return `/quotes?record=${encodeURIComponent(id)}`;
  if (kind === "project") return `/projects?record=${encodeURIComponent(id)}`;
  return `/billing?record=${encodeURIComponent(id)}`;
}

const topLevelOrder: NavigationKey[] = [
  "hub",
  "requests",
  "quotes",
  "projects",
  "directory",
  "billing",
  "activity",
  "statistics",
  "settings"
];

export function routeMotionDirection(previousPath: string, nextPath: string) {
  const previousSegments = previousPath.split("/").filter(Boolean).length;
  const nextSegments = nextPath.split("/").filter(Boolean).length;

  if (nextSegments !== previousSegments) {
    return nextSegments > previousSegments ? 1 : -1;
  }

  const previousIndex = topLevelOrder.indexOf(
    getActiveNavigationKey(previousPath)
  );
  const nextIndex = topLevelOrder.indexOf(getActiveNavigationKey(nextPath));
  return nextIndex >= previousIndex ? 1 : -1;
}
