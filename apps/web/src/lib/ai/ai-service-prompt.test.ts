import assert from "node:assert/strict";
import test from "node:test";
import { AIService } from "./ai-service";

test("execution prompt includes quality constraints", () => {
  const prompt = AIService.buildContractorRealismPromptForTest(
    {
      organizationId: "org-1",
      templateId: "tpl-1",
      description: "200A panel upgrade",
      tags: ["electrical", "panel"],
      existingStages: [{ id: "s1", name: "Inspection" }, { id: "s2", name: "Closeout" }],
      existingSignals: ["permit-approved"],
      organizationName: "Acme Electric",
    },
    [{ id: "s1", name: "Inspection" }, { id: "s2", name: "Closeout" }],
    [],
  );

  assert.match(prompt, /SMALLEST useful set of executable tasks/i);
  assert.match(prompt, /Use INSPECTION only for actual AHJ\/inspection events/i);
  assert.match(prompt, /Use WALKTHROUGH only for distinct on-site\/customer walkthrough events/i);
  assert.match(prompt, /Use CLOSEOUT for generic wrap-up\/finalization work/i);
  assert.match(prompt, /missingContext/i);
});
