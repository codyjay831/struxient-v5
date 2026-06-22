# Customer Project Portal implementation plan

> **Purpose:** Executable engineering plan for Struxient Customer Project Portal.
> **Canon:** [customer-project-portal-canon.md](../canon/customer-project-portal-canon.md).
> **Posture:** Build access/security truth first, then contractor controls, then customer UI.

---

## 1. Locked Architecture Contract

### Canon Naming

Use:

- Customer Project Portal
- Customer Portal Access
- Customer Portal Identity
- Customer Portal Events
- Customer-visible resources

Do not call this product area **Customer Login** in product copy, route names, schema names, service names, or implementation notes yet. Authentication is only the access mechanism for a controlled project hub.

### Product Job

The customer side must answer:

1. What is happening?
2. What do I need to do?
3. When is someone coming?
4. What did I approve?
5. What do I owe?
6. What documents/photos are needed from me?

If a slice does not improve one of these questions, it is not first-wave portal work.

### Hard Rules

1. Customers are not staff. Do not add `Membership(role: CUSTOMER)`.
2. Customer actions create acceptance records, requests, uploads, or events. They do not directly mutate internal job/task/schedule truth.
3. The portal is a read/action layer. It is not job source of truth.
4. Visibility is explicit. No internal resource becomes customer-visible merely because it exists.
5. Existing `/request/[companySlug]`, `/q/[token]`, and `/co/[token]` stay in place and migrate into the broader access/event model additively.

### Stored Vs Derived Contract

| Concept | Stored Truth | Derived Truth | Must Not Duplicate |
|---------|--------------|---------------|--------------------|
| Customer contact role | `CustomerContact` | display labels, primary/billing/decision badges | portal auth identity |
| Customer portal identity | `CustomerPortalIdentity` | verification display, last-seen display | staff `User` |
| Customer access | `CustomerPortalAccess` | allowed action labels | `Membership` roles |
| Customer session | `CustomerPortalSession` token hash and lifecycle facts | session validity | staff auth session |
| Magic link | `CustomerPortalMagicLinkToken` token hash and lifecycle facts | token validity | quote/CO-specific one-off token logic |
| Portal audit | `CustomerPortalEvent` | customer-safe activity feed | mutable job activity feed |
| Visible resource | `CustomerVisibleResource` | card grouping, labels, activity | attachment folder/path visibility |
| Customer request | `CustomerRequest` | workstation/customer-action attention | chat messages or direct job mutations |
| Project status | quote/job/task/schedule/payment/request facts | `getCustomerProjectStatus()` | stored customer status column |
| Next action | quote/CO/payment/schedule/request/visibility facts | `getCustomerNextAction()` | per-card independent CTA logic |

---

## 2. Scope For First Complete Version

First complete version includes:

- Customer portal identity/access model
- Magic-link or token-based portal session
- One project portal page
- Customer-safe project status
- Next required customer action
- Quote and change order access
- Schedule visibility
- Appointment confirmation/reschedule request
- Payment visibility/link
- Customer-visible documents/photos
- Customer uploads
- Customer requests/questions
- Portal activity audit
- Contractor-side access controls
- Contractor-side customer view preview

Non-goals for the first complete version:

- No customer account settings area.
- No multi-project dashboard before one project hub works.
- No full chat system before structured `CustomerRequest`.
- No customer direct schedule editor.
- No customer direct task/job/scope editor.
- No internal document folder visibility shortcut.

---

## 3. Planned Data Model

> **Schema approval required before implementation.** This plan defines the schema target, but `apps/web/prisma/schema.prisma` must not be changed without explicit approval for the schema phase.

### New Models

Add:

- `CustomerContact`
- `CustomerPortalIdentity`
- `CustomerPortalAccess`
- `CustomerPortalSession`
- `CustomerPortalMagicLinkToken`
- `CustomerPortalEvent`
- `CustomerVisibleResource`
- `CustomerRequest`

Do not modify `Membership` for customers.

### CustomerContact

Purpose: person attached to a customer/property, not auth.

Fields:

- `id`
- `organizationId`
- `customerId`
- `name`
- `email`
- `phone`
- `relationshipToProperty`
- `isPrimary`
- `isBillingContact`
- `isDecisionMaker`
- `createdAt`
- `updatedAt`
- `archivedAt`

Indexes:

- `organizationId`
- `customerId`
- `organizationId, email`
- `organizationId, phone`

### CustomerPortalIdentity

Purpose: verified external portal identity.

Fields:

- `id`
- `emailNormalized`
- `phoneNormalized`
- `emailVerifiedAt`
- `phoneVerifiedAt`
- `createdAt`
- `updatedAt`
- `lastSeenAt`
- `disabledAt`

