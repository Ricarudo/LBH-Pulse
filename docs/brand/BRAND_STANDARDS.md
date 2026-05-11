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

## Guardrails

- Do not introduce a new primary UI font without updating this document.
- Keep application text readable and work-focused.
- Use stronger font weights for hierarchy, not decorative effects.
- Avoid negative letter spacing.
- Avoid viewport-scaled font sizes for application UI.

