import type { ComponentType } from "react";
import {
  BarChart3,
  Building2,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  Menu,
  MapPin,
  ReceiptText,
  Settings,
  UserRound
} from "lucide-react";
import type { GlobalSearchKind } from "@pulse/contracts/search";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";

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
  | "settings";

export type NavigationKey =
  | "hub"
  | "requests"
  | "quotes"
  | "projects"
  | "directory"
  | "billing"
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
      { href: "/statistics", label: "Analytics", key: "statistics", icon: BarChart3 }
    ]
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/account", label: "Settings", key: "settings", icon: Settings }
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
      { href: "/contacts", label: "Contacts", icon: UserRound },
      { href: "/directory/sites", label: "Sites / Locations", icon: MapPin }
    ]
  },
  {
    label: "Operations & insights",
    items: [
      { href: "/billing", label: "Billing", icon: ReceiptText },
      { href: "/statistics", label: "Analytics", icon: BarChart3 }
    ]
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/account", label: "Settings", icon: Settings }
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
  if (pathname.startsWith("/statistics")) return "statistics";
  if (pathname.startsWith("/settings")) return "settings";
  return "hub";
}

export function getMobileActiveKey(pathname: string): NavigationKey {
  const active = getActiveNavigationKey(pathname);
  return active === "directory" ||
    active === "billing" ||
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
  if (kind === "quote") return `/quotes/${id}`;
  if (kind === "project") return `/projects?record=${encodeURIComponent(id)}`;
  if (kind === "item") return `/directory/items/${id}`;
  return `/billing?record=${encodeURIComponent(id)}`;
}

export function canAccessPath(
  user: AuthenticatedUser | null | undefined,
  pathname: string
) {
  if (!user) return false;
  if (pathname === "/" || pathname.startsWith("/hub")) return true;
  if (pathname.startsWith("/requests") || pathname === "/leads") {
    return canUser(user, "requests:read");
  }
  if (pathname.startsWith("/quotes")) return canUser(user, "quotes:read");
  if (
    pathname.startsWith("/projects") ||
    pathname.startsWith("/procurement") ||
    pathname.startsWith("/field")
  ) {
    return canUser(user, "projects:read");
  }
  if (pathname.startsWith("/billing")) return canUser(user, "billing:read");
  if (pathname.startsWith("/statistics")) return canUser(user, "analytics:read");
  if (pathname.startsWith("/directory/items")) return canUser(user, "items:read");
  if (
    pathname.startsWith("/clients") ||
    pathname.startsWith("/contacts") ||
    pathname.startsWith("/directory/clients") ||
    pathname.startsWith("/directory/contacts") ||
    pathname.startsWith("/directory/sites")
  ) {
    return canUser(user, "clients:read");
  }
  if (pathname === "/directory" || pathname === "/directory/") {
    return canUser(user, "clients:read") || canUser(user, "items:read");
  }
  if (pathname.startsWith("/settings/users")) return canUser(user, "users:manage");
  if (pathname.startsWith("/settings/roles")) return user.isSystemAdmin;
  if (pathname.startsWith("/settings/audit")) {
    return user.isSystemAdmin && canUser(user, "audit:read");
  }
  if (
    pathname.startsWith("/settings/general") ||
    pathname.startsWith("/settings/request-checklists") ||
    pathname.startsWith("/settings/roadmap")
  ) {
    return canUser(user, "settings:read");
  }
  if (pathname.startsWith("/settings")) return true;
  return true;
}

const topLevelOrder: NavigationKey[] = [
  "hub",
  "requests",
  "quotes",
  "projects",
  "directory",
  "billing",
  "statistics",
  "settings"
];

export type RouteMotionKind = "lateral" | "drill-in" | "drill-out" | "replace";

export type RouteMotionProfile = {
  kind: RouteMotionKind;
  direction: -1 | 0 | 1;
};

function routeSegmentCount(pathname: string) {
  return pathname.split("?")[0].split("#")[0].split("/").filter(Boolean).length;
}

export function routeMotionProfile(
  previousPath: string,
  nextPath: string
): RouteMotionProfile {
  const previousSegments = routeSegmentCount(previousPath);
  const nextSegments = routeSegmentCount(nextPath);

  if (nextSegments > previousSegments) {
    return { kind: "drill-in", direction: 1 };
  }

  if (nextSegments < previousSegments) {
    return { kind: "drill-out", direction: -1 };
  }

  const previousKey = getActiveNavigationKey(previousPath);
  const nextKey = getActiveNavigationKey(nextPath);

  if (previousKey === nextKey) {
    return { kind: "replace", direction: 0 };
  }

  const previousIndex = topLevelOrder.indexOf(previousKey);
  const nextIndex = topLevelOrder.indexOf(nextKey);
  return {
    kind: "lateral",
    direction: nextIndex >= previousIndex ? 1 : -1
  };
}

export function routeMotionDirection(previousPath: string, nextPath: string) {
  const profile = routeMotionProfile(previousPath, nextPath);
  return profile.direction === 0 ? 1 : profile.direction;
}
