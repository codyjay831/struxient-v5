import assert from "node:assert/strict";
import test from "node:test";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { resolveWorkstationSelectionSurface } from "./selection-routing";

const now = new Date("2026-06-18T08:00:00.000Z");

function makeItem(overrides: Partial<WorkstationWorkItem>): WorkstationWorkItem {
  return {
    id: "item-1",
    kind: "task",
    title: "Example",
    priority: "medium",
    group: "active",
    lens: "attention",
    lane: "due",
    withinLaneRank: 1,
    filterCategory: "tasks",
    reason: "Needs attention.",
    nextStep: "Review details.",
    recordId: "item-1",
    updatedAt: now,
    ...overrides,
  };
}

test("resolveWorkstationSelectionSurface routes change orders to change-order-panel", () => {
  const changeOrder = makeItem({
    id: "change-order-1",
    kind: "change-order",
    recordId: "co-1",
    filterCategory: "quotes",
  });

  assert.equal(resolveWorkstationSelectionSurface(changeOrder), "change-order-panel");
});

test("resolveWorkstationSelectionSurface keeps quotes on quote-workspace", () => {
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    recordId: "quote-1",
    filterCategory: "quotes",
  });

  assert.equal(resolveWorkstationSelectionSurface(quote), "quote-workspace");
});

test("resolveWorkstationSelectionSurface uses opportunity quote when lead anchored", () => {
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    recordId: "quote-1",
    leadAnchorId: "lead-1",
    filterCategory: "quotes",
  });

  assert.equal(resolveWorkstationSelectionSurface(quote), "quote-opportunity");
});
