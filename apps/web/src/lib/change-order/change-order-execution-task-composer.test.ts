import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus } from "@prisma/client";
import {
  CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import {
  addManualCancelTaskToProposal,
  addManualModifyTaskToProposal,
  addManualAddTaskToProposal,
  canSelectTaskForCancel,
  canSelectTaskForModify,
  createManualCancelTaskOperation,
  getTaskOperationSourceKind,
  isExecutionTaskComposerEditable,
  removeTaskOperationFromProposal,
  taskOperationSourceLabel,
  userFacingValidationMessage,
  mapValidationErrorsByOpId,
  type ChangeOrderComposerTaskSnapshot,
} from "./change-order-execution-task-composer";

const baseProposal: ChangeOrderExecutionDeltaProposal = {
  schemaVersion: CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  baseJobPlanVersion: 2,
  operations: [],
};

const activeTask: ChangeOrderComposerTaskSnapshot = {
  id: "task-1",
  title: "Install panel",
  status: JobTaskStatus.TODO,
  scopeItemIds: ["scope-1"],
  instructions: "Install on roof",
};

test("DONE task cannot be selected for cancel", () => {
  const result = canSelectTaskForCancel(
    { ...activeTask, status: JobTaskStatus.DONE },
    new Set(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /completed task/i);
  }
});

test("DONE task cannot be selected for modify", () => {
  const result = canSelectTaskForModify(
    { ...activeTask, status: JobTaskStatus.DONE },
    new Set(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /Completed tasks cannot be modified/i);
  }
});

test("addManualCancelTaskToProposal appends CANCEL_TASK operation", () => {
  const result = addManualCancelTaskToProposal({
    proposal: baseProposal,
    task: activeTask,
    reason: "Scope removed by change order",
    internalNote: "Office confirmed with PM",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.operations.length, 1);
  assert.equal(result.proposal.operations[0]?.type, "CANCEL_TASK");
  assert.equal(result.proposal.operations[0]?.targetEntityId, "task-1");
});

test("manual cancel operation is labeled separately from generated add tasks", () => {
  const cancel = createManualCancelTaskOperation({
    taskId: "task-1",
    reason: "Remove work",
  });
  assert.equal(getTaskOperationSourceKind(cancel), "manual_cancel");
  assert.match(taskOperationSourceLabel("manual_cancel"), /Manually added cancellation/i);
});

test("addManualModifyTaskToProposal requires a field change", () => {
  const result = addManualModifyTaskToProposal({
    proposal: baseProposal,
    task: activeTask,
    title: activeTask.title,
    instructions: activeTask.instructions,
    jobScopeItemIds: activeTask.scopeItemIds,
    reason: "No actual change",
  });
  assert.equal(result.ok, false);
});

test("addManualModifyTaskToProposal adds MODIFY_TASK with title change", () => {
  const result = addManualModifyTaskToProposal({
    proposal: baseProposal,
    task: activeTask,
    title: "Install upgraded panel",
    reason: "Customer requested upgrade",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.operations[0]?.type, "MODIFY_TASK");
});

test("addManualAddTaskToProposal creates manual ADD_TASK", () => {
  const result = addManualAddTaskToProposal({
    proposal: baseProposal,
    title: "Final inspection",
    instructions: "Verify install",
    jobScopeItemIds: ["scope-1"],
    reason: "Add inspection coverage",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.operations[0]?.type, "ADD_TASK");
  assert.equal(getTaskOperationSourceKind(result.proposal.operations[0]!), "manual_added");
  assert.match(taskOperationSourceLabel("manual_added"), /Manually added/i);
});

test("removeTaskOperationFromProposal removes manual task operations", () => {
  const withCancel = addManualCancelTaskToProposal({
    proposal: baseProposal,
    task: activeTask,
    reason: "Remove work",
  });
  assert.equal(withCancel.ok, true);
  if (!withCancel.ok) return;
  const opId = withCancel.proposal.operations[0]!.opId;
  const next = removeTaskOperationFromProposal(withCancel.proposal, opId);
  assert.equal(next.operations.length, 0);
});

test("composer is read-only outside draft/customer-requested states", () => {
  assert.equal(
    isExecutionTaskComposerEditable({
      status: "SENT",
      applicationStatus: "NOT_APPLIED",
    }),
    false,
  );
  assert.equal(
    isExecutionTaskComposerEditable({
      status: "ACCEPTED",
      applicationStatus: "APPLY_FAILED",
    }),
    false,
  );
  assert.equal(
    isExecutionTaskComposerEditable({
      status: "DRAFT",
      applicationStatus: "NOT_APPLIED",
    }),
    true,
  );
});

test("userFacingValidationMessage maps backend cancel errors", () => {
  assert.equal(
    userFacingValidationMessage("manual-cancel:task-1: completed tasks cannot be canceled by Change Order delta."),
    "Cannot cancel a completed task.",
  );
});

test("mapValidationErrorsByOpId handles opIds that contain colons", () => {
  const byOpId = mapValidationErrorsByOpId(
    ["manual-cancel:task-done: completed tasks cannot be canceled by Change Order delta."],
    ["manual-cancel:task-done"],
  );
  assert.deepEqual(byOpId.get("manual-cancel:task-done"), [
    "completed tasks cannot be canceled by Change Order delta.",
  ]);
});