Indexes/constraints:

- unique nullable `emailNormalized` if supported cleanly by the chosen database
- unique nullable `phoneNormalized` if supported cleanly by the chosen database
- index `disabledAt`

Implementation caution: if nullable unique semantics are awkward in Prisma/database, use app-level constraints plus filtered/partial indexes where supported. Do not fake uniqueness with empty strings.

### CustomerPortalAccess

Purpose: main customer permission record.

Fields:

- `id`
- `organizationId`
- `customerId`
- `jobId`
- `customerContactId`
- `portalIdentityId`
- `accessLevel`
- `status`
- `invitedByMembershipId`
- `revokedByMembershipId`
- `expiresAt`
- `createdAt`
- `updatedAt`
- `revokedAt`
- `lastUsedAt`

Enums:

- `CustomerPortalAccessLevel`: `VIEW_ONLY`, `PROJECT_PARTICIPANT`, `BILLING_CONTACT`, `DECISION_MAKER`, `PROPERTY_MANAGER`
- `CustomerPortalAccessStatus`: `ACTIVE`, `PENDING_VERIFICATION`, `REVOKED`, `EXPIRED`, `DISABLED`

Indexes:

- `organizationId, customerId`
- `organizationId, jobId`
- `customerContactId`
- `portalIdentityId`
- `status`
- `expiresAt`

Rules:

- Access is scoped to organization + customer + job.
- Revoked/expired/disabled access fails every portal request.
- Revoking access revokes active sessions for that access.

### CustomerPortalSession

Purpose: customer browser session separate from staff auth.

Fields:

- `id`
- `portalIdentityId`
- `customerPortalAccessId`
- `sessionTokenHash`
- `createdAt`
- `expiresAt`
- `revokedAt`
- `lastSeenAt`
- `ipAddress`
- `userAgent`

Cookie:

```text
struxient_customer_portal_session
```

Rules:

- Hash session token at rest.
- Use secure, httpOnly, sameSite cookie settings.
- Session validation must load and validate access, not trust cookie payloads.

### CustomerPortalMagicLinkToken

Purpose: email/SMS verification and single-purpose portal links.

Fields:

- `id`
- `portalIdentityId`
- `customerPortalAccessId`
- `tokenHash`
- `purpose`
- `createdAt`
- `expiresAt`
- `usedAt`
- `revokedAt`
- `ipAddress`
- `userAgent`

Enum:

- `CustomerPortalMagicLinkPurpose`: `PORTAL_SIGN_IN`, `QUOTE_VIEW`, `CHANGE_ORDER_VIEW`, `PAYMENT_VIEW`, `DOCUMENT_UPLOAD`

Rules:

- Hash token at rest.
- Magic links are expiring and single-use.
- Consuming a token happens inside a transaction.
- Reusing a consumed token fails.

### CustomerPortalEvent

Purpose: append-only audit stream.

Fields:

- `id`
- `organizationId`
- `customerId`
- `jobId`
- `customerPortalAccessId`
- `portalIdentityId`
- `eventType`
- `resourceType`
- `resourceId`
- `metadataJson`
- `ipAddress`
- `userAgent`
- `createdAt`

Event enum:

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

Note: fix spelling to `CONTRACTOR_RESPONSE_VIEWED` in implementation.

### CustomerVisibleResource

Purpose: explicit customer visibility grant.

Fields:

- `id`
- `organizationId`
- `customerId`
- `jobId`
- `resourceType`
- `resourceId`
- `visibility`
- `visibleToAccessLevel`
- `title`
- `description`
- `createdByMembershipId`
- `createdAt`
- `updatedAt`
- `revokedAt`

Enums:

- `CustomerVisibleResourceType`: `QUOTE`, `CHANGE_ORDER`, `INVOICE`, `PAYMENT_LINK`, `DOCUMENT`, `PHOTO`, `SCHEDULE_EVENT`, `PROJECT_UPDATE`, `CUSTOMER_REQUEST`, `CUSTOMER_UPLOAD`
- `CustomerVisibleResourceVisibility`: `CUSTOMER_VISIBLE`, `CUSTOMER_ACTION_REQUIRED`, `CUSTOMER_UPLOADED`, `REVOKED`

Rules:

- Do not add `INTERNAL_ONLY`. Internal-only means no row.
- File access must check this table, not storage path or attachment ownership alone.
- Revoked visibility must disappear immediately from portal presenters.

### CustomerRequest

Purpose: structured customer-submitted request and review queue item.

Fields:

