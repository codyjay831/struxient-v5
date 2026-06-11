# Business Profile and AI Context Canon

> **Status:** MVP canon pass, pre-launch.  
> **Scope:** Organization Business Profile, first-run setup, profile/settings boundaries, AI context hierarchy, provenance, profile-change behavior, and current intake starter disposition.  
> **Not in scope:** Prisma design, migrations, implementation sequencing, UI component design, generic questionnaire builders, automatic company learning, full profile versioning, or historical prompt reconstruction.

Struxient is pre-launch. There are no live customers or production data requiring backward compatibility with the current `/onboarding/trade` behavior. Future implementation may cleanly replace misleading onboarding behavior, but this canon does **not** authorize unreviewed schema changes.

---

## Product Verdict

**Strong / build-worthy.**

A small Business Profile is worth building because Struxient needs basic organization-level context to choose relevant defaults, language, suggestions, and AI context. It is only build-worthy if it stays small, structured, editable, and subordinate to current quote/job truth.

The rejected version is a long onboarding survey, a hidden workflow engine, or a broad "company description" prompt injected into every AI call.

---

## Definition

**Business Profile** is organization-level structured context describing what the company does and how it generally operates. It helps Struxient choose relevant defaults, terminology, suggestions, and AI context. It is not job truth, workflow logic, or permission to create execution work.

Business Profile is **not**:

- A workflow engine
- A stage system
- A service catalog
- A quote template
- An intake form
- A pricing system
- A scheduling engine
- A replacement for Scope Library
- A replacement for specialized settings
- An unrestricted AI prompt
- A source of mandatory job tasks
- A source of existing job truth

Business Profile answers describe the company in general. They may help the system ask better questions, filter templates, phrase suggestions, or select relevant context. They must never silently prove that work is required on a specific quote or job.

---

## MVP First-Run Setup

The first-run experience should take roughly one or two minutes. It should collect only the smallest set of organization identity fields with clear consumers.

### Company Name

Use the `Organization.name` already collected during signup. Do not ask for it again unless the user is correcting it.

### What Work Does Your Company Perform?

Multi-select. The company may select more than one.

Initial MVP options:

- Electrical
- Solar
- Roofing
- HVAC
- Plumbing
- General contracting
- Remodeling
- Other

Do not require one "primary trade" in MVP. A primary trade can be added later only if a specific product consumer needs precedence.

Trade means broad work domain. It does **not** mean a service item, scope item, urgency, request type, or workflow. For example, `Electrical` is a trade; `panel replacement` is a service/scope item; `emergency repair` is urgency/work type context.

### What Kind Of Work Do You Handle?

Multi-select.

Initial MVP options:

- Service and repair
- Replacement
- Installation
- Remodel
- New construction
- Maintenance
- Multi-step projects
- Other

Work type means the general shape of jobs the company handles. It is distinct from trade:

- `Electrical` is a trade.
- `Service and repair` is a work type.
- `Panel replacement` is a service or scope item and should not be stored as a Business Profile trade.

### Who Do You Primarily Work For?

Use multi-select rather than a single mixed option. The system can derive "mixed" when more than one market is selected.

Initial MVP options:

- Residential customers
- Commercial customers
- Property managers
- Builders or general contractors
- Other

This field describes customer markets. It is not customer truth for every lead, quote, or job.

### How Is Work Normally Performed?

Single select for MVP.

Initial MVP options:

- Owner-operator
- Employees
- Subcontractors
- Employees and subcontractors

This is the general operating model. It is not assignment truth for every job and must not override explicit assignees, crews, or subcontractor access rules.

### Approximate Team Size

Single select. This means approximate total operational team size: owners, office staff, field staff, and regular production contributors. It is not a seat count, billing count, or permission rule.

Initial MVP ranges:

- Just me
- 2-5
- 6-15
- 16-50
- 51+

### Optional Short Description

Deferred for first MVP unless implementation has an immediate, explicit consumer.

If added, it must be:

- Optional
- Short
- Plain language
- Lower priority than structured fields
- Excluded from default prompt injection
- Insufficient by itself to create tasks

Recommended prompt text if included later: "Tell Struxient anything important about the kind of work your company does."

---

## Required And Optional Setup

MVP setup rules:

- The owner who creates the organization sees minimal setup.
- Invited employees do not configure company identity during onboarding.
- Owner/Admin can edit Business Profile later in Settings.
- Missing optional information must not block use of Struxient.
- Onboarding must not become a long checklist.
- Do not design a complicated onboarding state machine for MVP.

Required before entering Struxient:

- Organization exists.
- Organization name exists.

Required before completing Business Profile:

- At least one trade or `Other`.
- At least one work type or `Other`.
- At least one customer market or `Other`.
- One operating model.
- One team-size range.

Skippability:

- Users may skip the profile step and enter Struxient.
- Skipping does **not** create an empty Business Profile row. No profile row already means the profile is unanswered.
- Skipping leaves profile fields unknown, not silently guessed.
- If an existing profile is later cleared by an authorized user, updating that row to empty arrays and null values is acceptable.
- Progress should survive leaving the page once the user has saved or autosaved answers.
- If autosave is implemented, it must save structured answers only; it must not install templates or mark unrelated setup complete.

---

## Progressive Completion

Detailed operational questions should appear only where they are relevant and have a clear consumer.

Examples:

| Question Area | Ask When | Source Of Truth |
|---|---|---|
| Payment practices | Payment setup or payment schedule generation setup | Payment settings / quote payment workflow |
| Crew and assignment practices | Scheduling or team setup | Scheduling/team settings |
| Customer communication preferences | Customer updates are enabled | Communication settings |
| Permit practices | Permit-related execution planning is used | Execution planning / Scope Library guidance |
| Intake preferences | Public intake is configured | Intake forms / public request settings |
| Quote defaults | Quoting setup | Quote settings / Scope Library |

Users should be able to answer now, skip, dismiss, and edit later. Do not build a generic questionnaire engine for MVP.

---

## Business Profile Versus Specialized Settings

Avoid duplicate sources of truth. Business Profile should hold stable company identity, not detailed operational configuration.

| Concept | Classification | Canonical Boundary |
|---|---|---|
| Organization name | Business Profile MVP | Existing organization identity; correction allowed |
| Timezone | Specialized settings | Scheduling/deadline display and derivation |
| Trades | Business Profile MVP | Broad work domains; multi-select |
| Work types | Business Profile MVP | General job shapes; multi-select |
| Customer markets | Business Profile MVP | General customer segments; multi-select |
| Team operating model | Business Profile MVP | General company model, not assignment truth |
| Approximate team size | Business Profile MVP | Operational team size range |
| Service area | Business Profile later | Useful for intake/site/customer fit, not MVP |
| License information | Business Profile later | Important identity/trust data, not execution truth |
| Services offered | Specialized settings | Service catalog/intake/scope library, not broad trade identity |
| Quote defaults | Specialized settings | Quote workflow and presentation defaults |
| Pricing | Specialized settings | Pricing/catalog/quote truth; not profile |
| Payment schedule rules | Specialized settings | Payment settings and quote payment workflow |
| Working hours | Specialized settings | Scheduling settings |
| Crew capacity | Specialized settings | Scheduling/team planning |
| Scheduling preferences | Specialized settings | Scheduling domain |
| Stage definitions | Scope Library | Stages are containers/presets, not profile |
| Reusable tasks | Scope Library | Reusable execution knowledge |
| Execution templates | Scope Library | Defaults copied into quote/job planning after user action |
| Public intake forms | Specialized settings | Intake form definitions |
| Public request settings | Specialized settings | Public copy/link/offerings |
| Customer communication rules | Specialized settings | Communication settings |
| Permissions | Specialized settings | AuthZ/RBAC, never profile |
| Notifications | Specialized settings | User/org notification preferences |
| AI instructions | Specialized settings | Explicit AI policy/rules; not freeform profile |
| Custom terminology | Business Profile later | May influence wording; must not create work |

---

## Information Categories

### Business Identity

Relatively stable organization facts:

- Trades
- Work types
- Customer markets
- Team operating model
- Team-size range

### Operational Defaults

Normal practices that may vary by job:

- Usually uses subcontractors
- Usually performs a site visit
- Usually collects a deposit
- Usually assigns one lead worker

Defaults are not requirements. They may suggest questions, warnings, template filters, or proposal hints. They must not independently create tasks or override current job facts.

### Explicit Company Rules

Deliberate instructions the company expects the system to follow unless higher-priority truth says otherwise:

- Office approval is required before a change order is sent.
- Customer access changes require confirmation.
- Specific work must not be scheduled before approval.

Rules remain subordinate to:

- Struxient system, safety, security, permission, and execution invariants
- Current structured job truth
- Current approved quote truth
- Explicit evidence that the rule does not apply to the current job

### Learned Recommendations

Patterns inferred from accepted, rejected, or corrected AI results are later scope. Do not build automatic company learning in MVP.

---

## Source-Of-Truth Hierarchy

When information conflicts, use this precedence:

1. Struxient system, security, permission, and execution invariants
2. Current structured job facts and evidence
3. Current approved quote and line-item scope
4. Explicit instruction for the current operation
5. Applicable organization rules
6. Applicable organization defaults
7. Relevant reusable templates
8. Historical or learned recommendations
9. General trade knowledge

Conflict rules:

