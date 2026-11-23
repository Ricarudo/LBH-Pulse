# Pulse 0.2 Batch 03B Semantic Styling

Implemented the theme-token pass for audit findings UI-003 and UI-005 on `portfolio-database-preparation`, based on `bf1a93d`. The dark blue Sign in and Filter Apply labels now measure 7.52:1 in the browser fixture, up from 2.49:1.

## Theme ownership

| Role | Source and consumers |
| --- | --- |
| Base palette | `apps/web/src/app/theme.css` owns the light, dark and accent palettes and their `color-scheme` values. `globals.css` imports it after the existing Builder stylesheet. |
| Filled actions | `--pulse-action` and `--pulse-action-hover` resolve from the existing accent palette. `--pulse-on-action` supplies white in light mode and the dark page background color in dark mode. Consumers include the shared primary button, the record primary action, record confirmations, Filter Apply and the filter count badge. |
| Danger and warning | Confirmations use the danger or amber fill with the corresponding on-color from the theme. The shared role-archive and Quote hold buttons keep their semantic hue on hover and use the shared neutral disabled state. |
| Focus and disabled states | Primary and record-dialog buttons receive an accent outline on keyboard focus. Filter Apply retains its popup focus treatment and specifies its own hover and disabled colors so the generic popup hover rule cannot change its fill. |

The existing root theme bootstrap and preference handling still set the same HTML attributes. Color role names resolve from the active palette, so shared controls follow a theme or accent switch without component-level theme logic.

## Missing token repairs

- Role archive text now uses the canonical danger color. The Analytics danger rules use the same token throughout, with the winning error color verified against the baseline.
- Project task fields, task cards, progress bars, lifecycle notes and billing milestone highlights use existing Pulse tokens for borders, surfaces, text and accent. Nested Weight and Due inputs receive the same styling as the other task fields. Quote edit panels and shared notes reference the border palette directly so they work outside the WorkRecord wrapper.
- Client profile contact and site icons use the canonical surface. Document preview panels, metadata, status text, search text and the Add tag button use existing surface, border and text tokens. Document purpose choices and tag hover styles use the active accent palette.

## Verification

- The production Next.js build, including TypeScript, passed. All 57 frontend tests and the responsive breakpoint check passed.
- Headless Chrome ran the production CSS assets in Quotes route order against local fixtures at 390 and 1280 pixels. Each width covered light and dark mode with blue, violet, teal and orange accents. The lowest measured enabled label contrast was 5.00:1 and the lowest measured hover label contrast was 6.99:1, against the WCAG 2.2 AA text benchmark of 4.5:1. Tested keyboard outlines measured at least 4.75:1 against the fixture surfaces. Disabled controls kept their neutral state under the pointer. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- The fixture reproduced the old light-blue Filter Apply hover contrast of 1.07:1. The updated hover label measured 7.39:1 in that theme. The browser also verified computed Project field borders and surfaces, progress fill, document preview styles, and theme bootstrap with both system preferences and an explicit dark preference.
- Runtime checks covered the compiled styles on representative markup for sign-in, Quote, Builder, Item, Client, Analytics, Settings, Project, Documents and Filter. The checks used fixture HTML and the native filter dialog, without an authenticated application session.

| Theme | Accent | Primary label | Primary hover label |
| --- | --- | ---: | ---: |
| Light | Blue | 5.70:1 | 7.39:1 |
| Light | Violet | 5.55:1 | 7.12:1 |
| Light | Teal | 5.00:1 | 6.99:1 |
| Light | Orange | 5.18:1 | 7.31:1 |
| Dark | Blue | 7.52:1 | 9.52:1 |
| Dark | Violet | 7.76:1 | 10.14:1 |
| Dark | Teal | 12.12:1 | 14.25:1 |
| Dark | Orange | 9.03:1 | 10.76:1 |