- `id`
- `organizationId`
- `customerId`
- `jobId`
- `customerPortalAccessId`
- `type`
- `status`
- `title`
- `message`
- `metadataJson`
- `createdAt`
- `updatedAt`
- `resolvedAt`
- `resolvedByMembershipId`
- `linkedTaskId`
- `linkedScheduleEventId`
- `linkedDocumentId`

Enums:

- `CustomerRequestType`: `ASK_QUESTION`, `REQUEST_RESCHEDULE`, `SUBMIT_AVAILABILITY`, `UPLOAD_DOCUMENT`, `UPLOAD_PHOTO`, `ADD_ACCESS_NOTE`, `REPORT_ISSUE`, `REQUEST_SCOPE_CHANGE`, `BILLING_QUESTION`
- `CustomerRequestStatus`: `OPEN`, `NEEDS_REVIEW`, `ACCEPTED`, `DECLINED`, `RESOLVED`, `CLOSED`

Rules:

- Customer request creation writes `CustomerPortalEvent`.
- Staff resolution records resolving membership and timestamp.
- Optional links connect request to internal task/schedule/document only after staff review.

---

## 4. Service Boundaries

Create dedicated modules under `apps/web/src/lib/customer-portal/` unless an existing folder convention suggests a better local path during implementation.

| Service | Planned file | Responsibilities |
|---------|--------------|------------------|
| Access service | `access-service.ts` | create/revoke/expire/list/check access, revoke sessions for access |
| Session service | `session-service.ts` | create session, hash session token, set/clear cookie helpers, validate session |
| Token service | `token-service.ts` | create/hash/validate/consume/revoke magic links |
| Authorization guard | `authorize.ts` | `requireCustomerPortalAccess()` and resource/action authorization |
| Event service | `event-service.ts` | append audit events and list internal/customer-safe activity |
| Presenter | `presenter.ts` | `getCustomerProjectStatus()`, `getCustomerNextAction()`, and portal card DTOs |
| Request service | `request-service.ts` | create/resolve/link/list customer requests |
| Visible resource service | `visible-resource-service.ts` | mark visible, revoke visibility, list and authorize resources |
| Notification service | `notification-service.ts` | create token, write event, send email/SMS, record delivery attempts |

Do not put portal business rules in React components or route files.

---

## 5. Authorization Boundary

Create:

```ts
requireCustomerPortalAccess()
```

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
- Job matches when job-scoped
- Resource is customer-visible when loading a resource
- Access level allows the action

Every portal loader/action must use this boundary or a narrower helper built from it.

Staff and customer auth remain separate:

| Staff | Customer Portal |
|-------|-----------------|
| `User` | `CustomerPortalIdentity` |
| `Membership` | `CustomerPortalAccess` |
| `StaffRole` | access level |
| staff session cookie | `struxient_customer_portal_session` |
| staff auth guards | customer portal auth guards |

---

## 6. Route Plan

Keep:

- `/request/[companySlug]`
- `/q/[token]`
- `/co/[token]`

Add:

- `/portal/[token]`
- `/portal/verify`
- `/portal/project/[accessId]`

Defer:

- `/portal/projects`

### Route Responsibilities

| Route | Responsibility | Guard |
|-------|----------------|-------|
| `/request/[companySlug]` | Public intake | public |
| `/q/[token]` | Secure quote view/accept/request changes | quote token, later portal event integration |
| `/co/[token]` | Secure change order view/accept | change order token, later portal event integration |
| `/portal/[token]` | Portal entry from contractor-sent link | magic-link token validation |
| `/portal/verify` | Consume verification token, create session | token validation + session creation |
| `/portal/project/[accessId]` | Main project hub | `requireCustomerPortalAccess()` |

Portal routes must not use staff app chrome.

---

## 7. Customer Portal UX Contract

The first customer portal page is a mobile-first project hub.

Structure:

- Header: contractor/company name, project address or nickname, portal status
- Primary card: current project status, next action, big CTA
- Schedule
- Quote/change orders
- Payments
- Documents/photos
- Requests/questions
- Activity
- Contact info

Do not use:

- left nav
- dense tables
- staff shell chrome
- internal tabs
- role/workstation language
- task-management language
- pipeline language

Use customer language:

- Your project
- Next step
- Schedule
- Documents
- Payments
- Messages / Requests
- Project history

Empty states:

- No payment is due right now.
- No documents are needed from you right now.
- No appointment has been scheduled yet.
- No action is needed from you right now.

---

## 8. Phase Plan

### Phase 1: Canon And Schema

Deliverables:

- Canon references verified
- Prisma schema additions
- Enums
- Relations and indexes
- Source-of-truth rules confirmed
- Migration reviewed

Acceptance criteria:

