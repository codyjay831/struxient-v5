import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSalesBoardLaneForCondition,
  groupRowsBySalesBoardLane,
  salesBoardLanesForPipeline,
  formatSalesBoardLaneLabel,
} from "./opportunity-board";

describe("opportunity-board", () => {
  it("maps condition codes to actionable lanes", () => {
    assert.equal(getSalesBoardLaneForCondition("NEEDS_SALES_VISIT"), "NEEDS_SITE_SURVEY");
    assert.equal(getSalesBoardLaneForCondition("SALES_VISIT_SCHEDULED"), "SITE_SURVEY_SET");
    assert.equal(getSalesBoardLaneForCondition("QUOTE_READY_TO_SEND"), "QUOTE_DRAFT");
    assert.equal(getSalesBoardLaneForCondition("WAITING_ON_CUSTOMER"), "QUOTE_SENT");
    assert.equal(getSalesBoardLaneForCondition("CUSTOMER_REQUESTED_CHANGES"), "CHANGES_REQUESTED");
  });

  it("groups rows by board lane", () => {
    const rows = [
      { id: "1", progressState: "NEEDS_SALES_VISIT" },
      { id: "2", progressState: "WAITING_ON_CUSTOMER" },
      { id: "3", progressState: "NEEDS_SALES_VISIT" },
    ];
    const grouped = groupRowsBySalesBoardLane(rows);
    assert.equal(grouped.get("NEEDS_SITE_SURVEY")?.length, 2);
    assert.equal(grouped.get("QUOTE_SENT")?.length, 1);
  });

  it("returns pipeline-specific lane order", () => {
    assert.deepEqual(salesBoardLanesForPipeline("awarded"), [
      "APPROVED_READY_FOR_JOB",
      "JOB_ACTIVE",
    ]);
    assert.deepEqual(salesBoardLanesForPipeline("closed"), ["LOST"]);
    assert.ok(salesBoardLanesForPipeline("active").includes("NEEDS_SITE_SURVEY"));
    assert.ok(!salesBoardLanesForPipeline("active").includes("JOB_ACTIVE"));
  });

  it("formats lane labels for contractors", () => {
    assert.equal(formatSalesBoardLaneLabel("NEEDS_SITE_SURVEY"), "Needs site survey");
    assert.equal(formatSalesBoardLaneLabel("QUOTE_SENT"), "Quote sent");
  });
});
