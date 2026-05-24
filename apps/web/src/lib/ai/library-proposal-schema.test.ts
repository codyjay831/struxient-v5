import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole, TaskTemplateCategory } from "@prisma/client";
import { AILibraryProposalSchema } from "./library-proposal-schema";

test("library proposal schema defaults cleanupNotes and missingContext", () => {
  const parsed = AILibraryProposalSchema.parse({
    templateId: "tpl-1",
    sourceContext: "Panel upgrade",
    assumptions: [],
    warnings: [],
    tasks: [
      {
        tempId: "task-1",
        title: "Request final inspection",
        category: TaskTemplateCategory.INSPECTION,
        stageName: "Inspection",
        stageId: "stage-1",
        providesSignals: [],
        requiresSignals: [],
        hardSignal: false,
        checklist: [],
        resources: [],
      },
    ],
  });

  assert.deepEqual(parsed.cleanupNotes, []);
  assert.deepEqual(parsed.missingContext, []);
});

test("library proposal schema accepts assigneeRole", () => {
  const parsed = AILibraryProposalSchema.parse({
    templateId: "tpl-1",
    sourceContext: "Panel upgrade",
    assumptions: [],
    warnings: [],
    tasks: [
      {
        tempId: "task-1",
        title: "Request final inspection",
        category: TaskTemplateCategory.INSPECTION,
        stageName: "Inspection",
        stageId: "stage-1",
        providesSignals: [],
        requiresSignals: [],
        hardSignal: false,
        assigneeRole: StaffRole.OFFICE,
        checklist: [],
        resources: [],
      },
    ],
  });

  assert.equal(parsed.tasks[0].assigneeRole, StaffRole.OFFICE);
});

test("library proposal schema rejects invalid assigneeRole", () => {
  assert.throws(
    () =>
      AILibraryProposalSchema.parse({
        templateId: "tpl-1",
        sourceContext: "Panel upgrade",
        assumptions: [],
        warnings: [],
        tasks: [
          {
            tempId: "task-1",
            title: "Request final inspection",
            category: TaskTemplateCategory.INSPECTION,
            stageName: "Inspection",
            stageId: "stage-1",
            providesSignals: [],
            requiresSignals: [],
            hardSignal: false,
            assigneeRole: "INVALID_ROLE",
            checklist: [],
            resources: [],
          },
        ],
      }),
    /assigneeRole/i,
  );
});
