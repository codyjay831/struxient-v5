import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeCrossLineWiring,
  normalizeSignalKey,
  signalsEquivalent,
  suggestCrossLineWiring,
} from "./signal-suggester";

test("signalsEquivalent treats dot and hyphen permit signals as equivalent", () => {
  assert.equal(signalsEquivalent("permit.approved", "permit-approved"), true);
  assert.equal(normalizeSignalKey("permit.approved"), "permitapproved");
});

test("suggestCrossLineWiring suggests roof-prepped wiring between roofing and skylight lines", () => {
  const suggestions = suggestCrossLineWiring([
    {
      id: "line-roof",
      description: "Roofing",
      tasks: [
        {
          id: "task-prep",
          title: "Tear off and prep deck",
          category: "LABOR",
          provides: [],
          requires: [],
        },
      ],
    },
    {
      id: "line-sky",
      description: "Skylights",
      tasks: [
        {
          id: "task-install",
          title: "Install Skylights",
          category: "LABOR",
          provides: [],
          requires: [],
        },
      ],
    },
  ]);

  assert.equal(suggestions.length, 1);
  assert.deepEqual(
    {
      suggestionKey: suggestions[0]?.suggestionKey,
      signal: suggestions[0]?.signal,
      consumerTaskId: suggestions[0]?.consumerTaskId,
      providerTaskId: suggestions[0]?.providerTaskId,
    },
    {
      suggestionKey: "task-install:roof-prepped",
      signal: "roof-prepped",
      consumerTaskId: "task-install",
      providerTaskId: "task-prep",
    },
  );
});

test("suggestCrossLineWiring returns no suggestions when wiring already exists", () => {
  const suggestions = suggestCrossLineWiring([
    {
      id: "line-roof",
      description: "Roofing",
      tasks: [
        {
          id: "task-prep",
          title: "Prep roof",
          category: "LABOR",
          provides: ["roof-prepped"],
          requires: [],
        },
      ],
    },
    {
      id: "line-sky",
      description: "Skylight install",
      tasks: [
        {
          id: "task-install",
          title: "Install skylights",
          category: "LABOR",
          provides: [],
          requires: ["roof-prepped"],
        },
      ],
    },
  ]);

  assert.equal(suggestions.length, 0);
});

test("analyzeCrossLineWiring wires permit.approved from a permit approval task on another line", () => {
  const analysis = analyzeCrossLineWiring([
    {
      id: "line-service",
      description: "Main electrical service upgrade",
      tasks: [
        {
          id: "task-stage",
          title: "Source and stage main service equipment",
          category: "MATERIAL",
          provides: [],
          requires: ["permit.approved"],
        },
      ],
    },
    {
      id: "line-ev",
      description: "Electric vehicle (EV) charger circuit installation",
      tasks: [
        {
          id: "task-permit-submit",
          title: "Prepare and submit electrical permit",
          category: "PERMIT",
          provides: ["permit.submitted"],
          requires: [],
        },
        {
          id: "task-permit-approve",
          title: "Confirm permit approval",
          category: "PERMIT",
          provides: [],
          requires: ["permit.submitted"],
        },
      ],
    },
  ]);

  assert.equal(analysis.suggestions.length, 1);
  assert.deepEqual(
    {
      signal: analysis.suggestions[0]?.signal,
      consumerTaskId: analysis.suggestions[0]?.consumerTaskId,
      providerTaskId: analysis.suggestions[0]?.providerTaskId,
      providerLineDescription: analysis.suggestions[0]?.providerLineDescription,
    },
    {
      signal: "permit.approved",
      consumerTaskId: "task-stage",
      providerTaskId: "task-permit-approve",
      providerLineDescription: "Electric vehicle (EV) charger circuit installation",
    },
  );
  assert.equal(analysis.unresolvedOrphans.length, 0);
});

test("analyzeCrossLineWiring lists unresolved orphans when no provider task exists", () => {
  const analysis = analyzeCrossLineWiring([
    {
      id: "line-service",
      description: "Main electrical service upgrade",
      tasks: [
        {
          id: "task-stage",
          title: "Source and stage main service equipment",
          category: "MATERIAL",
          provides: [],
          requires: ["permit.approved"],
        },
      ],
    },
    {
      id: "line-ev",
      description: "EV charger circuit installation",
      tasks: [
        {
          id: "task-install",
          title: "Install EV charger circuit",
          category: "GENERAL",
          provides: [],
          requires: ["permit.approved"],
        },
      ],
    },
  ]);

  assert.equal(analysis.suggestions.length, 0);
  assert.equal(analysis.unresolvedOrphans.length, 2);
  assert.equal(analysis.unresolvedOrphans[0]?.signal, "permit.approved");
});
