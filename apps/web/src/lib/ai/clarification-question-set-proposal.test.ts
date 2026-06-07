import test from "node:test";
import assert from "node:assert/strict";
import { ClarificationQuestionSetProposalSchema } from "./clarification-question-set-proposal-schema";

test("parses valid clarification question set proposal", () => {
  const parsed = ClarificationQuestionSetProposalSchema.parse({
    key: "electrical.service_upgrade",
    label: "Electrical service upgrade",
    description: "Clarify service details",
    aliases: ["service upgrade"],
    keywords: ["panel upgrade"],
    suggestedTags: ["service-upgrade"],
    warnings: [],
    questions: [
      {
        key: "electrical.service.new_service_size",
        label: "New service size",
        inputType: "single_choice",
        helpText: null,
        allowOther: true,
        unit: null,
        customerFacing: true,
        aliases: [],
        options: [{ key: "200a", label: "200A", aliases: [] }],
      },
    ],
  });

  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].options[0].key, "200a");
});

test("rejects proposal without questions", () => {
  assert.throws(() =>
    ClarificationQuestionSetProposalSchema.parse({
      key: "test.key",
      label: "Test",
      questions: [],
    }),
  );
});
