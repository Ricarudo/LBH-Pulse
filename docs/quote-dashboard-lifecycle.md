# Quote deadlines and home widgets

Current behavior after the overdue fix (September 2026). This records the existing rules for the planned 0.2 quote lifecycle review.

| Quote status | Home work queue / active quote count | Preparation deadline |
| --- | --- | --- |
| Draft, Review, On Hold | Eligible under normal scope and attention rules | Used |
| Sent | Excluded | Ignored |
| Approved, awaiting project handoff | Included with handoff attention | Ignored |
| Approved, linked to a project | Excluded | Ignored |
| Rejected, Expired, Cancelled | Excluded | Ignored |

The preparation deadline uses the quote due date first, then the latest nonarchived linked request's due date, then the source request snapshot ID's current request due date. The snapshot ID is a fallback lookup, not an immutable historical date. Dates are retained on records; suppression happens only when building dashboard widgets. Returning to a preparation status makes the preparation deadline applicable again.

Project handoff is recognized through either the original Quote–Project relation or a ProjectQuote link, including change orders. Preparatory change orders remain eligible even when linked to a project. An approved linked quote is excluded even if the linked project is archived or outside the viewer's scope.

Open current steps remain separate from preparation deadlines. The dashboard falls back from quote to request steps, project to quote steps, and invoice to project steps. It assigns a shared step to the furthest downstream eligible record within the viewer's scope. An open step's past target date can legitimately mark an approved handoff or a project overdue; this fix does not complete or delete steps. Project due dates come from project input, not the old quote preparation date.

The work queue uses the earlier applicable record deadline or step target date. The overdue summary counts work items; the schedule can list record deadlines and step targets separately. Active quote counts use the same status and handoff eligibility. Recent activity remains historical and is not filtered by these rules.

## Questions for the 0.2 rework

- Separate preparation, customer response/expiration, handoff, and delivery deadlines explicitly. Sent quotes currently leave operational widgets entirely, including their current steps.
- Define which open preparation steps survive approval and which should close or become project steps. Current inheritance can carry overdue work forward.
- Reconcile original-project and ProjectQuote relationships, including change orders, revisions, archived projects, and scope-dependent step ownership.
- Decide whether request deadline fallback should remain live or use a historical snapshot.

Regression coverage lives in `apps/api/src/lib/services/dashboardService.spec.ts`: status/date fallback rules, original and change-order handoff links, and consistency across summary, queue, schedule, and module counts.
