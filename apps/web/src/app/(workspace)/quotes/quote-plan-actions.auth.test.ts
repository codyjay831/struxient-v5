import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const quotePlanActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "quote-plan-actions.ts",
);
const quoteLineExecutionActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "quote-line-execution-actions.ts",
);
const quotePlanSource = readFileSync(quotePlanActionsPath, "utf8");
const quoteLineExecutionSource = readFileSync(quoteLineExecutionActionsPath, "utf8");

assert.doesNotMatch(
  quotePlanSource,
  /getMutableRequestContextOrThrow/,
  "quote-plan-actions.ts should not use getMutableRequestContextOrThrow",
);

assert.match(
  quotePlanSource,
  /getExecutionPlanEditorContextOrThrow/,
  "quote-plan-actions.ts should use execution plan editor context for mutations",
);

assert.match(
  quotePlanSource,
  /generateQuoteExecutionPlanProposalAction[\s\S]*getExecutionPlanEditorContextOrThrow/,
  "generate proposal should require execution plan editor context",
);

assert.match(
  quotePlanSource,
  /applyQuoteExecutionPlanProposalAction[\s\S]*getExecutionPlanEditorContextOrThrow/,
  "apply proposal should require execution plan editor context",
);

assert.match(
  quotePlanSource,
  /addQuotePlanTaskManualAction[\s\S]*getExecutionPlanEditorContextOrThrow/,
  "manual add should require execution plan editor context",
);

assert.match(
  quotePlanSource,
  /previewUncoordinatedDraftProposalAction[\s\S]*getCommercialRequestContextOrThrow/,
  "preview should allow commercial read context only",
);

assert.match(
  quoteLineExecutionSource,
  /getExecutionPlanEditorContextOrThrow/,
  "quote-line execution mutations should use execution plan editor context",
);

assert.doesNotMatch(
  quoteLineExecutionSource,
  /getMutableRequestContextOrThrow/,
  "quote-line-execution-actions.ts should not use getMutableRequestContextOrThrow",
);

const assessIndex = quoteLineExecutionSource.indexOf(
  "export async function assessQuoteLineExecutionContextAction",
);
assert.ok(assessIndex >= 0, "assessQuoteLineExecutionContextAction should exist");
const nextExportAfterAssess = quoteLineExecutionSource.indexOf(
  "export async function",
  assessIndex + 1,
);
const assessBody = quoteLineExecutionSource.slice(
  assessIndex,
  nextExportAfterAssess >= 0 ? nextExportAfterAssess : undefined,
);
assert.match(
  assessBody,
  /getCommercialRequestContextOrThrow/,
  "assess context should remain commercial read only",
);
assert.doesNotMatch(
  assessBody,
  /getExecutionPlanEditorContextOrThrow/,
  "assess context should not require plan editor permission",
);

console.log("quote-plan-actions.auth.test.ts passed");
