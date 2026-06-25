import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const impactPanelSource = readFileSync(
  join(process.cwd(), "src/components/jobs/change-order-execution-impact-panel.tsx"),
  "utf8",
);

const workspaceSource = readFileSync(
  join(process.cwd(), "src/components/jobs/change-order-workspace.tsx"),
  "utf8",
);

const readinessPanelSource = readFileSync(
  join(process.cwd(), "src/components/jobs/change-order-readiness-panel.tsx"),
  "utf8",
);

test("execution impact panel hides composer controls when not editable", () => {
  assert.match(impactPanelSource, /editable && activeForm === "cancel"/);
  assert.match(impactPanelSource, /editable && activeForm === "modify"/);
  assert.match(impactPanelSource, /editable && activeForm === "add"/);
  assert.match(impactPanelSource, /Work impact is read-only at this stage/);
});

test("unsaved execution impact banner and save button are shown when dirty", () => {
  assert.match(impactPanelSource, /executionChanged && unsavedBannerMessage/);
  assert.match(impactPanelSource, /Save execution impact/);
});

test("task operation edit form resets per operation with stable key", () => {
  assert.match(impactPanelSource, /function TaskOperationEditForm/);
  assert.match(impactPanelSource, /key=\{task\.opId\}/);
});

test("generated task suggestions use warning styling and confirm action", () => {
  assert.match(impactPanelSource, /task\.isGenerated/);
  assert.match(impactPanelSource, /bg-warning\/10/);
  assert.match(impactPanelSource, /Sparkles/);
  assert.match(impactPanelSource, /Confirm task/);
  assert.match(impactPanelSource, /confirmGeneratedTaskInProposal/);
  assert.match(impactPanelSource, /unreviewedGeneratedCount/);
});

test("modify task composer does not expose unsupported task fields", () => {
  assert.doesNotMatch(impactPanelSource, /hardSignal/i);
  assert.doesNotMatch(impactPanelSource, /requiredSignal/i);
  assert.doesNotMatch(impactPanelSource, /proofField/i);
  assert.doesNotMatch(impactPanelSource, /assignedRole/i);
  assert.doesNotMatch(impactPanelSource, /tradeId/i);
});

test("workspace saves execution impact separately from commercial changes", () => {
  assert.match(workspaceSource, /handleSaveDraft\("execution_only"\)/);
  assert.match(workspaceSource, /handleSaveDraft\("commercial_only"\)/);
  assert.match(workspaceSource, /Save commercial changes/);
  assert.match(workspaceSource, /executionDeltaJson: executionDeltaProposal/);
  assert.match(workspaceSource, /updateChangeOrderDraftAction\(/);
});

test("readiness panel surfaces separate commercial and execution save actions", () => {
  assert.match(readinessPanelSource, /Save commercial changes/);
  assert.match(readinessPanelSource, /Save execution impact/);
});

test("task sections group add, cancel, and modify operations", () => {
  assert.match(impactPanelSource, /Tasks to add/);
  assert.match(impactPanelSource, /Tasks to cancel/);
  assert.match(impactPanelSource, /Tasks to change/);
});
