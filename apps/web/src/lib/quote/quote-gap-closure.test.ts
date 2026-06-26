import assert from "node:assert/strict";
import test from "node:test";
import type { ClarificationAnswer } from "@/lib/clarification/clarification-types";
import {
  findScopeDecisionIdsToCloseFromClarification,
  isTruthBearingClarificationAnswer,
  type QuoteGapClosureDecision,
} from "./quote-gap-closure";

function answer(
  overrides: Partial<ClarificationAnswer> & Pick<ClarificationAnswer, "questionKey">,
): ClarificationAnswer {
  return {
    questionSetKey: overrides.questionSetKey ?? "set-1",
    questionSetVersion: overrides.questionSetVersion ?? 1,
    questionKey: overrides.questionKey,
    questionLabelSnapshot: overrides.questionLabelSnapshot ?? "Window count needed",
    inputType: overrides.inputType ?? "short_text",
    value: overrides.value ?? { kind: "text", text: "12 windows" },
    optionLabelSnapshots: overrides.optionLabelSnapshots,
    customerFacing: overrides.customerFacing ?? true,
  };
}

function decision(
  overrides: Partial<QuoteGapClosureDecision> & Pick<QuoteGapClosureDecision, "id">,
): QuoteGapClosureDecision {
  return {
    id: overrides.id,
    quoteLineItemId:
      Object.prototype.hasOwnProperty.call(overrides, "quoteLineItemId")
        ? (overrides.quoteLineItemId ?? null)
        : "line-1",
    title: overrides.title ?? "Confirm window count",
    detail: overrides.detail ?? null,
    sourceRefType: overrides.sourceRefType ?? null,
    sourceRefId: overrides.sourceRefId ?? null,
  };
}

test("unknown answer does not close matching same-line gap", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "unknown" } })],
    decisions: [decision({ id: "d-unknown", quoteLineItemId: "line-1", title: "Window count needed" })],
  });
  assert.deepEqual(ids, []);
});

test("empty string answer does not close matching same-line gap", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "text", text: "   " } })],
    decisions: [decision({ id: "d-empty", quoteLineItemId: "line-1", title: "Window count needed" })],
  });
  assert.deepEqual(ids, []);
});

test("null or undefined style text sentinels do not close matching same-line gap", () => {
  const nullishAnswers = [
    answer({ questionKey: "windows.count", value: { kind: "text", text: "null" } }),
    answer({ questionKey: "windows.count", value: { kind: "text", text: "undefined" } }),
  ];
  for (const current of nullishAnswers) {
    const ids = findScopeDecisionIdsToCloseFromClarification({
      lineId: "line-1",
      questionSetKey: "set-1",
      answers: [current],
      decisions: [decision({ id: `d-${current.value.kind}`, quoteLineItemId: "line-1", title: "Window count needed" })],
    });
    assert.deepEqual(ids, []);
  }
});

test("stable reference match does not close when answer is unknown", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "unknown" } })],
    decisions: [
      decision({
        id: "d-stable-unknown",
        quoteLineItemId: "line-1",
        title: "Window count needed",
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:windows.count",
      }),
    ],
  });
  assert.deepEqual(ids, []);
});

test("same-line valid text answer closes matching gap", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "text", text: "12 windows" } })],
    decisions: [decision({ id: "d-1", quoteLineItemId: "line-1", title: "12 windows" })],
  });
  assert.deepEqual(ids, ["d-1"]);
});

test("same-line explicit negative answer (no) is truth-bearing", () => {
  const noAnswer = answer({
    questionKey: "baseboards.included",
    inputType: "yes_no_unknown",
    value: { kind: "choice", optionKeys: ["no"] },
  });
  assert.equal(isTruthBearingClarificationAnswer(noAnswer), true);
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [noAnswer],
    decisions: [
      decision({
        id: "d-no",
        quoteLineItemId: "line-1",
        title: "Are baseboards included?",
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:baseboards.included",
      }),
    ],
  });
  assert.deepEqual(ids, ["d-no"]);
});

test("numeric 0 is truth-bearing and can close with stable match", () => {
  const zeroAnswer = answer({
    questionKey: "fixtures.count",
    inputType: "number",
    value: { kind: "number", value: 0, unit: "count" },
  });
  assert.equal(isTruthBearingClarificationAnswer(zeroAnswer), true);
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [zeroAnswer],
    decisions: [
      decision({
        id: "d-zero",
        quoteLineItemId: "line-1",
        title: "Fixture quantity",
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:fixtures.count",
      }),
    ],
  });
  assert.deepEqual(ids, ["d-zero"]);
});

test("does not close unrelated line gaps", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", questionLabelSnapshot: "Confirm window count" })],
    decisions: [decision({ id: "d-2", quoteLineItemId: "line-2", title: "Confirm window count" })],
  });
  assert.equal(ids.length, 0);
});

test("does not close quote-wide gaps by text-only similarity", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", questionLabelSnapshot: "Confirm window count" })],
    decisions: [decision({ id: "d-3", quoteLineItemId: null, title: "Confirm window count" })],
  });
  assert.equal(ids.length, 0);
});

test("closes quote-wide gap only with stable clarification reference", () => {
  const ids = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count" })],
    decisions: [
      decision({
        id: "d-4",
        quoteLineItemId: null,
        title: "Quote-wide window count detail",
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:windows.count",
      }),
    ],
  });
  assert.deepEqual(ids, ["d-4"]);
});

test("quote-wide stable-reference match closes only when answer is truth-bearing", () => {
  const unknownIds = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "unknown" } })],
    decisions: [
      decision({
        id: "d-5",
        quoteLineItemId: null,
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:windows.count",
      }),
    ],
  });
  assert.deepEqual(unknownIds, []);

  const truthIds = findScopeDecisionIdsToCloseFromClarification({
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [answer({ questionKey: "windows.count", value: { kind: "text", text: "12 windows" } })],
    decisions: [
      decision({
        id: "d-6",
        quoteLineItemId: null,
        sourceRefType: "clarification_question",
        sourceRefId: "set-1:windows.count",
      }),
    ],
  });
  assert.deepEqual(truthIds, ["d-6"]);
});
