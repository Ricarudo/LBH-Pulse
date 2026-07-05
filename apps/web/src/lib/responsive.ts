"use client";

import { useSyncExternalStore } from "react";

export const responsiveBreakpoints = {
  smallCompact: 640,
  compact: 768,
  desktop: 1024,
  largeDesktop: 1280,
  wide: 1536
} as const;

export const responsiveQueries = {
  smallCompact: `(max-width: ${responsiveBreakpoints.smallCompact - 1}px)`,
  compact: `(max-width: ${responsiveBreakpoints.compact - 1}px)`,
  tablet: `(min-width: ${responsiveBreakpoints.compact}px) and (max-width: ${responsiveBreakpoints.desktop - 1}px)`,
  belowDesktop: `(max-width: ${responsiveBreakpoints.desktop - 1}px)`,
  desktop: `(min-width: ${responsiveBreakpoints.desktop}px)`,
  largeDesktop: `(min-width: ${responsiveBreakpoints.largeDesktop}px)`,
  wide: `(min-width: ${responsiveBreakpoints.wide}px)`
} as const;

export type ResponsiveMode =
  | "compact"
  | "tablet"
  | "desktop"
  | "large-desktop"
  | "wide";

function currentResponsiveMode(): ResponsiveMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  const width = window.innerWidth;

  if (width < responsiveBreakpoints.compact) return "compact";
  if (width < responsiveBreakpoints.desktop) return "tablet";
  if (width < responsiveBreakpoints.largeDesktop) return "desktop";
  if (width < responsiveBreakpoints.wide) return "large-desktop";
  return "wide";
}

function subscribeToViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

export function useResponsiveMode() {
  return useSyncExternalStore(
    subscribeToViewport,
    currentResponsiveMode,
    () => "desktop"
  );
}

