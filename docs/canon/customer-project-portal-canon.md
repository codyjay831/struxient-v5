# Customer Project Portal Canon

> **Status:** Canon for Struxient v5 customer-facing project access.
> **Core rule:** Do not call this product area "Customer Login" yet. The product value is a controlled project hub, not a generic account system.

## Canon Name

Use:

- **Customer Project Portal**
- **Customer Portal Access**
- **Customer Portal Identity**
- **Customer Portal Events**
- **Customer-visible resources**

Avoid product/code naming that implies a full account product before that is true, especially **Customer Login**. Customers may authenticate, but authentication is only the access mechanism for a scoped project experience.

## Product Job

The customer side should answer six questions:

1. What is happening?
2. What do I need to do?
3. When is someone coming?
4. What did I approve?
5. What do I owe?
6. What documents/photos are needed from me?

Everything else is secondary.

The first complete Customer Project Portal should include:

- Customer portal identity and access model
- Magic-link or token-based portal session
- One project portal page
- Customer-safe project status
- Next required customer action
- Quote and change order access
- Schedule visibility
- Appointment confirmation and reschedule requests
- Payment visibility/link
- Customer-visible documents/photos
- Customer uploads
- Customer requests/questions
- Portal activity audit
- Contractor-side access controls
- Contractor-side customer view preview

This is enough to feel complete without becoming a second contractor app.

## Hard Rules

### Customers Are Not Staff

Do not add `Membership(role: CUSTOMER)`.

Customers are external identities with scoped access. They are not staff/org members, workers, field users, viewers, or subcontractors.

Staff authorization remains:

- `User`
- `Membership`
- active organization context
- `StaffRole` (`OWNER`, `ADMIN`, `OFFICE`, `FIELD`, `VIEWER`, `SUBCONTRACTOR`)

Customer portal authorization is separate:

- `CustomerPortalIdentity`
- `CustomerPortalAccess`
- `CustomerPortalSession`

### Customer Actions Create Requests Or Events

Customer actions must not directly mutate internal job truth.

Customers may:

- Request a reschedule
- Upload a requested document/photo
- Confirm an appointment
- Accept a quote
- Accept a change order
- Ask a question
- Submit access notes
- Submit availability

Customers must not directly:

- Edit schedule commitments
- Edit job status
- Edit sold scope
- Edit task details
- Resolve internal blockers
- Change internal crew assignments

Internal Struxient staff flow decides what becomes job, task, schedule, document, or payment truth.

### Portal Is A Read/Action Layer

The portal is not the source of truth for the job.

Sources of truth:

| Concept | Source |
|---------|--------|
| Commercial scope before acceptance | `Quote` |
| Commercial scope changes | `ChangeOrder` |
| Runtime execution | `Job` |
| Execution truth | `JobTask` |
| Calendar commitments | `JobScheduleEvent` or canonical schedule event model |
| Billing truth | Payment/invoice provider and Struxient payment rows |
| Customer access truth | `CustomerPortalAccess` |
| Customer-side audit truth | `CustomerPortalEvent` |
| Customer visibility truth | `CustomerVisibleResource` |
| Customer-submitted request truth | `CustomerRequest` |

Customer project status and next customer action are derived presenters, not manually stored status columns.

### Visibility Is Explicit

No document, photo, note, task, schedule detail, invoice, or project update becomes customer-visible just because it exists.

Every customer-visible resource needs an explicit visibility record.

Do not model `INTERNAL_ONLY` as a portal visibility state. Internal-only resources simply do not have a `CustomerVisibleResource` row.

## Existing Public Surfaces

Keep existing public/customer routes:

- `/request/[companySlug]`
- `/q/[token]`
- `/co/[token]`

Do not rip these out. They become part of the broader customer access system over time.

Existing public token protections are the right pattern:

- Hashed tokens
- Scoped tokens
- Expirable tokens
- Revocable tokens
- View tracking
- Acceptance tracking

The upgrade path is additive: connect these routes to portal events and optional portal identity/access where useful without breaking existing quote and change order acceptance flows.

## Planned Data Model Responsibilities

This section locks responsibilities and boundaries. Exact Prisma field names may evolve during schema design, but the separation of concerns should not.

### CustomerContact

Represents a real person attached to a customer/property in an organization.

Examples:

- Homeowner
- Spouse
- Property manager
- Tenant
- Billing contact
- Decision maker

Expected facts:

- Organization
- Customer
- Name
- Email
- Phone
- Relationship to property
- Primary contact flag
- Billing contact flag
- Decision maker flag
- Created/updated/archive timestamps