- `CustomerContact`, `CustomerPortalIdentity`, `CustomerPortalAccess`, `CustomerPortalSession`, `CustomerPortalMagicLinkToken`, `CustomerPortalEvent`, `CustomerVisibleResource`, and `CustomerRequest` exist.
- No `CUSTOMER` staff role exists.
- `Membership` is not modified to represent customers.
- Migration applies cleanly locally.
- Existing `/request`, `/q`, and `/co` behavior remains unchanged.

Verification:

- Prisma generate/migrate check
- Targeted schema tests if existing test patterns support it
- `npm run guardrails`

### Phase 2: Authorization And Token Foundation

Deliverables:

- Token hashing service
- Magic-link creation/validation/consume
- Portal session creation
- Portal session cookie helpers
- `requireCustomerPortalAccess()`
- Portal event writer

Acceptance criteria:

- Expired token fails.
- Revoked token fails.
- Used token cannot be reused.
- Revoked access blocks active session.
- Wrong job/customer/org fails.
- Portal route cannot load without access.
- Portal auth failures are logged safely without leaking sensitive detail.

Verification:

- Unit tests for token/session/access failure cases
- Permission tests for cross-org/cross-customer denial

### Phase 3: Contractor-Side Access Controls

Deliverables:

- Job/customer portal management panel
- Portal status
- Contact list
- Access list
- Invite/send link
- Revoke access
- Access level management
- Recent portal activity
- Customer view preview entry point

Acceptance criteria:

- `OWNER`, `ADMIN`, and `OFFICE` can manage access.
- `FIELD` cannot manage portal access.
- `VIEWER` cannot mutate portal access.
- `SUBCONTRACTOR` cannot access portal controls.
- Revoked customer cannot reopen portal.
- Staff can see last viewed/last used timestamp.
- Staff preview uses customer-safe DTOs, not raw internal objects.

### Phase 4: Customer Project Portal Shell

Deliverables:

- `/portal/[token]`
- `/portal/verify`
- `/portal/project/[accessId]`
- Mobile-first hub layout
- Empty-state cards
- Customer-safe DTO loader

Acceptance criteria:

- Portal has no staff app chrome.
- Portal has no left nav.
- Portal exposes no internal stage names.
- Portal exposes no internal task notes.
- Server payload contains only customer-safe fields.
- Primary card always has status and next action.

### Phase 5: Quote And Change Order Integration

Deliverables:

- `CustomerPortalEvent` on quote view
- `CustomerPortalEvent` on quote accept
- `CustomerPortalEvent` on quote change request
- `CustomerPortalEvent` on change order view
- `CustomerPortalEvent` on change order accept
- Portal cards link to existing `/q/[token]` and `/co/[token]`
- Accepted quote/change order appears in portal activity

Acceptance criteria:

- Existing quote links still work.
- Existing change order links still work.
- Existing acceptance/checkpoint behavior is unchanged.
- Portal events are additive and do not replace commercial audit.
- Expired/revoked quote and change order tokens still fail.

### Phase 6: Schedule Visibility And Customer Requests

Deliverables:

- Schedule card
- Appointment confirmation action
- Reschedule request action
- Availability submission action
- Access note submission action
- `CustomerRequest` creation
- Staff resolution flow

Acceptance criteria:

- Customer can view confirmed appointment safely.
- Customer confirmation writes event.
- Reschedule request creates `CustomerRequest`.
- Availability creates `CustomerRequest`.
- Access note creates `CustomerRequest` or pending site note review item.
- Customer cannot directly edit schedule.
- Office can resolve request.

### Phase 7: Documents, Photos, And Uploads

Deliverables:

- Visibility controls for documents/photos
- Visible resource list
- Customer document/photo view/download authorization
- Requested upload flow
- Customer upload review item/request
- Visibility revoke flow

Acceptance criteria:

- Internal-only docs never appear.
- Revoked visible resource disappears immediately.
- File access checks `CustomerVisibleResource`.
- Upload creates `CustomerPortalEvent`.
- Upload creates `CustomerRequest` or staff review item.
- Upload does not become approved internal job doc automatically.

High-risk phase. Do not shortcut authorization or file URL checks.

### Phase 8: Payment Visibility

Deliverables:

- Payment card
- Amount due
- Payment status
- Payment link event
- Receipt link if available

Acceptance criteria:

- Customer only sees their job/customer invoice/payment link.
- Payment link access writes event.
- Payment status is read-only from billing/payment source.
- Customer cannot see another customer invoice.
- Internal accounting notes are not exposed.

### Phase 9: Customer Request Review Queue

Deliverables:

