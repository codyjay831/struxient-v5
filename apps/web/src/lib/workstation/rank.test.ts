import assert from "node:assert/strict";
import test from "node:test";
import { compareWorkstationItemsByRank, LANE_ORDER } from "./rank";

test("LANE_ORDER ranks critical above due above upcoming above watch", () => {
  assert.ok(LANE_ORDER.critical < LANE_ORDER.due);
  assert.ok(LANE_ORDER.due < LANE_ORDER.upcoming);
  assert.ok(LANE_ORDER.upcoming < LANE_ORDER.watch);
});

test("compareWorkstationItemsByRank sorts by lane before withinLaneRank", () => {
  const critical = { lane: "critical" as const, withinLaneRank: 5000 };
  const dueFresh = { lane: "due" as const, withinLaneRank: 0 };
  const upcoming = { lane: "upcoming" as const, withinLaneRank: 0 };

  assert.ok(compareWorkstationItemsByRank(critical, dueFresh) < 0);
  assert.ok(compareWorkstationItemsByRank(dueFresh, upcoming) < 0);
  assert.ok(compareWorkstationItemsByRank(critical, upcoming) < 0);
});

test("compareWorkstationItemsByRank uses withinLaneRank within the same lane", () => {
  const higherPriority = { lane: "due" as const, withinLaneRank: 10 };
  const lowerPriority = { lane: "due" as const, withinLaneRank: 100 };

  assert.ok(compareWorkstationItemsByRank(higherPriority, lowerPriority) < 0);
});