This is not auth. It is contact identity and relationship context.

### CustomerPortalIdentity

Represents a verified external portal identity.

Expected facts:

- Normalized email
- Normalized phone
- Email verification timestamp
- Phone verification timestamp
- Created/updated timestamps
- Last seen timestamp
- Disabled timestamp

This is separate from `CustomerContact` because one external identity may have different contact roles across customers/jobs over time. A property manager may manage several properties. A spouse may later become primary contact. Identity and contact role are not the same thing.

Do not assume one email globally equals one legal person without verification and operational rules.

### CustomerPortalAccess

Main permission record for customer project access.

Expected facts:

- Organization
- Customer
- Job/project scope
- Customer contact
- Portal identity
- Access level
- Status
- Inviting staff membership
- Revoking staff membership
- Expiration
- Created/updated/revoked/last-used timestamps

Access levels:

- `VIEW_ONLY`
- `PROJECT_PARTICIPANT`
- `BILLING_CONTACT`
- `DECISION_MAKER`
- `PROPERTY_MANAGER`

Statuses:

- `ACTIVE`
- `PENDING_VERIFICATION`
- `REVOKED`
- `EXPIRED`
- `DISABLED`

Rules:

- Access is scoped to organization + customer + job/project.
- A customer can only see resources through active access.
- Revoked access immediately blocks future portal sessions.
- Expired access fails authorization.

This is the backbone. Build it before customer UI.

### CustomerPortalSession

Represents the customer's active browser session.

Expected facts:

- Portal identity
- Customer portal access
- Session token hash
- Created/expiry/revoked/last-seen timestamps
- IP address
- User agent

Use a separate customer portal cookie/session from staff auth, for example:

```text
struxient_customer_portal_session
```

Do not reuse staff session logic blindly.

### CustomerPortalMagicLinkToken

Used for email/SMS verification and single-purpose access.

Expected facts:

- Portal identity
- Customer portal access
- Token hash
- Purpose
- Created/expiry/used/revoked timestamps
- IP address
- User agent

Purposes:

- `PORTAL_SIGN_IN`
- `QUOTE_VIEW`
- `CHANGE_ORDER_VIEW`
- `PAYMENT_VIEW`
- `DOCUMENT_UPLOAD`

This lets single-purpose secure links and broader portal access live under one conceptual system.

### CustomerPortalEvent

Append-only customer portal audit stream.

Expected facts:

- Organization
- Customer
- Job/project
- Customer portal access
- Portal identity
- Event type
- Resource type
- Resource id
- Metadata JSON
- IP address
- User agent
- Created timestamp

Canonical event examples:

- `PORTAL_OPENED`
- `MAGIC_LINK_SENT`
- `MAGIC_LINK_USED`
- `QUOTE_VIEWED`
- `QUOTE_ACCEPTED`
- `QUOTE_CHANGE_REQUESTED`
- `CHANGE_ORDER_VIEWED`
- `CHANGE_ORDER_ACCEPTED`
- `PAYMENT_LINK_OPENED`
- `DOCUMENT_VIEWED`
- `DOCUMENT_UPLOADED`
- `PHOTO_UPLOADED`
- `APPOINTMENT_VIEWED`
- `APPOINTMENT_CONFIRMED`
- `RESCHEDULE_REQUESTED`
- `AVAILABILITY_SUBMITTED`
- `ACCESS_NOTE_SUBMITTED`
- `QUESTION_SUBMITTED`
- `CONTRACTOR_RESPONSE_VIEWED`
- `ACCESS_REVOKED`
- `ACCESS_EXPIRED`

This audit stream is for accountability and portal security. It is separate from internal job-facing activity, though important customer actions may also create staff-visible activity where appropriate.

### CustomerVisibleResource

Controls what customers can see.

Expected facts:

- Organization
- Customer
- Job/project
- Resource type
- Resource id
- Visibility
- Access level allowed
- Title
- Description
- Staff membership that made it visible
- Created/updated/revoked timestamps

Resource types:

- `QUOTE`
- `CHANGE_ORDER`
- `INVOICE`
- `PAYMENT_LINK`
- `DOCUMENT`
- `PHOTO`
- `SCHEDULE_EVENT`
- `PROJECT_UPDATE`
- `CUSTOMER_REQUEST`
- `CUSTOMER_UPLOAD`

Visibility:

- `CUSTOMER_VISIBLE`
- `CUSTOMER_ACTION_REQUIRED`
- `CUSTOMER_UPLOADED`
- `REVOKED`

File/document access must check `CustomerVisibleResource`. A storage path, folder, signed URL, or attachment relationship is not enough.

