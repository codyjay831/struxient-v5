import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus, TaskTemplateCategory } from "@prisma/client";
import { buildQuoteExecutionReviewPreviewModel } from "./quote-execution-review-preview-model";

test("buildQuoteExecutionReviewPreviewModel treats equivalent signal keys as connected", () => {
  const model = buildQuoteExecutionReviewPreviewModel({
    id: "quote-1",
    title: "Test quote",
    status: QuoteStatus.APPROVED,
    lines: [
      {
        id: "line-provider",
        description: "Permit line",
        sortOrder: 0,
        tasks: [
          {
            id: "task-provider",
            title: "Confirm permit approval",
            stageId: "stage-1",
            category: TaskTemplateCategory.PERMIT,
            providesSignals: ["permit-approved"],
            requiresSignals: [],
            hardSignal: false,
            sortOrder: 0,
          },
        ],
      },
      {
        id: "line-consumer",
        description: "Install line",
        sortOrder: 1,
        tasks: [
          {
            id: "task-consumer",
            title: "Schedule install",
            stageId: "stage-2",
            category: TaskTemplateCategory.GENERAL,
            providesSignals: [],
            requiresSignals: ["permit.approved"],
            hardSignal: true,
            sortOrder: 0,
          },
        ],
      },
    ],
  });

  assert.equal(model.orphans.length, 0);
  assert.equal(model.handshakes.length, 1);
  assert.equal(model.handshakes[0]?.signal, "permit.approved");
  assert.equal(model.summary.hardOrphanCount, 0);
});
