# Scope Clarification — durable schema proposal (PARTIALLY SUPERSEDED)

> **Status (2026-06-25):** Core models **shipped** (`ClarificationQuestionSet`, `ClarificationQuestion`, `QuoteLineClarification`, `QuoteScopeDecision`). **Behavioral canon** lives in [quote-clarification-canon.md](../canon/quote-clarification-canon.md). **Implementation plan:** [quote-clarification-cleanup-phase0-1.md](../plans/quote-clarification-cleanup-phase0-1.md).
>
> This document remains useful for **historical schema intent** and any **not-yet-shipped** answer-row normalization (`QuoteLineClarificationAnswer` per-question rows). Do not treat the “NOT YET APPROVED / no schema change” banner below as current for shipped models.

---

# Scope Clarification — durable schema proposal (original draft)

> **Original status:** Proposal only (pre-migration).
> Per [`.cursor/rules/no-schema-without-approval.mdc`](../../.cursor/rules/no-schema-without-approval.mdc),
> schema changes require explicit approval + `ALLOW_SCHEMA=1`.

## Why this exists

Scope Clarification shipped first as an **interim, no-schema** slice:

- Library question sets are **seed data in code** (`apps/web/src/lib/clarification/clarification-library.ts`).
- Answers are **ephemeral** in the panel and, on apply, rendered into existing
  line scope fields (`QuoteLineItem.customerIncludedNotes`, `internalNotes`) via
  `apps/web/src/app/(workspace)/quotes/quote-line-clarification-actions.ts`.

That is enough to capture cleaner scope and improve the proposal, but it is
**not durable structured truth**. The interim approach cannot reliably power:

- automatic parts / material lists,
- execution realignment from facts,
- analytics across jobs ("how many 200A underground upgrades?"),
- org-specific, admin-managed question libraries with governance.

For those, answers must become **structured rows**, and the library must move
from code seed to **org-scoped, versioned, governed records**.

## What stays the same

- The pure helpers in `src/lib/clarification/` (types, validation, rendering,
  matching, dedupe) are **already schema-agnostic** and would be reused as-is.
- The UI panel and apply/suggest actions change only their data source
  (DB instead of seed + ephemeral state).
- Rendering answers into scope text **remains** (customer-facing wording still
  flows to the proposal); the structured rows are added **alongside**, not
  instead.

## Proposed models (for review)

Canonical keys are stable; labels/aliases are editable. All rows are
org-scoped. Statuses model governance (`draft` / `active` / `archived` /
`merged`).

```prisma
/// Reusable, versioned clarification question set (org library).
model ClarificationQuestionSet {
  id             String   @id @default(cuid())
  organizationId String
  /// Stable canonical key, e.g. "electrical.service_upgrade".
  key            String
  version        Int      @default(1)
  label          String
  description    String?
  status         ClarificationSetStatus @default(DRAFT)
  /// Synonyms used for matching + dedupe (mirrors Tag.aliases pattern).
  aliases        String[] @default([])
  /// When MERGED, points at the surviving set's key.
  mergedIntoKey  String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization               @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  questions    ClarificationQuestion[]
  bindings     ClarificationBinding[]
  answers      QuoteLineClarificationAnswer[]

  @@unique([organizationId, key, version])
  @@index([organizationId, status])
}

enum ClarificationSetStatus {
  DRAFT
  ACTIVE
  ARCHIVED
  MERGED
}

/// A question inside a set. Options live in JSON to avoid a third table early.
model ClarificationQuestion {
  id            String   @id @default(cuid())
  questionSetId String
  /// Stable canonical key, e.g. "electrical.service.new_service_size".
  key           String
  label         String
  inputType     ClarificationInputType
  helpText      String?
  /// [{ key, label, aliases? }] — controlled options for choice questions.
  optionsJson   Json     @default("[]")
  aliases       String[] @default([])
  allowOther    Boolean  @default(false)
  unit          String?
  customerFacing Boolean @default(false)
  sortOrder     Int      @default(0)

  questionSet ClarificationQuestionSet @relation(fields: [questionSetId], references: [id], onDelete: Cascade)

  @@unique([questionSetId, key])
  @@index([questionSetId, sortOrder])
}

enum ClarificationInputType {
  SINGLE_CHOICE
  MULTI_CHOICE
  YES_NO_UNKNOWN
  SHORT_TEXT
  NUMBER
  NOTES
}

/// Binds a set to tag/classification keys or description keywords.
model ClarificationBinding {
  id            String   @id @default(cuid())
  questionSetId String
  /// Canonical tag/classification keys that trigger this set.
  tagKeys       String[] @default([])
  /// Description keyword fallbacks.
  keywords      String[] @default([])

  questionSet ClarificationQuestionSet @relation(fields: [questionSetId], references: [id], onDelete: Cascade)

  @@index([questionSetId])
}

/// A single saved answer for a specific quote line.
/// Carries denormalized label snapshots so old answers stay renderable.
model QuoteLineClarificationAnswer {
  id                  String   @id @default(cuid())
  quoteLineItemId     String
  questionSetId       String
  questionSetKey      String
  questionSetVersion  Int
  questionKey         String
  questionLabelSnapshot String
  inputType           ClarificationInputType
  /// Discriminated value: { kind, optionKeys?, otherText?, text?, number?, unit? }
  valueJson           Json
  /// { [optionKey]: label } snapshot at answer time.
  optionLabelSnapshotsJson Json @default("{}")
  customerFacing      Boolean  @default(false)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  quoteLineItem QuoteLineItem            @relation(fields: [quoteLineItemId], references: [id], onDelete: Cascade)
  questionSet   ClarificationQuestionSet @relation(fields: [questionSetId], references: [id])

  @@unique([quoteLineItemId, questionKey])
  @@index([quoteLineItemId])
  @@index([questionSetKey, questionSetVersion])
}
```

`QuoteLineItem` would gain one back-relation:

```prisma
clarificationAnswers QuoteLineClarificationAnswer[]
```

## Design notes / decisions to confirm

1. **Options as JSON vs table.** Proposed JSON (`optionsJson`) to avoid a 4th
   table initially; option keys/labels are still validated by the existing pure
   helpers. Promote to a table only if option-level analytics are needed.
2. **Versioning.** `@@unique([organizationId, key, version])` lets a set evolve
   while old answers keep `questionSetVersion`. Answers store snapshots so they
   render even against archived/merged sets — matching the interim behavior.
3. **Copy-on-activate.** Clarification answers are **quote authoring data**.
   Consistent with the domain spine, they should NOT be live-read by the job
   after activation; if a job needs them, materialize a copy at activation
   (future, only if execution realignment consumes them).
4. **No derived columns.** No `isClarified` / `clarificationComplete` stored
   flags — completeness is derived from answers vs the set's questions.
5. **Seed migration.** The in-code seed set (`electrical.service_upgrade`) would
   be inserted as `SYSTEM`/`ACTIVE` org-default rows by a seed script, so the
   library helpers swap their data source without UI changes.

## Guardrail / migration checklist (when approved)

- [ ] Get explicit user approval for the models above.
- [ ] Add models + relations to `schema.prisma`.
- [ ] `ALLOW_SCHEMA=1 npm run guardrails` and include migration rationale in PR.
- [ ] Add a loader that reads org library rows (replacing seed accessors).
- [ ] Persist/read `QuoteLineClarificationAnswer` rows; keep scope-text rendering.
- [ ] Backfill: none required (interim wrote only to scope text).
