import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClarificationAnswer,
  formatAnswerValue,
  isAnswerProvided,
  NEEDS_FIELD_VERIFY_LABEL,
  renderClarificationAnswersToScopeText,
  validateAnswerValue,
} from "./clarification-answers";
import type {
  ClarificationAnswer,
  ClarificationQuestion,
  ClarificationQuestionSet,
} from "./clarification-types";

const SET: Pick<ClarificationQuestionSet, "key" | "version"> = {
  key: "electrical.service_upgrade",
  version: 1,
};

const sizeQuestion: ClarificationQuestion = {
  key: "electrical.service.new_service_size",
  label: "New service size",
  inputType: "single_choice",
  customerFacing: true,
  allowOther: true,
  options: [
    { key: "100a", label: "100A" },
    { key: "200a", label: "200A" },
    { key: "400a", label: "400A" },
  ],
};

const trenchQuestion: ClarificationQuestion = {
  key: "electrical.service.trenching_required",
  label: "Trenching required",
  inputType: "yes_no_unknown",
  customerFacing: true,
};

const permitQuestion: ClarificationQuestion = {
  key: "electrical.service.permit_required",
  label: "Permit required",
  inputType: "yes_no_unknown",
  customerFacing: false,
};

test("isAnswerProvided treats unknown as provided but empty text as not", () => {
  assert.equal(isAnswerProvided({ kind: "unknown" }), true);
  assert.equal(isAnswerProvided({ kind: "text", text: "  " }), false);
  assert.equal(isAnswerProvided({ kind: "choice", optionKeys: [] }), false);
  assert.equal(isAnswerProvided({ kind: "choice", optionKeys: ["200a"] }), true);
});

test("validateAnswerValue enforces single choice cardinality", () => {
  const ok = validateAnswerValue(sizeQuestion, { kind: "choice", optionKeys: ["200a"] });
  assert.equal(ok.ok, true);

  const tooMany = validateAnswerValue(sizeQuestion, {
    kind: "choice",
    optionKeys: ["200a", "400a"],
  });
  assert.equal(tooMany.ok, false);
});

test("validateAnswerValue rejects unknown option keys", () => {
  const result = validateAnswerValue(sizeQuestion, { kind: "choice", optionKeys: ["999a"] });
  assert.equal(result.ok, false);
});

test("validateAnswerValue requires other text when __other__ selected", () => {
  const missing = validateAnswerValue(sizeQuestion, {
    kind: "choice",
    optionKeys: ["__other__"],
  });
  assert.equal(missing.ok, false);

  const provided = validateAnswerValue(sizeQuestion, {
    kind: "choice",
    optionKeys: ["__other__"],
    otherText: "320A",
  });
  assert.equal(provided.ok, true);
});

test("validateAnswerValue always accepts unknown", () => {
  assert.equal(validateAnswerValue(sizeQuestion, { kind: "unknown" }).ok, true);
  assert.equal(validateAnswerValue(permitQuestion, { kind: "unknown" }).ok, true);
});

test("yes_no_unknown only accepts yes/no keys", () => {
  assert.equal(
    validateAnswerValue(trenchQuestion, { kind: "choice", optionKeys: ["yes"] }).ok,
    true,
  );
  assert.equal(
    validateAnswerValue(trenchQuestion, { kind: "choice", optionKeys: ["maybe"] }).ok,
    false,
  );
});

test("buildClarificationAnswer snapshots labels for version-safe rendering", () => {
  const answer = buildClarificationAnswer(SET, sizeQuestion, {
    kind: "choice",
    optionKeys: ["200a"],
  });
  assert.equal(answer.questionSetKey, "electrical.service_upgrade");
  assert.equal(answer.questionSetVersion, 1);
  assert.equal(answer.questionLabelSnapshot, "New service size");
  assert.equal(answer.optionLabelSnapshots?.["200a"], "200A");
});

test("formatAnswerValue renders unknown as needs field verify", () => {
  const answer = buildClarificationAnswer(SET, permitQuestion, { kind: "unknown" });
  assert.equal(formatAnswerValue(answer), NEEDS_FIELD_VERIFY_LABEL);
});

test("old answers still render from snapshots after the question label changes", () => {
  // Simulate a stored answer captured under an older label.
  const stored: ClarificationAnswer = {
    questionSetKey: SET.key,
    questionSetVersion: 1,
    questionKey: sizeQuestion.key,
    questionLabelSnapshot: "Service amperage", // old label, since renamed
    inputType: "single_choice",
    value: { kind: "choice", optionKeys: ["200a"] },
    optionLabelSnapshots: { "200a": "200 Amp" }, // old option label
    customerFacing: true,
  };
  const text = renderClarificationAnswersToScopeText([stored]);
  assert.deepEqual(text.customerLines, ["Service amperage: 200 Amp"]);
});

test("renderClarificationAnswersToScopeText splits customer vs internal and hides unknowns from customers", () => {
  const answers = [
    buildClarificationAnswer(SET, sizeQuestion, { kind: "choice", optionKeys: ["200a"] }),
    buildClarificationAnswer(SET, trenchQuestion, { kind: "choice", optionKeys: ["yes"] }),
    buildClarificationAnswer(SET, permitQuestion, { kind: "unknown" }),
  ];
  const text = renderClarificationAnswersToScopeText(answers);

  assert.equal(text.customerLines.includes("New service size: 200a"), false);
  assert.deepEqual(text.customerLines, [
    "New service size: 200A",
    "Trenching required: Yes",
  ]);
  // Internal includes the unknown permit answer surfaced as needs-verify.
  assert.equal(
    text.internalLines.some((line) => line === `Permit required: ${NEEDS_FIELD_VERIFY_LABEL}`),
    true,
  );
});
