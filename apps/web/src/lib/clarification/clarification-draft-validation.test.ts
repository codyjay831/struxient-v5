import assert from "node:assert/strict";
import test from "node:test";
import {
  draftHasBlockingErrors,
  validateClarificationSetDraft,
} from "./clarification-draft-validation";

test("passes a valid draft", () => {
  const issues = validateClarificationSetDraft({
    key: "roof.replacement",
    label: "Roof replacement",
    questions: [
      {
        key: "roof.material",
        label: "Roofing material",
        inputType: "single_choice",
        options: [
          { key: "asphalt", label: "Asphalt shingle" },
          { key: "metal", label: "Metal" },
        ],
      },
    ],
  });
  assert.equal(draftHasBlockingErrors(issues), false);
});

test("flags duplicate question keys", () => {
  const issues = validateClarificationSetDraft({
    key: "roof.replacement",
    label: "Roof replacement",
    questions: [
      { key: "roof.pitch", label: "Pitch", inputType: "short_text" },
      { key: "roof.pitch", label: "Pitch again", inputType: "short_text" },
    ],
  });
  assert.equal(
    issues.some((issue) => issue.severity === "error" && issue.message.includes("Duplicate question key")),
    true,
  );
});

test("flags duplicate option keys within a question", () => {
  const issues = validateClarificationSetDraft({
    key: "hvac.replace",
    label: "HVAC replacement",
    questions: [
      {
        key: "hvac.system_type",
        label: "System type",
        inputType: "single_choice",
        options: [
          { key: "split", label: "Split system" },
          { key: "split", label: "Split again" },
        ],
      },
    ],
  });
  assert.equal(
    issues.some((issue) => issue.severity === "error" && issue.message.includes("Duplicate option key")),
    true,
  );
});

test("warns when set key already exists in library", () => {
  const issues = validateClarificationSetDraft(
    {
      key: "roof.replacement",
      label: "Roof replacement",
      questions: [{ key: "roof.layers", label: "Layers", inputType: "number" }],
    },
    { existingSetKey: { label: "Existing roof set", latestVersion: 2 } },
  );
  assert.equal(issues.some((issue) => issue.severity === "warning"), true);
});
