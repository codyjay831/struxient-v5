import assert from "node:assert/strict";
import test from "node:test";
import {
  assignJobTaskSortOrdersAtActivation,
  buildJobTaskSortOrderMap,
  buildJobTaskSortOrderMapFromQuotePlanTasks,
  type ActivationTaskOrderInput,
} from "./quote-job-activation-task-order";

function task(
  overrides: Partial<ActivationTaskOrderInput> & Pick<ActivationTaskOrderInput, "id">,
): ActivationTaskOrderInput {
  return {
    stageId: "stage-a",
    sortOrder: 0,
    ...overrides,
  };
}

test("assignJobTaskSortOrdersAtActivation renumbers colliding tasks in the same stage", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "t1", sortOrder: 0 }),
    task({ id: "t2", sortOrder: 0 }),
    task({ id: "t3", sortOrder: 10 }),
  ]);

  const byId = Object.fromEntries(result.map((t) => [t.id, t.jobTaskSortOrder]));
  assert.deepEqual(byId, { t1: 0, t2: 1, t3: 2 });
});

test("assignJobTaskSortOrdersAtActivation keeps independent counters per stage", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "a1", stageId: "stage-a", sortOrder: 0 }),
    task({ id: "b1", stageId: "stage-b", sortOrder: 0 }),
    task({ id: "a2", stageId: "stage-a", sortOrder: 0 }),
  ]);

  const byId = Object.fromEntries(result.map((t) => [t.id, t.jobTaskSortOrder]));
  assert.equal(byId.a1, 0);
  assert.equal(byId.a2, 1);
  assert.equal(byId.b1, 0);
});

test("assignJobTaskSortOrdersAtActivation breaks task sort ties by task id", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "t1", sortOrder: 0 }),
    task({ id: "t2", sortOrder: 0 }),
  ]);

  assert.equal(result.find((t) => t.id === "t1")?.jobTaskSortOrder, 0);
  assert.equal(result.find((t) => t.id === "t2")?.jobTaskSortOrder, 1);
});

test("buildJobTaskSortOrderMap maps quote execution task ids to normalized sort orders", () => {
  const map = buildJobTaskSortOrderMap([
    {
      id: "line-a",
      draftExecutionTasks: [
        { id: "exec-a1", stageId: "stage-1", sortOrder: 0 },
        { id: "exec-a2", stageId: "stage-1", sortOrder: 10 },
      ],
    },
    {
      id: "line-b",
      draftExecutionTasks: [{ id: "exec-b1", stageId: "stage-1", sortOrder: 0 }],
    },
  ]);

  assert.equal(map.get("exec-a1"), 0);
  assert.equal(map.get("exec-b1"), 1);
  assert.equal(map.get("exec-a2"), 2);
});

test("buildJobTaskSortOrderMapFromQuotePlanTasks maps source line task ids", () => {
  const map = buildJobTaskSortOrderMapFromQuotePlanTasks([
    {
      id: "plan-1",
      stageId: "stage-1",
      sortOrder: 0,
      sourceQuoteLineExecutionTaskId: "line-task-1",
    },
    {
      id: "plan-2",
      stageId: "stage-1",
      sortOrder: 5,
      sourceQuoteLineExecutionTaskId: "line-task-2",
    },
  ]);

  assert.equal(map.get("line-task-1"), 0);
  assert.equal(map.get("line-task-2"), 1);
});
