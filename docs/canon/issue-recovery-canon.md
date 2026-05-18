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
