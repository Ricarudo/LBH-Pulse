# Pulse Requests Mobile UX Analysis

Date: 2026-05-12

## Context

The Pulse shell now uses a mobile-first top navigation strip below 980px. The desktop sidebar remains available for larger workstations, but phone and small tablet users get the full viewport width for work content instead of losing space to a left rail.

The Requests page still carries a lot of workstation-density UI: lifecycle counts, operational metrics, saved views, filters, a multi-column queue, record details, checklist actions, status actions, notes, follow-ups, files, quote handoff, and activity. That is useful on desktop, but it is too much to read and operate in one continuous mobile page.

## Completed In This Pass

- Added a horizontal mobile top navigation strip in `PulseShell`.
- Hid the desktop sidebar under 980px so mobile content gets the full screen width.
- Kept global actions in the sticky topbar with icon-first controls.
- Changed the Requests table to render as labeled cards under 760px instead of requiring horizontal scrolling.

## Mobile Problems Remaining On Requests

1. The page starts with too many stacked summary layers before the user reaches the work queue.
2. Filters take too much vertical space when expanded as full select controls.
3. The selected request detail panel is still a long mixed-purpose panel rather than a task-focused mobile record view.
4. Checklist, workflow status, notes, follow-ups, files, related quote, and activity all compete at the same visual level.
5. Create/edit request is a large modal form with many fields, which is difficult to complete on a phone.
6. The page has no explicit mobile task modes, so intake review, checklist completion, follow-up, and conversion all live in one scroll.

## Recommended Refactor

Split the mobile Requests experience into three working modes:

- Queue: search, view chips, compact filters, and request cards focused on status, client/contact, next action, owner, due date, checklist progress, and missing required count.
- Request: a selected record screen with a sticky summary header and tabbed sections for Overview, Checklist, Activity, and Actions.
- Capture: a step-based create/edit flow with short sections for Request, Contact, Site, Assignment, and Notes.

On mobile, hide the lifecycle and metrics panels behind a compact summary row or an Analytics drawer. The default first screen should be the queue, because that is the daily operational task.

Use bottom or top segmented controls for Request detail sections instead of stacking every section. The highest priority mobile actions should stay one tap away: call/email contact, update status, assign owner, complete checklist item, add note, and create quote when ready.

The create/edit form should become progressive. Required fields should appear first, optional details should collapse, and site visit/checklist readiness should be visible as validation feedback instead of forcing users to scan every field.

## Suggested Implementation Order

1. Add a mobile request-card component so the queue can have a deliberate compact layout instead of CSS-only table cards.
2. Move filters into a collapsible drawer or popover with clear active-filter chips.
3. Convert the detail panel into mobile tabs while preserving the desktop side panel.
4. Refactor create/edit into a reusable step form shared by desktop modal and mobile full-screen flow.
5. Move lifecycle/metrics into a compact mobile summary with a link to the fuller analytics preview.

This keeps desktop power-user density while making mobile feel like a real intake tool instead of a compressed desktop page.
