import assert from "node:assert/strict";
import test from "node:test";
import { buildUncoordinatedDraftProposal } from "@/lib/quote-plan/uncoordinated-draft";

function task(title: string) {
  return {
    id: `t-${title}`,
    title,
    category: "GENERAL" as const,
    stageId: "stage-1",
    instructions: null,
    providesSignals: [],
    requiresSignals: [],
    hardSignal: false,
    requirementsJson: {},
    partsRequiredJson: {},
    sourceTaskTemplateId: null,
  };
}

test("buildUncoordinatedDraftProposal supports solar-only scope", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "q-solar",
    generatedAgainstInputHash: "hash-solar",
    basePlanVersion: 1,
    lines: [{ id: "line-solar", description: "Solar", tasks: [task("Install modules")] }],
  });
  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0]?.type, "ADD_TASK");
});

test("buildUncoordinatedDraftProposal supports solar+battery scope", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "q-solar-battery",
    generatedAgainstInputHash: "hash-sb",
    basePlanVersion: 2,
    lines: [
      { id: "line-solar", description: "Solar", tasks: [task("Install modules")] },
      { id: "line-battery", description: "Battery", tasks: [task("Install battery")] },
    ],
  });
  assert.equal(proposal.operations.length, 2);
});

test("buildUncoordinatedDraftProposal supports solar+battery+service scope", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "q-solar-battery-service",
    generatedAgainstInputHash: "hash-sbs",
    basePlanVersion: 3,
    lines: [
      { id: "line-solar", description: "Solar", tasks: [task("Install modules")] },
      { id: "line-battery", description: "Battery", tasks: [task("Install battery")] },
      { id: "line-service", description: "Service", tasks: [task("Upgrade service panel")] },
    ],
  });
  assert.equal(proposal.operations.length, 3);
});

