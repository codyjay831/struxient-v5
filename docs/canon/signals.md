# Signal-Based Readiness Engine (canon, Struxient v5)

> **Strategic role:** The Signal-Based Readiness Engine is the "smart" layer of Struxient. It replaces rigid, hardcoded workflows with a flexible, fact-based system where tasks communicate readiness via a per-job **Signal Bus**.

## Core Concepts

### 1. The Signal Bus
The **Signal Bus** is a per-job collection of "facts" (signals) that have been published. It is the single source of truth for whether a task or stage can proceed.

### 2. Signals
A **Signal** is a named string (e.g., `roof-sealed`, `permit-approved`, `payment:deposit:cleared`).
- **Provides**: The signal(s) a task publishes when it is completed.
- **Requires**: The signal(s) a task must "hear" before it becomes **READY**.

### 3. Smart vs. Dumb Tasks
- **Smart Task**: Has `Requires` or `Provides` signals. Its lifecycle is automated by the Signal Bus.
- **Dumb Task**: Has no signal requirements. It is always `READY` as soon as its stage is active.

### 4. Stage gates are deferred in v5 MVP
`JobStage.providesSignals` and `JobStage.requiresSignals` exist in schema but are **not runtime canon in v5 MVP**.
- Runtime readiness and signal publishing are **task-scoped**.
- Stage-level signal gates are **deferred** until a future release defines authoring + activation + UX.
- Stage-level **issue blocking remains valid** (open `BLOCKS_WORK` issues on a stage still block tasks in that stage).

## Readiness Logic

A task's state is derived from the Signal Bus:
1. **COMPLETED**: The task is already done.
2. **BLOCKED_BY_ISSUE**: An open issue is explicitly "muting" this task or its stage.
3. **WAITING_ON_SIGNAL**: One or more `Requires` signals are missing from the Signal Bus.
4. **READY**: All `Requires` signals are present, and no issues are blocking it.

## The AI Secretary

To keep the system simple for users, AI acts as a "Secretary" to handle the manual wiring of signals:
- **Template Authoring**: AI suggests `Provides` and `Requires` signals based on task names.
- **Quote Planning**: AI reviews the cross-line dependencies (e.g., "Roof" must provide `roof-ready` for "Skylight") and suggests the handshake.
- **Activation**: AI performs a final review to ensure no "Hard Signals" are missing a provider.

## Activation & Orphans

At job activation, the system reviews all `Requires` signals:
- **Soft Orphans**: If a required signal has no provider in the job (e.g., a "Skylight" without a "Roof"), the system **auto-satisfies** the signal so the task isn't permanently stuck.
- **Hard Signals**: If a signal is marked as **Hard** (e.g., `permit-approved`), activation is **blocked** until a provider is found or the requirement is removed.

## Events & Field Recovery

When surprises happen in the field, users can add **Events**:
- An Event is a dynamic task that can "hijack" the Signal Bus.
- Example: A failed inspection creates an Event that publishes `inspection-failed`. Downstream tasks are updated to `Require` a new `inspection-passed` signal, effectively pausing work until the Event is resolved.

## Note on Commercial Tiers (Good/Better/Best)

The Signal Engine manages operational readiness and task dependencies. Commercial tiering (e.g., Good/Better/Best options on a quote) is a separate commercial feature. While different tiers may result in different sets of tasks being activated, the Signal Engine itself is agnostic to commercial tiers and only operates on the specific set of tasks present in an activated job.

---

*Canon update (2026-05-13): Initial version of the Signal-Based Readiness Engine canon.*  
*Canon update (2026-05-19): v5 MVP signals are task-scoped; stage-level signal gates are deferred and not runtime canon. Stage issue blocking remains in force.*
