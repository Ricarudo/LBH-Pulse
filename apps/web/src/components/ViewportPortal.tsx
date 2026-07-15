"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ViewportPortalProps = {
  children: ReactNode;
  enabled?: boolean;
};

/**
 * Keeps viewport overlays outside route animation containing blocks so fixed
 * positioning is always relative to the visible browser window.
 */
export function ViewportPortal({ children, enabled = true }: ViewportPortalProps) {
  if (!enabled) return children;
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
