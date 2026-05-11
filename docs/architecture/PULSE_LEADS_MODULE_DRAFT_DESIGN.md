# Pulse Leads Module - Draft Design

Date: 2026-05-09

Status: Draft for implementation planning

## Purpose

This document defines a practical Leads module design for Pulse, R2 Communications Group's internal operations platform.

Pulse is not just a CRM. The Leads module should be the front door into a broader workflow that can later connect opportunities, quotes, proposal outputs, projects, procurement, field operations, billing, and analytics.

The current Angular/Express KuoteSuite app is treated as historical prototype context, not the final architecture.

## Research Basis

The design below is based on public documentation from major CRM platforms:

- Salesforce lead records separate prospects from contacts/opportunities; qualified leads can convert into accounts, contacts, and opportunities, and standard lead fields include owner, source, and status. Sources: [Salesforce Leads](https://help.salesforce.com/s/articleView?id=sales.leads_def.htm&language=en_US&type=5), [Lead Fields](https://help.salesforce.com/s/articleView?id=sales.leads_fields.htm&language=en_US&type=5), [Convert Qualified Leads](https://help.salesforce.com/s/articleView?id=sales.leads_convert.htm&language=en_US&type=5).
- HubSpot emphasizes record timelines, calls, emails, notes, tasks, saved views, import/export, and deduplication. Sources: [Create Leads](https://knowledge.hubspot.com/records/create-leads), [Create or Log Activities](https://knowledge.hubspot.com/records/manually-log-activities-on-records), [Saved Views](https://knowledge.hubspot.com/records/manage-saved-views-in-the-updated-index-page), [Import Records and Activities](https://knowledge.hubspot.com/crm-setup/import-objects), [Export Records](https://knowledge.hubspot.com/import-and-export/export-records), [Deduplicate Records](https://knowledge.hubspot.com/records/automatically-merge-duplicate-records).
- Pipedrive provides a dedicated Leads Inbox with add/import, sort/filter, detail views, archive/delete, convert to deals, group email, mentions, and duplicate merge. Sources: [Pipedrive Leads Inbox](https://support.pipedrive.com/hc/en/articles/360001998358-Leads), [Leads vs Deals](https://support.pipedrive.com/en/article/leads-vs-deals?category=organizing-your-data).
- Zoho CRM treats a lead as a combined unqualified person/company/opportunity record, supports assignment, follow-up, conversion to account/contact/deal, and scoring rules. Sources: [Working with Leads](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/leads/articles/leads), [Converting Leads](https://help.zoho.com/portal/kb/articles/convert-leads), [Scoring Rules](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/scoring-rules/articles/multiple-scoring-rule).
- Salesforce and HubSpot both provide duplicate-management patterns for clean CRM data. Sources: [Salesforce Duplicate Rules](https://help.salesforce.com/s/articleView?id=sales.duplicate_rules_map_of_reference.htm), [HubSpot Deduplicate Records](https://knowledge.hubspot.com/records/automatically-merge-duplicate-records).

## Feature Inventory

| Feature | Purpose | Standard CRM behavior | Recommended for Pulse MVP? | Notes for R2 Communications use case |
| --- | --- | --- | --- | --- |
| Lead list/index page | Give sales and operations a shared queue of potential work | Table/list with search, filters, sort, views, owner/status columns | Yes | This should be the main working view for incoming project requests, referrals, service-like inquiries, and walk-through requests. |
| Lead detail page | Central record for all lead context | Left summary, main timeline, right side activity/tasks/associations | Yes | R2 needs one place to see customer, site, contact, service interest, follow-up, and notes before quoting. |
| Create/edit lead | Capture lead details quickly and consistently | Manual entry, required fields, validation, owner assignment | Yes | Keep the first form fast. Do not force account/contact/site creation before the lead is qualified. |
| Lead source tracking | Understand where leads come from | Picklist or campaign/source attribution | Yes | Useful sources: Referral, Existing Customer, Website, Email, Phone, Walk-in, Vendor, Partner, Public Bid, Internal. |
| Lead owner/assignment | Clarify who is responsible | Owner field, assignment rules, queues | Yes | Start manual owner assignment. Assignment rules can come later. |
| Lead status/stage | Show qualification progress | Status picklist such as Open, Contacted, Qualified, Converted, Lost | Yes | R2 statuses should reflect site visits, estimating, quote/proposal preparation, and conversion. |
| Priority | Focus on urgent/high-value leads | Priority or score field, often manual first | Yes | Use Low/Normal/High/Urgent before automated scoring. High priority can mean customer deadline, outage, major project, or executive request. |
| Filtering and sorting | Let users find their work quickly | Filter by owner, status, source, activity, date, priority | Yes | MVP should include My Leads, Open Leads, Needs Follow-Up, Qualified, Unassigned. |
| Saved views | Reusable filtered lists | Personal or shared views | Later | Add after basic filtering proves useful. |
| Search | Quick lookup | Search by lead, company, person, email, phone | Yes | Must search company, contact, site/location, lead title, and notes. |
| Activity timeline | Preserve history | Calls, emails, notes, tasks, meetings, property changes in chronological feed | Yes | Critical for handoffs from sales to estimating/project teams. |
| Notes | Capture unstructured context | Timeline note or rich text note | Yes | Include field notes from phone calls, site constraints, existing systems, customer pain points. |
| Tasks/follow-up reminders | Prevent leads from going stale | Task records with due dates, owner, completion state | Yes | MVP should show Next Follow-Up Date and simple tasks. |
| Calls/emails logging | Track outreach | Manual and integrated activity logging | Later | Manual call/email notes in MVP; Microsoft integration later. |
| Files/attachments | Store reference docs | Attach files to records and carry them through conversion | Later for upload, Yes as model placeholder | Photos, drawings, bid docs, customer scopes, and site sketches matter for R2. Model it now; upload UI can follow. |
| Lead scoring | Rank lead quality | Manual rules, behavior scoring, AI scoring | Later | Use manual priority first. Scoring later can consider source, value, deadline, customer type, response speed, and service interest. |
| Lead conversion | Move qualified lead into sales execution | Convert lead to account/contact/opportunity/deal and carry activities/files | Yes | Convert to Customer/Contact/Site as needed, create Opportunity, optionally create Quote placeholder. Project should usually wait until quote approval. |
| Duplicate detection | Reduce duplicate customers/contacts/leads | Email/domain/name/phone matching, merge workflow | Later | Valuable but not MVP. For MVP, show "possible duplicate" by email/company/phone after data model stabilizes. |
| Duplicate merging | Consolidate records | Choose primary record and merge fields/timeline | Later | Needs audit trail and permissions. |
| Bulk actions | Update/assign/convert multiple leads | Checkbox selection and bulk updates | Later | Helpful after lead volume grows. MVP can skip. |
| Import/export | Load or extract CRM data | CSV/XLSX import/export with mapping and permissions | Later | Useful for existing spreadsheets and marketing lists, but risky before field schema stabilizes. |
| Automation rules | Reduce manual follow-up | Assignment, reminders, status changes, notifications | Later | Start with simple "follow-up overdue" UI indicators. |
| Reporting/analytics | Track lead performance | Source conversion, status aging, owner workload, funnel metrics | Yes basic, Later advanced | MVP should show counts by status/source/owner and overdue follow-ups. Advanced attribution later. |
| Mentions/internal collaboration | Pull teammates into a record | @mentions in notes/comments | Later | Useful for PM/estimator handoffs, but not first build. |
| Mobile field updates | Let technicians update from site | Responsive/mobile record updates | Later | Important eventually for site visit notes/photos. |
| AI summaries | Speed review and handoff | Auto-summary of timeline and next steps | Later | Useful after activity data exists. |

## Proposed Pulse Leads Module Structure

### Lead List Page

Primary use: daily work queue for sales, estimators, and managers.

Recommended layout:

- Header: "CRM / Leads", search, New Lead button, import placeholder later.
- KPI strip: Open Leads, Needs Follow-Up, Qualified, Site Visits Needed.
- View tabs: All Open, My Leads, Unassigned, Needs Follow-Up, Qualified, Lost/Unqualified.
- Filter panel: status, owner, source, priority, service interest, estimated value, next follow-up, created date.
- Table columns:
  - Lead name/title
  - Company
  - Contact person
  - Service interest
  - Site/location
  - Status
  - Priority
  - Owner
  - Next follow-up
  - Estimated value
  - Last activity
- Row actions:
  - Open detail
  - Add note
  - Add task
  - Change status
  - Convert

MVP behavior:

- Search and filter client-side in the first static/early implementation.
- Server-backed pagination later.
- Store selected view/filter state in URL query parameters.

### Lead Detail Page

Primary use: decision and handoff page.

Recommended layout:

- Left summary panel:
  - Lead status
  - Priority
  - Owner
  - Source
  - Estimated value
  - Next follow-up
  - Contact info
  - Company/customer
  - Site/location
- Main panel:
  - Lead title/name
  - Qualification checklist
  - Service interest and project description
  - Activity timeline
- Right panel:
  - Tasks
  - Related records
  - Files
  - Conversion actions

Recommended detail tabs:

- Overview
- Timeline
- Tasks
- Files
- Conversion

### Create/Edit Lead Form

Principles:

- Fast first capture.
- Required fields should be minimal.
- Avoid forcing premature customer/contact/site normalization.
- Let users link to existing customer/contact/site when known.

Recommended sections:

- Basic information
- Contact information
- Company and site
- Work interest
- Qualification and ownership
- Notes/files

MVP required fields:

- Lead name/title
- Company or contact person
- Lead source
- Service interest
- Lead status
- Assigned owner
- Next follow-up date

Useful optional fields:

- Email
- Phone
- Site/location
- Estimated project value
- Priority
- Notes
- Related files

### Lead Activity Timeline

MVP activity types:

- Note
- Task created
- Task completed
- Status changed
- Owner changed
- Follow-up date changed
- Lead converted

Later activity types:

- Email sent/received
- Call logged from phone/VoIP integration
- Meeting/site visit
- File uploaded
- Duplicate merged
- Automation event
- AI summary generated

Timeline rules:

- Activity should be append-only for auditability.
- Edits/deletes should create an audit event.
- Conversion should carry lead timeline into the Opportunity, Quote, and eventual Project handoff context.

### Lead Conversion Flow

The recommended Pulse conversion flow:

1. User clicks Convert Lead.
2. Pulse opens a conversion dialog with matched existing records:
   - Customer
   - Contact
   - Site
3. User chooses:
   - Create new Customer/Contact/Site
   - Link to existing Customer/Contact/Site
   - Leave unknown fields as placeholders
4. Pulse creates an Opportunity as the primary converted business object.
5. User can optionally create:
   - Quote placeholder
   - Site visit task
   - Estimating task
6. Lead status becomes Won / Converted.
7. Timeline records the conversion and related record IDs.

Project creation should not be the normal lead conversion target. Project creation should usually happen after quote approval. MVP may show a disabled/placeholder "Create Project Later" action to communicate the intended lifecycle.

### Lead Reporting/Analytics

MVP analytics:

- Leads by status
- Leads by source
- Leads by owner
- Leads needing follow-up
- Lead aging by status
- Qualified leads this month
- Converted leads this month

Later analytics:

- Source-to-conversion rate
- Average time to qualification
- Average time to quote
- Owner workload and response time
- Lost reason analysis
- Estimated value by source/service interest
- Lead scoring trends
- Marketing attribution

## Recommended Lead Fields

| Field | Type | MVP? | Notes |
| --- | --- | --- | --- |
| `id` | UUID/CUID | Yes | Internal stable ID. |
| `leadNumber` | String | Yes | Human-friendly ID such as `LD-2026-0001`. |
| `name` | String | Yes | Short title, for example "Access control expansion". |
| `companyName` | String | Yes | Raw company name before normalization. |
| `contactName` | String | Yes | Raw person name before contact creation. |
| `email` | String | Yes | Also useful for duplicate detection. |
| `phone` | String | Yes | Store as string, not number. |
| `leadSource` | Enum | Yes | Referral, Existing Customer, Website, Phone, Email, Walk-In, Vendor, Partner, Public Bid, Internal, Other. |
| `serviceInterest` | Enum/String | Yes | Access Control, CCTV, Structured Cabling, Fiber, Network, AV, Security, Maintenance, Other. |
| `siteName` | String | Yes | Raw location name before Site record. |
| `siteAddress` | String | Yes | Important for site visits and dispatch. |
| `estimatedProjectValue` | Decimal | Yes | Optional but useful for priority. |
| `status` | Enum | Yes | See recommended statuses below. |
| `priority` | Enum | Yes | Low, Normal, High, Urgent. |
| `assignedOwnerId` | FK User | Yes | Sales/PM/technician owner. |
| `nextFollowUpAt` | DateTime | Yes | Core anti-stale workflow. |
| `notes` | Text | Yes | Initial freeform capture. Long-term notes should also become timeline activities. |
| `relatedFiles` | Relation | Later | Model early; full upload later. |
| `createdAt` | DateTime | Yes | System field. |
| `updatedAt` | DateTime | Yes | System field. |
| `lastActivityAt` | DateTime | Yes | Drives sorting and stale-lead indicators. |
| `qualifiedAt` | DateTime | Later | Useful for funnel analytics. |
| `convertedAt` | DateTime | Yes | Set when converted. |
| `lostReason` | Enum/String | Later | Required when status is Lost. |
| `unqualifiedReason` | Enum/String | Later | Required when status is Unqualified. |
| `customerId` | FK Customer | Yes optional | Populated if linked or converted. |
| `contactId` | FK Contact | Yes optional | Populated if linked or converted. |
| `siteId` | FK Site | Yes optional | Populated if linked or converted. |
| `opportunityId` | FK Opportunity | Later/MVP placeholder | Created during conversion once Opportunity exists. |
| `quoteId` | FK Quote | MVP placeholder | Optional quote placeholder after qualification. |

## Recommended Lead Statuses

Recommended MVP workflow:

1. New
2. Contacted
3. Qualified
4. Site Visit Needed
5. Estimating
6. Proposal Needed
7. Proposal Sent
8. Won / Converted
9. Lost
10. Unqualified

Implementation notes:

- "Proposal Needed" and "Proposal Sent" are lead-facing workflow statuses only. Proposal output remains a subcategory/output of Quote, not a top-level Pulse module.
- "Won / Converted" means the lead has been converted into an Opportunity and optionally a Quote placeholder.
- Lost should mean there was a real fit but R2 did not win it.
- Unqualified should mean the lead was not a fit, had insufficient information, was spam, duplicated another record, or had no viable work.

## MVP vs Later Phases

### MVP

- Lead list
- Lead detail
- Create/edit lead
- Lead status
- Lead source
- Service interest
- Priority
- Assigned owner
- Notes
- Basic tasks/follow-up reminders
- Activity timeline
- Basic filtering and search
- Convert lead to Opportunity placeholder
- Optional create Quote placeholder
- Basic reporting: status/source/owner/follow-up counts

### Phase 2

- Real Opportunity object and conversion implementation
- Related Customer/Contact/Site matching during conversion
- File uploads
- Saved views
- Import/export
- Bulk owner/status updates
- Lost/unqualified reason enforcement
- Lead aging reports

### Later

- Email integration
- Call logging integration
- Duplicate detection and merge
- Automation rules
- Lead scoring
- AI lead summaries
- Marketing campaign attribution
- Web form capture
- Mobile site visit updates
- Advanced source attribution and ROI analytics

## Existing Repository Review

### Existing CRM/Lead-Related Code

Backend:

- `backend/prisma/schema.prisma`
  - `Lead` model with `stateId`, `clientId`, `clientSiteId`, `pointOfContactId`, `assignedEmployeeId`, `title`, dates as strings, `projectDescription`, and `comments`.
  - `Client`, `ClientSite`, and `PointOfContact` models represent customer, site, and contact concepts.
  - `Quote` model references `leadId`, client/site/contact IDs, owner/current employee, and proposal specifications.
- `backend/routes/leads.js`
  - Basic Express CRUD routes for list, create, get, update, and delete.
  - Uses Prisma through `backend/config/prisma.js`.
  - Validates required title/date/client/site/contact fields.
- `backend/routes/clients.js`
  - CRUD for clients, sites, and points of contact.
- `backend/routes/quotes.js`
  - Supports quote creation with `lead_id`.

Frontend:

- `gui/src/app/_components/lDashboard/lDashboard.ts`
  - Lead list dashboard.
  - Fetches leads and then resolves customer/site/contact names with additional API calls.
- `gui/src/app/_components/lead-page/lead-page.ts`
  - Create/edit lead form.
  - Selects client, site, point of contact, and assigned employee.
  - Can create a quote from a lead.
- `gui/src/app/_models/lead.ts`
  - Angular lead type.
- `gui/src/app/_models/client.ts`
  - Client, ClientSite, PointOfContact types.
- `gui/src/app/_services/httpRequest.service.ts`
  - Lead, client, site, contact, and quote API calls.

### Current Data Models Related To Leads/Customers/Quotes

Current prototype concept mapping:

| Prototype Concept | Pulse Concept | Keep? |
| --- | --- | --- |
| `Client` | `Customer` | Keep conceptually, rename. |
| `ClientSite` | `Site` | Keep conceptually, fix relation typing. |
| `PointOfContact` | `Contact` | Keep conceptually, rename. |
| `Lead` | `Lead` | Keep conceptually, redesign fields. |
| `Quote` | `Quote` | Keep conceptually, redesign quote lines. |
| `State` | Status enums/workflow tables | Replace with explicit status enums per module. |

### Components That Can Be Reused Conceptually

- Lead list/table workflow.
- Lead detail/create/edit flow.
- Lead association with customer, site, and contact.
- Assigned employee/owner concept.
- Lead-to-quote conversion concept.
- Local dev users as seed examples.

### Components That Should Be Replaced

- Angular components should not be carried forward directly.
- Express route shape should be replaced by a typed NestJS module.
- String date fields should become DateTime.
- `state_id` should become a readable lead status enum.
- Lead detail should not make N+1 API calls for customer/site/contact names.
- `alert()`-based UX should be replaced with toast/dialog patterns.
- Lead conversion should not mutate a lead object into quote shape in frontend code.
- Activity history, tasks, follow-up reminders, source, priority, and duplicate detection are missing and should be designed into Pulse.

## Recommended New Leads Folder/Module Structure

Frontend:

```text
apps/web/src/app/leads/
  page.tsx
  [leadId]/
    page.tsx
  new/
    page.tsx

apps/web/src/modules/leads/
  components/
    LeadList.tsx
    LeadDetailHeader.tsx
    LeadForm.tsx
    LeadActivityTimeline.tsx
    LeadTasksPanel.tsx
    LeadConversionDialog.tsx
    LeadFilters.tsx
  hooks/
    useLeads.ts
    useLeadDetail.ts
  data/
    lead-status.ts
    lead-source.ts
```

Backend:

```text
apps/api/src/modules/leads/
  leads.module.ts
  leads.controller.ts
  leads.service.ts
  dto/
    create-lead.dto.ts
    update-lead.dto.ts
    lead-query.dto.ts
    convert-lead.dto.ts
  policies/
    lead-permissions.ts
  mappers/
    lead.mapper.ts
```

Shared types:

```text
packages/types/src/leads/
  lead.types.ts
  lead-status.ts
  lead-source.ts
```

Database:

```text
prisma/
  schema.prisma
```

## Suggested Database Schema

Draft Prisma-style model:

```prisma
enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  SITE_VISIT_NEEDED
  ESTIMATING
  PROPOSAL_NEEDED
  PROPOSAL_SENT
  WON_CONVERTED
  LOST
  UNQUALIFIED
}

enum LeadPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum LeadSource {
  REFERRAL
  EXISTING_CUSTOMER
  WEBSITE
  PHONE
  EMAIL
  WALK_IN
  VENDOR
  PARTNER
  PUBLIC_BID
  INTERNAL
  OTHER
}

model Lead {
  id                    String       @id @default(cuid())
  leadNumber            String       @unique
  name                  String
  companyName           String?
  contactName           String?
  email                 String?
  phone                 String?
  leadSource            LeadSource
  serviceInterest       String
  siteName              String?
  siteAddress           String?
  estimatedProjectValue Decimal?     @db.Decimal(12, 2)
  status                LeadStatus   @default(NEW)
  priority              LeadPriority @default(NORMAL)
  assignedOwnerId       String
  nextFollowUpAt        DateTime?
  notes                 String?
  customerId            String?
  contactId             String?
  siteId                String?
  opportunityId         String?
  quoteId               String?
  convertedAt           DateTime?
  lastActivityAt        DateTime?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  activities            LeadActivity[]
  tasks                 LeadTask[]

  @@index([status])
  @@index([assignedOwnerId])
  @@index([leadSource])
  @@index([nextFollowUpAt])
  @@index([lastActivityAt])
}

model LeadActivity {
  id          String   @id @default(cuid())
  leadId      String
  type        String
  title       String
  body        String?
  actorUserId String
  createdAt   DateTime @default(now())

  lead        Lead     @relation(fields: [leadId], references: [id])

  @@index([leadId, createdAt])
}

model LeadTask {
  id             String    @id @default(cuid())
  leadId         String
  title          String
  dueAt          DateTime?
  completedAt    DateTime?
  assignedOwnerId String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  lead           Lead      @relation(fields: [leadId], references: [id])

  @@index([leadId])
  @@index([assignedOwnerId, dueAt])
}
```

## Implementation Notes

- Start with the Next app UI and shared TypeScript types before committing to final database migrations.
- Keep lead capture loose enough for incomplete early inquiries.
- Normalize into Customer, Contact, Site, Opportunity, and Quote only when the lead is qualified or converted.
- Store activity timeline events from the beginning, even if they are simple.
- Add audit logs separately from user-facing activity logs.
- Make conversion transactional in the backend.
- Avoid designing leads as a quote-only workflow. A lead can become an opportunity, a quote, or a future project path depending on qualification.

