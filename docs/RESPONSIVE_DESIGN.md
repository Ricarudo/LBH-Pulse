# Responsive design standard

Pulse uses a small set of viewport tiers so navigation and page-level layouts
change consistently across modules.

| Tier | Width |
| --- | --- |
| Small compact | below 640px |
| Compact / mobile | below 768px |
| Tablet | 768px through 1023px |
| Desktop | 1024px through 1279px |
| Large desktop | 1280px through 1535px |
| Wide | 1536px and above |

## Implementation rules

- Build new components mobile-first, then add `min-width` enhancements at 768,
  1024, 1280, or 1536px.
- Use viewport tiers for the shell, navigation, page composition, and other
  application-level changes.
- Use container queries when a reusable component changes because of its own
  available width. Do not introduce a new viewport breakpoint for that case.
- JavaScript behavior must use `responsiveBreakpoints`, `responsiveQueries`, or
  `useResponsiveMode` from `src/lib/responsive.ts`.
- Existing desktop-first CSS may use the complementary maximums 639, 767, 1023,
  1279, and 1535px while it is migrated.
- Account for `env(safe-area-inset-*)`, use dynamic viewport units for
  full-screen surfaces, and keep interactive targets at least 44px high.

Run `npm run responsive:check` in `apps/web` to catch noncanonical media-query
widths.
