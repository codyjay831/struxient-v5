import assert from "node:assert/strict";
import test from "node:test";
import {
  assignJobTaskSortOrdersAtActivation,
  buildJobTaskSortOrderMap,
  type ActivationTaskOrderInput,
} from "./quote-job-activation-task-order";

function task(
  overrides: Partial<ActivationTaskOrderInput> & Pick<ActivationTaskOrderInput, "id">,
): ActivationTaskOrderInput {
  return {
    stageId: "stage-a",
    sortOrder: 0,
    lineId: "line-1",
    lineSortOrder: 0,
    ...overrides,
  };
}

test("assignJobTaskSortOrdersAtActivation renumbers colliding tasks in the same stage", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "t1", lineId: "line-a", lineSortOrder: 0, sortOrder: 0 }),
    task({ id: "t2", lineId: "line-b", lineSortOrder: 1, sortOrder: 0 }),
    task({ id: "t3", lineId: "line-a", lineSortOrder: 0, sortOrder: 10 }),
  ]);

  const byId = Object.fromEntries(result.map((t) => [t.id, t.jobTaskSortOrder]));
  assert.deepEqual(byId, { t1: 0, t3: 1, t2: 2 });
});

test("assignJobTaskSortOrdersAtActivation keeps independent counters per stage", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "a1", stageId: "stage-a", lineId: "line-1", sortOrder: 0 }),
    task({ id: "b1", stageId: "stage-b", lineId: "line-1", sortOrder: 0 }),
    task({ id: "a2", stageId: "stage-a", lineId: "line-2", sortOrder: 0 }),
  ]);

  const byId = Object.fromEntries(result.map((t) => [t.id, t.jobTaskSortOrder]));
  assert.equal(byId.a1, 0);
  assert.equal(byId.a2, 1);
  assert.equal(byId.b1, 0);
});

test("assignJobTaskSortOrdersAtActivation breaks line sort ties by line id", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "t1", lineId: "line-z", lineSortOrder: 0, sortOrder: 0 }),
    task({ id: "t2", lineId: "line-a", lineSortOrder: 0, sortOrder: 0 }),
  ]);

  assert.equal(result.find((t) => t.id === "t2")?.jobTaskSortOrder, 0);
  assert.equal(result.find((t) => t.id === "t1")?.jobTaskSortOrder, 1);
});

test("assignJobTaskSortOrdersAtActivation breaks task sort ties by task id", () => {
  const result = assignJobTaskSortOrdersAtActivation([
    task({ id: "task-z", lineId: "line-1", lineSortOrder: 0, sortOrder: 5 }),
    task({ id: "task-a", lineId: "line-1", lineSortOrder: 0, sortOrder: 5 }),
  ]);

  assert.equal(result.find((t) => t.id === "task-a")?.jobTaskSortOrder, 0);
  assert.equal(result.find((t) => t.id === "task-z")?.jobTaskSortOrder, 1);
});

test("buildJobTaskSortOrderMap maps quote execution task ids to normalized sort orders", () => {
  const map = buildJobTaskSortOrderMap([
    {
      id: "line-a",
      sortOrder: 0,
      draftExecutionTasks: [
        { id: "exec-a1", stageId: "stage-1", sortOrder: 0 },
        { id: "exec-a2", stageId: "stage-1", sortOrder: 10 },
      ],
    },
    {
      id: "line-b",
      sortOrder: 1,
      draftExecutionTasks: [{ id: "exec-b1", stageId: "stage-1", sortOrder: 0 }],
    },
  ]);

  assert.equal(map.get("exec-a1"), 0);
  assert.equal(map.get("exec-a2"), 1);
  assert.equal(map.get("exec-b1"), 2);
});
