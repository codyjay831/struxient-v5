import assert from "node:assert/strict";
import test from "node:test";
import { AIService } from "./ai-service";

test("assessment prompt enforces context-first and json-only output", () => {
  const prompt = AIService.buildExecutionContextAssessmentPromptForTest(
    {
      organizationId: "org-1",
      templateId: "tpl-1",
      description: "Main service upgrade",
      tags: ["electrical", "service-upgrade"],
      existingStages: [{ id: "s1", name: "Prep" }, { id: "s2", name: "Install" }],
      existingSignals: ["permit-approved"],
      organizationName: "Acme Electric",
      userInstructions: "Customer mentioned 200A panel and meter relocation may be needed.",
    },
    [{ id: "s1", name: "Prep" }, { id: "s2", name: "Install" }],
  );

  assert.match(prompt, /BEFORE drafting execution tasks/i);
  assert.match(prompt, /Never invent details/i);
  assert.match(prompt, /Return JSON only/i);
  assert.match(prompt, /missingContext/i);
  assert.match(prompt, /foundContext/i);
});