- Pending customer requests surfaced inside Job surface and/or Workstation attention
- Resolve/decline/accept actions
- Optional link to task
- Optional link to schedule event
- Optional follow-up task creation

Acceptance criteria:

- Office can resolve customer requests.
- Office can link request to task.
- Office can link request to schedule event.
- Office can create follow-up task.
- Resolved request remains in history.
- Workstation stays cockpit/attention, not a portal inbox app.

### Phase 10: Hardening And Polish

Deliverables:

- Rate limits
- Token abuse protection
- Audit views
- Email delivery failure handling
- Session revocation hardening
- Safe error pages
- Portal preview mode
- Mobile QA
- Accessibility pass

Acceptance criteria:

- All sensitive portal failures fail closed.
- Error pages do not reveal token/resource validity details.
- Revoked access invalidates active sessions.
- Portal works on mobile.
- Keyboard and screen reader basics pass.

---

## 9. Security Test Matrix

Unit tests:

- token hashing/validation
- expired token failure
- used token failure
- revoked token failure
- access-level checks
- resource visibility checks
- customer project status presenter
- next action presenter
- customer request creation
- customer event writing

Integration tests:

- invite customer contact
- open portal link
- verify magic link
- create session
- view portal
- view quote
- accept quote
- request reschedule
- upload document
- revoke access
- try portal again after revoke

Permission tests:

- `OWNER` can manage portal
- `ADMIN` can manage portal
- `OFFICE` can manage portal
- `FIELD` cannot manage portal access
- `VIEWER` cannot mutate portal access
- `SUBCONTRACTOR` cannot access portal controls
- customer cannot access staff routes
- staff session cannot become customer portal session

Security regression tests:

- access job from different org
- access resource from different customer
- access revoked visible document
- reuse consumed token
- use expired portal session
- call server action without portal auth
- call upload endpoint without access

---

## 10. Rollout Plan

1. Merge schema and services behind no visible customer route.
2. Enable contractor-side portal access panel in dev/local.
3. Create test customer/job/quote/portal fixtures.
4. Enable portal routes in dev.
5. Run manual end-to-end flow:
   - create customer
   - create job
   - invite customer
   - open portal
   - verify
   - view quote
   - accept quote
   - request reschedule
   - upload doc
   - revoke access
   - confirm access fails
6. Enable in production only after manual flow and security tests pass.

---

## 11. Cursor Build Order

Use this order:

1. Prisma schema additions
2. Portal enums/types
3. Token hashing service
4. Portal access service
5. Portal session service
6. Portal authorization guard
7. Portal event service
8. Contractor portal management panel
9. Portal route shell
10. Portal presenter
11. Project hub UI
12. Quote/change-order event integration
13. Schedule card + customer requests
14. Document visibility + upload flow
15. Payment card
16. Workstation/job pending customer request surfacing
17. Permission/security tests
18. E2E/manual test flow

Do not let implementation start with UI. That creates fake progress and weak architecture.

---

## 12. Explicit Anti-Patterns

Do not:

- Add `CUSTOMER` to `Membership`
- Reuse staff `User` as customer identity
- Create portal auth checks inside random components
- Expose raw `Job`, `JobTask`, `Quote`, or `ChangeOrder` objects to portal UI
- Make documents visible by folder/path
- Let customers directly edit schedule/task/job truth
- Create chat before `CustomerRequest`
- Build a customer dashboard before the project hub
- Duplicate token logic separately for quote, change order, and portal
- Bypass audit events

---

## 13. Done Definition

This feature is not done when a customer can authenticate.

It is done when:

- Customer identity is separate from staff identity.
- Customer access is scoped and revocable.
- Portal sessions are separate from staff sessions.
- Customer can see a project hub.
- Customer sees current status and next action.
- Customer can view/accept quote/change order through secure flow.
- Customer can see schedule safely.
- Customer can confirm/request schedule changes.
- Customer can view only explicitly visible documents/photos.
- Customer can upload requested documents/photos.
- Customer can submit structured requests.
- Office can manage access.
- Office can review customer requests.
- All portal activity is audited.
- Revoked access immediately blocks portal.
- Tests cover permissions and token failure cases.

---

## 14. Senior Engineering Call

This is worth designing end-to-end now, but it must stay narrow:

```text
Customer Project Portal:
A secure, scoped project hub where homeowners/property owners can see what matters,
complete required actions, and submit structured requests without touching internal job truth.
```

It must not become:

```text
customer login + dashboard + chat + docs + payments + schedule + account settings + notifications
```

Build the project hub. Keep the contractor operations system internal.

---

*Created 2026-06-22 - implementation plan derived from Customer Project Portal canon.*
