# Pulse Brand Standards

Date: 2026-05-09

Status: Initial standard

## Purpose

This document records the baseline visual standards for Pulse and the ongoing KuoteSuite-to-Pulse transition.

These standards should guide new Pulse UI work and any continued modernization of the legacy KuoteSuite prototype.

## Typography

The default application font is Manrope.

Use Manrope for:

- page text
- navigation
- tables
- forms
- buttons
- cards
- dialogs
- proposal UI previews
- dashboard and operations screens

Recommended web font weights:

- 400 regular
- 500 medium
- 600 semibold
- 700 bold
- 800 extra bold
- 900 black, only for high-emphasis metrics or display text

Recommended fallback stack:

```css
font-family: "Manrope", "Helvetica Neue", Arial, sans-serif;
```

## Current Implementations

- Legacy Angular app: Manrope is loaded in `gui/src/index.html`, applied globally in `gui/src/styles.css`, and configured for Angular Material in `gui/src/theme.scss`.
- New Pulse web app: Manrope is loaded in `apps/web/src/app/layout.tsx` and applied globally in `apps/web/src/app/globals.css`.

## Responsive And Mobile Implementation

Pulse should use modular, resolution-aware layouts instead of fixed desktop widths. Shells, workspaces, tables, panels, and command bars should use `minmax()`, `clamp()`, and controlled breakpoints so the interface compresses cleanly across ultrawide, laptop, tablet, and phone screens.

On narrower desktop and tablet displays, the top action bar should remain a single controlled toolbar: search keeps the flexible space, secondary actions compress into fixed-size icon buttons, and optional labels/profile text are hidden before controls wrap or leak.

On mobile, Pulse should prioritize task completion over desktop density:

- The main shell stacks vertically with compact navigation.
- Search remains available at the top of the page.
- Filters and create actions appear as icon-sized controls or dedicated stacked rows.
- Detail panels move below lists instead of sitting beside them.
- Tables either become horizontally scrollable work grids or collapse into readable stacked rows.
- Wizard steps become a single-column progression with full-width navigation buttons.

## Guardrails

- Do not introduce a new primary UI font without updating this document.
- Keep application text readable and work-focused.
- Use stronger font weights for hierarchy, not decorative effects.
- Avoid negative letter spacing.
- Avoid viewport-scaled font sizes for application UI.
- Avoid topbar or command-bar wrapping that creates accidental second lines on narrow desktop displays.

