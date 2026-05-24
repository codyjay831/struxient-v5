# Issue Recovery Canon (v5)

Status: Locked for v5 BLOCKS_WORK handling.

## Canonical model

When a `JobIssue` has `severity = BLOCKS_WORK`, mitigation is **RecoveryFlow-only**.

- Create recovery path on the issue (`JobRecoveryFlow`)
- Add one or more recovery tasks
- Complete recovery tasks
- Resolve via `resume` (preferred) or `force` (audited exception)

Recovery tasks are normal `JobTask` rows and must carry `recoveryFlowId`.

## What is not canonical

- `createFollowUpTaskFromIssueAction` is deprecated for blocker mitigation.
- A single issue-linked task (`sourceJobIssueId`) is not equivalent to a recovery path and does not participate in blocker bypass/resume semantics.
- Do not introduce alternate blocker-fix paths without canon review.

## Guardrails

- Blocking issues stop unsafe work until resolved.
- Recovery work must remain visible, auditable, and human-reviewed before/while being applied.
- Continue using `resolveJobIssueWithRecoveryHandling` as the single resolution core.

## Scope notes

This canon decision does not change schema by itself and does not redesign workstation ranking, task model, stage signals, or AI review flow.

## Field Event vs Issue Recovery

- **Field Event** is a lightweight signal dependency gate.
- Field Event creates an `EVENT:` task and blocks selected tasks by signal dependency (`requiresSignals` / `providesSignals`).
- **JobIssue + JobRecoveryFlow** is the durable problem/recovery lifecycle.
- Use Field Event for simple holds where completing one hold task should unblock downstream work.
- Use Issue Recovery when there is a problem, correction, failed work, failed inspection, field condition, customer change, material issue, or any multi-step recovery.
- Field Event has activity audit (`EVENT_CREATED` / `EVENT_RESOLVED`), but it does not carry recovery lifecycle semantics.
- Recovery-shaped events must funnel into `JobIssue` / `JobRecoveryFlow`, not `EVENT:` tasks.