### CustomerRequest

Represents a structured customer-submitted request.

Expected facts:

- Organization
- Customer
- Job/project
- Customer portal access
- Type
- Status
- Title
- Message
- Metadata JSON
- Created/updated/resolved timestamps
- Resolving staff membership
- Optional linked task
- Optional linked schedule event
- Optional linked document

Types:

- `ASK_QUESTION`
- `REQUEST_RESCHEDULE`
- `SUBMIT_AVAILABILITY`
- `UPLOAD_DOCUMENT`
- `UPLOAD_PHOTO`
- `ADD_ACCESS_NOTE`
- `REPORT_ISSUE`
- `REQUEST_SCOPE_CHANGE`
- `BILLING_QUESTION`

Statuses:

- `OPEN`
- `NEEDS_REVIEW`
- `ACCEPTED`
- `DECLINED`
- `RESOLVED`
- `CLOSED`

This gives office staff a review queue without turning customer communication into unstructured chat.

## Authorization Architecture

Create a dedicated customer portal authorization boundary:

```ts
requireCustomerPortalAccess()
```

Every portal loader/action must use this or a narrower helper built on it.

It must verify:

- Valid customer portal session
- Session not expired
- Session not revoked
- Portal identity active
- `CustomerPortalAccess` active
- Access not revoked
- Access not expired
- Organization matches
- Customer matches
- Job/project matches when scoped
- Resource is customer-visible
- Access level allows the resource/action

Do not duplicate portal permission checks inside individual pages or React components.

Staff auth and customer auth must stay separate:

| Staff side | Customer side |
|------------|---------------|
| `User` | `CustomerPortalIdentity` |
| `Membership` | `CustomerPortalAccess` |
| Staff session cookie | Customer portal session cookie |
| `StaffRole` permissions | Access-level permissions |
| Staff security/audit events | `CustomerPortalEvent` |

Staff sessions must not become customer portal sessions. Customer portal sessions must not access staff routes.

## Route Plan

### Public Intake

Existing route:

```text
/request/[companySlug]
```

Keep public. Later it can create `Customer`, `CustomerContact`, `Lead`, and pending access state, but do not force portal creation during intake unless the contractor sends a portal invitation.

### Quote

Existing route:

```text
/q/[token]
```

Keep. Upgrade by adding portal event writes on view/accept/request-changes and optional identity association. Do not require a full portal session to accept a quote unless the product explicitly chooses stronger verification.

### Change Order

Existing route:

```text
/co/[token]
```

Keep. Use the same upgrade posture as quote links.

### Portal Entry

New planned routes:

```text
/portal/[token]
/portal/verify
/portal/project/[accessId]
```

`/portal/[token]` validates a contractor-sent portal link and starts verification or resumes a valid session.

`/portal/verify` consumes a magic-link token, creates a customer portal session, and redirects to the project hub.

`/portal/project/[accessId]` is the main customer project hub. It requires a valid customer portal session and active customer portal access.

Do not build `/portal/projects` first. Add it later only after one identity can access multiple active projects.

## Customer Portal UX

The first portal should be one simple mobile-first project page, not a second app shell.

Suggested page structure:

- Header: contractor/company name, project address or nickname, portal status
- Primary card: current project status, next action, big CTA
- Schedule
- Quote/change orders
- Payments
- Documents/photos
- Requests/questions
- Activity
- Contact info

No left nav. No dense tables. No staff app chrome. No internal tabs. No role/workstation language. No task-management feel.

Use plain customer language:

- Your project
- Next step
- Schedule
- Documents
- Payments
- Messages / Requests
- Project history

The top card must always answer the next customer action.

Good empty states reduce anxiety:

- No payment is due right now.
- No documents are needed from you right now.
- No appointment has been scheduled yet.
- No action is needed from you right now.

## Customer-Safe Presenters

### Project Status

Create a presenter:

```ts
getCustomerProjectStatus(jobId)
```

Derived statuses:

- `REQUEST_RECEIVED`
- `QUOTE_IN_PROGRESS`
- `QUOTE_READY`
- `WAITING_FOR_APPROVAL`
- `APPROVED_NOT_SCHEDULED`
- `SCHEDULED`
- `WORK_IN_PROGRESS`
- `WAITING_ON_CUSTOMER`
- `INSPECTION_OR_REVIEW`
- `PAYMENT_DUE`
- `COMPLETE`
- `ON_HOLD`
- `CANCELED`

This status is derived from quote/job/task/schedule/payment/customer-request state. Do not manually store it unless a future canon update explicitly introduces a cached presentation layer.

