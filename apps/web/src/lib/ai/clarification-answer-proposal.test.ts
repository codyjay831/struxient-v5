import assert from "node:assert/strict";
import test from "node:test";
import {
  ClarificationAnswerProposalSchema,
} from "./clarification-answer-proposal-schema";

test("parses a well-formed clarification answer proposal", () => {
  const proposal = ClarificationAnswerProposalSchema.parse({
    questionSetKey: "electrical.service_upgrade",
    questionSetVersion: 1,
    suggestions: [
      { questionKey: "electrical.service.new_service_size", optionKeys: ["200a"], confidence: "high" },
      { questionKey: "electrical.service.permit_required", unknown: true },
    ],
    unresolvedQuestionKeys: ["electrical.service.feeder_strategy"],
    notes: ["Inferred amperage from description."],
  });

  assert.equal(proposal.suggestions.length, 2);
  assert.equal(proposal.suggestions[0].optionKeys[0], "200a");
  // Defaults applied.
  assert.equal(proposal.suggestions[0].unknown, false);
  assert.equal(proposal.suggestions[1].confidence, "medium");
  assert.deepEqual(proposal.unresolvedQuestionKeys, ["electrical.service.feeder_strategy"]);
});

test("defaults empty arrays when fields are omitted", () => {
  const proposal = ClarificationAnswerProposalSchema.parse({
    questionSetKey: "x.y",
    questionSetVersion: 0,
  });
  assert.deepEqual(proposal.suggestions, []);
  assert.deepEqual(proposal.unresolvedQuestionKeys, []);
  assert.deepEqual(proposal.notes, []);
});

test("rejects a proposal missing the set key", () => {
  assert.throws(() =>
    ClarificationAnswerProposalSchema.parse({ questionSetVersion: 1, suggestions: [] }),
  );
});

test("rejects a suggestion with a non-finite number", () => {
  assert.throws(() =>
    ClarificationAnswerProposalSchema.parse({
      questionSetKey: "x.y",
      questionSetVersion: 1,
      suggestions: [
        { questionKey: "q", number: Number.POSITIVE_INFINITY },
      ],
    }),
  );
});
