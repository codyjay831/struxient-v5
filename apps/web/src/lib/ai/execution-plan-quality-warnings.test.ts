import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import {
  collectExecutionPlanQualityWarnings,
  isCategoryLikeStageNameNotAllowed,
} from "./execution-plan-quality-warnings";

type Task = Parameters<typeof collectExecutionPlanQualityWarnings>[0]["tasks"][number];

function task(overrides: Partial<Task> & { title: string; category: TaskTemplateCategory }): Task {
  return {
    instructions: "",
    confidence: 0.8,
    providesSignals: [],
    requiresSignals: [],
    ...overrides,
  };
}

/** A clean MVP EV charger plan (5-8 tasks, execution gates only). */
function goodEvPlan(): Task[] {
  return [
    task({
      title: "Field verify panel and charger location",
      category: TaskTemplateCategory.GENERAL,
      confidence: 0.8,
      providesSignals: ["site_visit.decision_complete"],
    }),
    task({
      title: "Prepare and submit electrical permit",
      category: TaskTemplateCategory.PERMIT,
      confidence: 0.85,
      requiresSignals: ["site_visit.decision_complete"],
      providesSignals: ["permit.submitted"],
    }),
    task({
      title: "Confirm permit approval",
      category: TaskTemplateCategory.PERMIT,
      confidence: 0.7,
      requiresSignals: ["permit.submitted"],
      providesSignals: ["permit.approved"],
    }),
    task({
      title: "Source and stage required materials",
      category: TaskTemplateCategory.MATERIAL,
      confidence: 0.85,
      providesSignals: ["material.ready"],
    }),
    task({
      title: "Install EV charger circuit",
      category: TaskTemplateCategory.GENERAL,
      confidence: 0.8,
      requiresSignals: ["permit.approved", "material.ready"],
      providesSignals: ["install.completed"],
    }),
    task({
      title: "Schedule final electrical inspection",
      category: TaskTemplateCategory.INSPECTION,
      confidence: 0.8,
      requiresSignals: ["install.completed"],
      providesSignals: ["inspection.final_scheduled"],
    }),
    task({
      title: "Attend final electrical inspection",
      category: TaskTemplateCategory.INSPECTION,
      confidence: 0.75,
      requiresSignals: ["inspection.final_scheduled"],
      providesSignals: ["inspection.final_passed"],
    }),
  ];
}

test("clean EV plan produces no quality warnings", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "Dedicated EV Charger Circuit Installation",
    userInstructions: "Install dedicated 240V circuit and mount charger in garage.",
    assumptions: ["Existing panel has spare capacity for the new circuit."],
    missingContext: ["Confirm exact charger model and amperage."],
    tasks: goodEvPlan(),
  });

  assert.deepEqual(warnings, []);
});

test("EV plan stays within 5-8 execution-gate tasks", () => {
  const tasks = goodEvPlan();
  assert.ok(tasks.length >= 5 && tasks.length <= 8);
});

test("warns when task count exceeds simple-scope target", () => {
  const tasks = [...goodEvPlan(), ...goodEvPlan()];
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: [],
    missingContext: [],
    tasks,
  });
  assert.ok(warnings.some((w) => /target 5-8/i.test(w)));
});

test("warns on confidence 1.0", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: [],
    missingContext: [],
    tasks: [task({ title: "Install EV charger circuit", category: TaskTemplateCategory.GENERAL, confidence: 1 })],
  });
  assert.ok(warnings.some((w) => /confidence 1\.0/i.test(w)));
});

test("warns when inspection scheduling uses SCHEDULING category", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: [],
    missingContext: [],
    tasks: [
      task({
        title: "Schedule final electrical inspection",
        category: TaskTemplateCategory.SCHEDULING,
        confidence: 0.8,
      }),
    ],
  });
  assert.ok(warnings.some((w) => /INSPECTION, not SCHEDULING/i.test(w)));
});

test("warns on payment task when payment not mentioned", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger circuit install",
    userInstructions: "Install dedicated circuit and mount charger.",
    assumptions: [],
    missingContext: [],
    tasks: [task({ title: "Collect final payment", category: TaskTemplateCategory.PAYMENT, confidence: 0.8 })],
  });
  assert.ok(warnings.some((w) => /payment\/billing is not mentioned/i.test(w)));
});

test("does not warn on payment task when payment is mentioned", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger circuit install with 50% deposit and final invoice on completion",
    assumptions: [],
    missingContext: [],
    tasks: [task({ title: "Collect deposit", category: TaskTemplateCategory.PAYMENT, confidence: 0.8 })],
  });
  assert.ok(!warnings.some((w) => /payment\/billing is not mentioned/i.test(w)));
});

test("warns on forbidden filler task titles", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: [],
    missingContext: [],
    tasks: [
      task({ title: "Customer Walkthrough & Handover", category: TaskTemplateCategory.CUSTOMER_COMMUNICATION, confidence: 0.8 }),
      task({ title: "Project Closeout", category: TaskTemplateCategory.GENERAL, confidence: 0.8 }),
    ],
  });
  assert.ok(warnings.some((w) => /filler tasks/i.test(w)));
});

test("warns on CamelCase signals", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: [],
    missingContext: [],
    tasks: [
      task({
        title: "Confirm permit approval",
        category: TaskTemplateCategory.PERMIT,
        confidence: 0.8,
        providesSignals: ["PermitApproved"],
      }),
    ],
  });
  assert.ok(warnings.some((w) => /lowercase dot-key format/i.test(w)));
});

test("warns when assumptions and missingContext share an unresolved issue", () => {
  const warnings = collectExecutionPlanQualityWarnings({
    description: "EV charger",
    assumptions: ["Existing electrical panel has sufficient capacity for the circuit."],
    missingContext: ["Verify existing electrical panel capacity for the new circuit."],
    tasks: goodEvPlan(),
  });
  assert.ok(warnings.some((w) => /both assumptions and missingContext/i.test(w)));
});

test("isCategoryLikeStageNameNotAllowed flags category-like invented stages", () => {
  const allowed = [
    { id: "s1", name: "Inspection" },
    { id: "s2", name: "Mobilization" },
  ];
  assert.equal(isCategoryLikeStageNameNotAllowed("Scheduling", allowed), true);
  assert.equal(isCategoryLikeStageNameNotAllowed("Payment", allowed), true);
  // Inspection is a category AND an allowed stage here, so it is fine.
  assert.equal(isCategoryLikeStageNameNotAllowed("Inspection", allowed), false);
  // Normal stage name that is not a category is fine.
  assert.equal(isCategoryLikeStageNameNotAllowed("Rough-In", allowed), false);
});