### Next Action

Create a presenter:

```ts
getCustomerNextAction(jobId, accessId)
```

Possible next actions:

- `ACCEPT_QUOTE`
- `REVIEW_CHANGE_ORDER`
- `PAY_INVOICE`
- `CONFIRM_APPOINTMENT`
- `SUBMIT_AVAILABILITY`
- `UPLOAD_REQUESTED_DOCUMENT`
- `UPLOAD_REQUESTED_PHOTO`
- `ANSWER_CONTRACTOR_QUESTION`
- `NO_ACTION_NEEDED`

If the portal does not clearly show the next customer action, the feature is weak.

## Portal Cards

### Schedule

Show only customer-safe schedule information:

- Date
- Time window
- Visit type
- Arrival notes
- Status
- Assigned company/trade only if safe

Allow:

- Confirm appointment
- Request reschedule
- Submit availability
- Add access instructions

Do not allow:

- Direct schedule edit
- Internal crew capacity visibility
- Internal schedule conflicts
- Internal task dependency visibility

### Quote And Change Orders

Show:

- Quote status
- Accepted date
- Pending customer action
- Change order status
- Links to secure quote/change-order view

Keep `/q/[token]` and `/co/[token]` as commercial acceptance routes. The portal can link into them.

### Payments

Show:

- Amount due
- Due date if known
- Invoice status
- Payment status
- Payment link
- Receipt link

Do not build a full accounting system inside the portal. If Stripe or another provider exists, deep link to the payment flow.

### Documents And Photos

Show only `CustomerVisibleResource`.

Customer actions:

- View document
- Download document
- Upload requested document
- Upload photo
- Replace upload before review if allowed

Uploads should create:

- `CustomerRequest`
- `CustomerPortalEvent`
- Stored file resource
- Optional staff review item

Uploads must not automatically become approved internal job docs without staff review.

### Requests And Questions

Start structured, not full chat.

Customer choices:

- Ask a question
- Request reschedule
- Report issue
- Submit access note
- Billing question
- Scope/change question

Each creates `CustomerRequest`. Conversation threads can come later.

### Activity

Show customer-safe history:

- Quote sent
- Quote accepted
- Appointment scheduled
- Appointment confirmed
- Document uploaded
- Change order accepted
- Payment received
- Project completed

Do not show:

- Internal task failures
- Internal crew comments
- AI reasoning
- Cost notes
- Permit problems unless staff explicitly marks them customer-visible

## Contractor-Side Controls

Portal management belongs inside the Job or Customer surface, not main nav.

Panel sections:

- Portal status
- Customer contacts
- Access list
- Pending customer actions
- Visible resources
- Recent portal activity
- Send/revoke portal link
- Preview customer view

Staff actions:

- Enable portal for job
- Disable portal for job
- Invite customer contact
- Send portal link
- Revoke access
- Set access level
- Mark document/photo visible
- Request upload
- Request availability
- Request payment
- Preview customer portal
- View customer activity
- Resolve customer request
- Link customer request to task

Permissions:

| Role | Portal control |
|------|----------------|
| `OWNER` / `ADMIN` | Full portal controls |
| `OFFICE` | Invite/revoke customer access, manage visible resources, resolve customer requests |
| `FIELD` | **No** portal panel or coordination metadata on job page; execution-safe jobsite/customer context only (see [execution-aware-authorization-canon.md](./execution-aware-authorization-canon.md) §6) |
| `VIEWER` | Read-only internal coordination view where `read.commercial` applies |
| `SUBCONTRACTOR` | **No** portal management or coordination metadata |

## Notification Boundary

Do not construct customer portal notifications randomly in UI components.

Create a service boundary:

```ts
customerPortalNotificationService
```

Responsibilities:

- Create token
- Write portal event
- Send email/SMS
- Record delivery attempt
- Handle failure

Initial notifications:

- Portal invitation
- Quote link
- Change order link
- Payment request
- Appointment confirmation request
- Document/photo request

Email first. SMS later.

## Service Boundaries

Keep business rules out of React components.

Planned service modules:

| Service | Responsibilities |
|---------|------------------|
| Customer portal access service | Create/revoke/expire/list/check access; create and validate portal sessions |
| Customer portal token service | Create, hash, validate, consume, expire, and revoke magic-link tokens |
| Customer portal presenter | Build customer-safe project status, next action, schedule, quote, payment, documents, activity, and requests cards |
| Customer request service | Create/resolve/link/list requests and write events |
| Customer visible resource service | Mark visible, revoke visibility, list visible resources, authorize resource access |
| Customer portal event service | Append audit events, list customer-safe activity, list internal audit activity |