- A lower source must not overwrite a higher source.
- User instructions can guide generation but cannot silently falsify structured facts.
- Company defaults may suggest questions or proposals.
- Company defaults must not independently prove that a task is required.
- Stages do not create tasks.
- Templates do not create current job truth.
- AI-generated summaries are not authoritative truth.
- Unknown, not applicable, and varies by job are distinct states.

---

## AI Context Contract

The full Business Profile must not be injected into every AI request. Each AI operation must declare an allowlist of relevant organization context.

Business Profile data is allowed into AI only when it helps the specific operation and remains lower priority than current quote/job truth.

Bare `Other` values are stored/display context only in MVP. Because custom companion text is deferred, `Other` by itself provides no useful AI context and must be omitted from rendered AI context until companion text exists.

| AI Operation | Relevant Profile Fields | Usually Irrelevant Profile Fields | Required Higher-Priority Truth | Defaults May Only Suggest Questions? | Human Review | Main Risk |
|---|---|---|---|---|---|---|
| Quote scope suggestions | Trades, work types, customer markets, relevant terminology | Team size, payment rules, crew practices | Lead/request text, quote notes, explicit user instruction | Yes | Required before quote lines persist | Turning general company work into sold scope |
| Quote-line execution planning | Trades, work types, team operating model, explicit company execution rules | Team size except coarse complexity hints, customer markets unless relevant | Quote line scope, site facts, current job/quote facts, user instruction | Yes | Required before tasks persist | Creating tasks because the company usually does something |
| Scope Library execution planning | Trades, work types, team operating model, explicit company execution rules | Current customer market unless template-specific, team size except coarse complexity hints | Template description/tags and user instruction | Yes | Required before template defaults persist | Bad defaults copied into future quote planning |
| Clarification question generation | Trades, work types, customer markets, terminology | Team size, payment rules, scheduling practices | Line/template scope and missing context | Yes | Required before reusable question sets persist | Asking irrelevant trade questions |
| Clarification answer proposals | Trades/work types only when needed to interpret options | Team size, operating model, payment defaults | Existing question set, quote line text, user-entered notes | Yes | Required before answers persist | Guessing unknown job facts |
| Quote-wide execution review | Trades, work types, explicit company execution rules | Team size unless assignment capacity is in scope | All quote lines, draft tasks, current instructions | Yes | Required before changes persist | Treating profile defaults as quote-wide required work |
| Smart tags | Trades, work types, terminology | Team size, customer markets, payment/scheduling defaults | Current title/description/context | Yes | User chooses tags | Polluting vocabulary with broad or misleading tags |
| Recovery planning | Trades, work types, operating model, explicit safety/recovery rules | Customer markets, team size except capacity hints | Current issue, blocked task, job stage/task state | Yes | Required before recovery tasks persist | Creating recovery work not justified by the issue |
| Payment schedule generation | Explicit payment rules/defaults when such settings exist, relevant work type/project type | Trades unless payment-relevant, team size, crew practices | Quote value, payment state, approved quote structure, user instruction | Yes | Required before payment schedule persists | Applying a normal deposit to a job where it does not apply |
| Site research | Requested research scope; trade only if it narrows the kind of site fact requested | Team size, payment defaults, operating model, customer markets | Address, service location facts, official sources | No; profile should not bias facts | Research writes need provenance and review affordances | Biasing factual property research from company assumptions |
| Future customer communication | Customer markets, terminology, explicit communication rules | Team size, most operational defaults | Current customer/job/quote facts and explicit send intent | Yes | Required before sending | Saying something unsupported by job truth |
| Future scheduling recommendations | Work types, operating model, explicit scheduling rules | Trades unless schedule-relevant, broad description | Current tasks, constraints, events, availability, user instruction | Yes | Required before schedule commitments persist | Turning defaults into calendar commitments |

Company-level context should be minimal, labeled, and operation-specific. If an AI operation cannot name the profile field it consumes and why, it should not receive Business Profile context.

---

## Provenance Labels

Future context assembly should preserve provenance distinctions. Exact enum names may change, but these categories are canonical:

- `JOB_CONFIRMED`
- `QUOTE_CONFIRMED`
- `USER_INSTRUCTION`
- `ORGANIZATION_RULE`
- `ORGANIZATION_DEFAULT`
- `REUSABLE_TEMPLATE`
- `AI_FOUND`
- `AI_DERIVED`
- `UNKNOWN`
- `NOT_APPLICABLE`
- `VARIES_BY_JOB`

The system must not present:

- AI-found information as customer-confirmed
- Company defaults as job-confirmed
- Reusable templates as required work
- AI summaries as structured facts

---

## Profile Change Behavior

Business Profile changes affect future defaults, suggestions, and AI generations. They do not silently modify existing quotes, execution plans, tasks, schedules, payments, or jobs.

Because Struxient has no live users, do not design:

