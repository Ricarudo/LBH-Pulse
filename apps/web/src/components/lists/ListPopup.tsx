"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { ViewportPortal } from "@/components/ViewportPortal";
import styles from "./ListControls.module.css";

// A shared coordinator also covers controls mounted outside a ListToolbar (reports).
let dismissActivePopup: (() => void) | null = null;
let unlockedBodyOverflow = "";

export function ListPopup({ title, trigger, kind, initialFocus = "heading", onDismiss, onApply, applyDisabled, children, summary }: {
  title: string;
  trigger: RefObject<HTMLButtonElement | null>;
  kind: "sort" | "filter";
  initialFocus?: "heading" | "selection";
  onDismiss: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
  children: ReactNode;
  summary?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const outsidePointer = useRef(false);

  useLayoutEffect(() => {
    const element = dialog.current!;
    const dismiss = () => { element.close(); dismissRef.current(); };
    if (!dismissActivePopup) unlockedBodyOverflow = document.body.style.overflow;
    dismissActivePopup?.();
    dismissActivePopup = dismiss;
    document.body.style.overflow = "hidden";
    // Native modality makes the rest of the document inert and contains keyboard focus.
    element.showModal();
    function position() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      // Coordinates from DOM rectangles include CSS zoom; fixed-position values do not.
      const scale = element.getBoundingClientRect().width / element.offsetWidth || 1;
      const viewportWidth = window.innerWidth / scale;
      const viewportHeight = window.innerHeight / scale;
      element.style.setProperty("--popup-max-height", `${window.innerWidth < 768 ? viewportHeight * .9 : viewportHeight - 32}px`);
      if (window.innerWidth < 768) return;
      const gutter = 16;
      const width = Math.min(kind === "sort" ? 360 : 480, viewportWidth - gutter * 2);
      const height = Math.min(element.scrollHeight, viewportHeight - gutter * 2);
      const below = viewportHeight - anchor.bottom / scale - 8 - gutter;
      const above = anchor.top / scale - 8 - gutter;
      const top = below >= height ? anchor.bottom / scale + 8 : above >= height ? anchor.top / scale - height - 8 : gutter;
      element.style.setProperty("--popup-width", `${width}px`);
      element.style.setProperty("--popup-top", `${Math.max(gutter, top)}px`);
      element.style.setProperty("--popup-left", `${Math.max(gutter, Math.min(anchor.right / scale - width, viewportWidth - width - gutter))}px`);
    }
    position();
    const selected = element.querySelector<HTMLInputElement>('input[data-initial-focus]:checked');
    (initialFocus === "selection" ? selected ?? heading.current : heading.current)?.focus({ preventScroll: true });
    if (initialFocus === "selection") selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      element.close();
      if (dismissActivePopup === dismiss) {
        dismissActivePopup = null;
        document.body.style.overflow = unlockedBodyOverflow;
        trigger.current?.focus({ preventScroll: true });
      }
    };
  }, [initialFocus, kind, trigger]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") { event.stopPropagation(); return; }
    if (event.key !== "Tab") return;
    const element = event.currentTarget;
    const nodes = Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(node => node.getClientRects().length);
    // Only the checked radio is a tab stop within each native radio group.
    const stops = nodes.filter(node => {
      if (!(node instanceof HTMLInputElement && node.type === "radio" && node.name)) return true;
      const group = nodes.filter(other => other instanceof HTMLInputElement && other.type === "radio" && other.name === node.name) as HTMLInputElement[];
      return node === (group.find(other => other.checked) ?? group[0]);
    });
    const first = stops[0]; const last = stops[stops.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function outside(event: React.PointerEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  return <ViewportPortal>
    <dialog ref={dialog} className={`${styles.popup} ${kind === "sort" ? styles.sortPopup : ""}`} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onDismiss(); }}
      onKeyDown={onKeyDown}
      onPointerDown={event => { outsidePointer.current = event.target === event.currentTarget && outside(event); }}
      onPointerUp={event => { if (outsidePointer.current && event.target === event.currentTarget && outside(event)) onDismiss(); outsidePointer.current = false; }}>
      <header><h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onDismiss}><X size={19} aria-hidden="true" /></button></header>
      <div className={styles.body}>{children}</div>
      {summary ? <div className={styles.popupSummary}>{summary}</div> : null}
      <footer><button type="button" onClick={onDismiss}>Cancel</button><button type="button" className={styles.apply} disabled={applyDisabled} onClick={onApply}>Apply</button></footer>
    </dialog>
  </ViewportPortal>;
}