## Implementation Sequence

Build in this order:

1. Canon and schema design
2. Authorization and token foundation
3. Contractor-side access controls
4. Customer Project Portal shell
5. Quote/change-order event integration
6. Schedule visibility and customer requests
7. Documents, photos, and uploads
8. Payment visibility
9. Customer request review queue
10. Hardening and polish

Do not start with UI. Starting with UI creates fake progress and bad architecture.

Recommended implementation prompts:

1. Canon + schema only
2. Auth/token/session/access services only
3. Contractor-side portal management only
4. Customer portal shell + presenter only
5. Quote/change-order integration
6. Schedule/customer request flow
7. Document visibility/upload
8. Payment card and final hardening

## Security Risks

Biggest risks:

- Customer sees another customer's job
- Customer sees internal staff notes
- Expired token still works
- Revoked access still works because session remains active
- Portal payload leaks hidden data
- Document URL bypasses app authorization
- Customer action mutates internal truth directly
- Staff/customer auth boundaries get mixed

Required protections:

- Hash all tokens
- Expire all magic links
- Make magic links single-use
- Use a separate customer portal session cookie
- Enforce server-side authorization on every portal route/action
- Check resource-level visibility
- Send no raw internal object payloads to portal UI
- Append portal audit events
- Rate limit magic-link requests
- Revoke sessions when access is revoked

## Testing Expectations

Unit tests:

- Token hashing/validation
- Expired token failure
- Used token failure
- Revoked token failure
- Access-level checks
- Resource visibility checks
- Customer project status presenter
- Next action presenter
- Customer request creation
- Customer event writing

Integration tests:

- Invite customer contact
- Open portal link
- Verify magic link
- Create session
- View portal
- View quote
- Accept quote
- Request reschedule
- Upload document
- Revoke access
- Try portal again after revoke

Permission tests:

- `OWNER` can manage portal
- `ADMIN` can manage portal
- `OFFICE` can manage portal
- `FIELD` cannot manage portal access
- `VIEWER` cannot mutate portal access
- `SUBCONTRACTOR` cannot access portal controls
- Customer cannot access staff routes
- Staff session cannot accidentally become customer portal session

Security regression tests:

- Access job from different organization
- Access resource from different customer
- Access revoked visible document
- Reuse consumed token
- Use expired portal session
- Call server action without portal auth
- Call upload endpoint without access

## Rollout

The app is pre-launch, so implementation can be direct but still sequenced.

1. Merge schema and services behind no visible customer route.
2. Enable contractor-side portal access panel in dev/local.
3. Create test customer/job/quote/portal fixtures.
4. Enable portal routes in dev.
5. Run an end-to-end manual flow: create customer, create job, invite customer, open portal, verify, view quote, accept quote, request reschedule, upload doc, revoke access, confirm access fails.
6. Enable in production only after the manual flow passes.

## Explicit Anti-Patterns

Do not:

- Add `CUSTOMER` to `Membership`
- Reuse staff `User` as customer identity without a customer portal identity boundary
- Create portal auth checks inside random components
- Expose raw `Job`, `JobTask`, `Quote`, or `ChangeOrder` objects to portal UI
- Make documents visible by folder/path
- Let customers directly edit schedule/task/job truth
- Create chat before `CustomerRequest`
- Build a customer dashboard before the project hub
- Duplicate token logic separately for quote, change order, and portal
- Bypass audit events

## Done Definition

This feature is not done when a customer can authenticate.

It is done when:

- Customer identity is separate from staff identity
- Customer access is scoped and revocable
- Portal sessions are separate from staff sessions
- Customer can see a project hub
- Customer sees current status and next action
- Customer can view/accept quote and change order through secure flows
- Customer can see schedule safely
- Customer can confirm/request schedule changes
- Customer can view only explicitly visible documents/photos
- Customer can upload requested documents/photos
- Customer can submit structured requests
- Office can manage access
- Office can review customer requests
- All portal activity is audited
- Revoked access immediately blocks portal
- Tests cover permissions and token failure cases

## Senior Engineering Call

This is the right feature to design end-to-end now, but it must not become:

```text
customer login + dashboard + chat + docs + payments + schedule + account settings + notifications
```

The clean version is:

```text
Customer Project Portal:
A secure, scoped project hub where homeowners/property owners can see what matters, complete required actions, and submit structured requests without touching internal job truth.
```

---

*Created 2026-06-22 - Customer Project Portal canon established before schema/runtime implementation.*