- Legacy profile migration
- Dual-read support
- Profile-version compatibility
- Historical prompt recreation
- Existing-customer transition logic

Also do not silently regenerate existing work when the profile changes. Regeneration, where supported, must be explicit.

---

## Permissions

MVP boundary:

| Role | Business Profile Access |
|---|---|
| Owner | View and edit |
| Admin | View and edit |
| Office | View; editing deferred unless explicitly granted later |
| Field | No editing |
| Viewer | Read-only or no access; product decision may choose stricter no-access |
| Subcontractor | No access |

Company context that influences AI must not be editable by every organization member. Do not design the entire permission platform in this pass.

---

## Audit Requirements

MVP should include:

- `createdAt`
- `updatedAt`
- `updatedByUserId`
- Organization scoping
- Clear provenance when profile data enters AI context

Deferred:

- Field-by-field history
- Change reasons
- Profile version records
- Full prompt snapshots
- Historical prompt reproduction
- AI-suggested profile approval workflows

Major profile updates may eventually be recorded in a generic organization activity/audit stream, but first implementation should not depend on a broad audit platform unless it is trivially available.

---

## Current Intake Starters

The existing plumbing, roofing, electrical, and HVAC starter definitions are:

- Intake-form starters
- Optional
- Reusable
- Not organization identity
- Not Business Profile
- Not execution templates
- Not quote templates
- Not stages
- Not automatically installed

Expected future location:

```text
Settings -> Intake Forms -> Create from starter
```

They may optionally be suggested after onboarding based on selected trades, but applying one must require a clear user action. No starter intake form should be installed silently during Business Profile onboarding.

---

## Clean-Break Rule

Because there are no live customers or production data:

- Future implementation may replace `/onboarding/trade` directly.
- No legacy compatibility layer is required.
- No migration of past trade selections is required because no actual trade selection exists.
- Existing demo or development organizations may be reset.
- Misleading route names, copy, and behavior may be removed cleanly.
- Existing starter templates should be retained only where they still provide real product value.

This clean-break rule does not authorize unreviewed schema changes.

---

## MVP Scope

MVP includes:

- One Business Profile per organization
- Multi-select trades
- Multi-select work types
- Multi-select customer markets
- Team operating model
- Approximate operational team size
- Optional description only if justified by an immediate consumer
- Minimal first-run onboarding
- Editable Business Profile settings page
- Owner/Admin editing
- Clear context hierarchy
- Per-AI-operation context allowlists
- Existing intake starters moved conceptually to intake settings
- Profile changes affect future generations only

---

## Deferred Scope

Explicitly deferred:

- Multiple profiles per organization
- Business units
- Location-specific profiles
- Generic questionnaire builder
- Custom company schemas
- Automatic learning from all user behavior
- AI-created company rules
- Complex rule inheritance
- Full profile versioning
- Historical prompt reconstruction
- Cross-company benchmarking
- Industry marketplace taxonomy
- Company-specific model training
- Automatic modification of existing jobs
- Deep permissions configuration for individual profile fields

---

## Field-Consumer Matrix

| MVP Field | Product Consumer | AI Consumer | Why It Exists | May Influence Execution? |
|---|---|---|---|---|
| Organization name | Org identity, public/customer display, settings | Prompt display context where useful | Existing company identity | Wording only; not task creation |
| Trades | Onboarding, starter suggestions, template filtering, terminology | Scope suggestions, execution planning, clarification generation, tags | Helps choose relevant contractor context without forcing one primary trade | Only as low-priority context; never proves required work |
| Work types | Starter suggestions, quote/intake relevance, template filtering | Scope suggestions, execution planning, payment/scheduling future context | Distinguishes service, replacement, install, projects, etc. | Only as low-priority context; never proves required work |
| Customer markets | Intake/quote language, customer-facing defaults later | Scope suggestions and communication wording where relevant | Helps language and assumptions fit residential/commercial/property-manager work | No direct execution authority |
| Team operating model | Future assignment/scheduling defaults, profile display | Execution/recovery planning as a coarse hint | Helps distinguish owner-operator, employee, and subcontract-heavy companies | May suggest questions; never overrides assignments |
| Approximate team size | Future onboarding/settings guidance, capacity-sensitive UX later | Usually excluded; coarse scheduling hints later | Helps keep defaults proportional to company size | No direct execution authority |

---

## Product Decisions Still Open

Only these need owner input before implementation planning:

- Whether Office users can edit Business Profile in MVP, or view only.
- Whether the optional short description ships in MVP or waits for a proven consumer.
- Whether Viewer sees Business Profile read-only or has no access.

---

*Canon update (2026-06-11): Added MVP Business Profile definition, first-run setup, settings boundaries, AI context allowlists, source hierarchy, provenance distinctions, profile-change behavior, permission/audit boundary, clean-break rule, and intake starter disposition.*
