import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateSetCandidates,
  matchQuestionSetsForLine,
  resolveActiveSetByAlias,
  validateClarificationLibrary,
} from "./clarification-matching";
import {
  SEED_CLARIFICATION_BINDINGS,
  SEED_CLARIFICATION_QUESTION_SETS,
  selectSeedQuestionSetsForLine,
  resolveSeedSetByAlias,
} from "./clarification-library";
import type { ClarificationQuestionSet } from "./clarification-types";

test("seed library passes structural validation (no errors)", () => {
  const issues = validateClarificationLibrary(SEED_CLARIFICATION_QUESTION_SETS);
  const errors = issues.filter((i) => i.severity === "error");
  assert.deepEqual(errors, []);
});

test("selects service-upgrade set from a description keyword", () => {
  const matches = selectSeedQuestionSetsForLine({
    description: "Main electrical service upgrade",
  });
  assert.equal(matches.length >= 1, true);
  assert.equal(matches[0].questionSetKey, "electrical.service_upgrade");
});

test("selects service-upgrade set from a tag key even with odd vocabulary", () => {
  const matches = selectSeedQuestionSetsForLine({
    description: "MSP swap",
    tagKeys: ["service-upgrade"],
  });
  assert.equal(matches[0].questionSetKey, "electrical.service_upgrade");
  assert.equal(matches[0].confidence === "high" || matches[0].confidence === "medium", true);
});

test("unrelated line does not match", () => {
  const matches = selectSeedQuestionSetsForLine({
    description: "Install recessed can lights in kitchen",
  });
  assert.equal(matches.some((m) => m.questionSetKey === "electrical.service_upgrade"), false);
});

test("different names for the same thing all resolve to one canonical set", () => {
  for (const phrase of [
    "200A panel upgrade",
    "meter main upgrade",
    "service change",
    "MSP",
  ]) {
    const resolved = resolveSeedSetByAlias(phrase);
    assert.equal(resolved?.key, "electrical.service_upgrade", `failed for: ${phrase}`);
  }
});

test("validation flags duplicate set keys and option keys", () => {
  const broken: ClarificationQuestionSet[] = [
    {
      key: "dupe.set",
      version: 1,
      label: "First",
      status: "active",
      aliases: [],
      questions: [
        {
          key: "dupe.q",
          label: "Pick",
          inputType: "single_choice",
          options: [
            { key: "x", label: "X" },
            { key: "x", label: "X again" },
          ],
        },
      ],
    },
    {
      key: "dupe.set",
      version: 1,
      label: "Second",
      status: "active",
      aliases: [],
      questions: [],
    },
  ];
  const issues = validateClarificationLibrary(broken);
  assert.equal(issues.some((i) => i.code === "DUPLICATE_SET_KEY"), true);
  assert.equal(issues.some((i) => i.code === "DUPLICATE_OPTION_KEY"), true);
});

test("validation warns on alias collisions across active sets", () => {
  const colliding: ClarificationQuestionSet[] = [
    {
      key: "a.set",
      version: 1,
      label: "A",
      status: "active",
      aliases: ["service upgrade"],
      questions: [],
    },
    {
      key: "b.set",
      version: 1,
      label: "B",
      status: "active",
      aliases: ["Service Upgrade"],
      questions: [],
    },
  ];
  const issues = validateClarificationLibrary(colliding);
  assert.equal(issues.some((i) => i.code === "ALIAS_COLLISION"), true);

  const dupes = findDuplicateSetCandidates(colliding);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].aKey, "a.set");
  assert.equal(dupes[0].bKey, "b.set");
});

test("merged sets redirect alias resolution to the surviving canonical set", () => {
  const sets: ClarificationQuestionSet[] = [
    {
      key: "old.key",
      version: 1,
      label: "Old service upgrade",
      status: "merged",
      mergedIntoKey: "new.key",
      aliases: ["legacy service upgrade"],
      questions: [],
    },
    {
      key: "new.key",
      version: 2,
      label: "Service upgrade",
      status: "active",
      aliases: ["service upgrade"],
      questions: [],
    },
  ];
  const resolved = resolveActiveSetByAlias("legacy service upgrade", sets);
  assert.equal(resolved?.key, "new.key");
});

test("matchQuestionSetsForLine ignores non-active sets", () => {
  const sets: ClarificationQuestionSet[] = [
    {
      key: "draft.set",
      version: 1,
      label: "Draft service upgrade",
      status: "draft",
      aliases: ["service upgrade"],
      questions: [],
    },
  ];
  const matches = matchQuestionSetsForLine(
    { description: "service upgrade" },
    sets,
    SEED_CLARIFICATION_BINDINGS,
  );
  assert.deepEqual(matches, []);
});

test("weak label overlap is excluded from promoted recommendations at minScore 0.3", () => {
  const sets: ClarificationQuestionSet[] = [
    {
      key: "window.replacement",
      version: 1,
      label: "Window Replacement",
      status: "active",
      aliases: [],
      questions: [],
    },
    {
      key: "window.whole_home",
      version: 1,
      label: "Whole Home Window Package",
      status: "active",
      aliases: ["whole residential window replacement"],
      questions: [],
    },
  ];
  const weakMatches = matchQuestionSetsForLine(
    { description: "Whole Residential Window Replacement" },
    sets,
    [],
    { minScore: 0.15 },
  );
  assert.equal(weakMatches.some((m) => m.questionSetKey === "window.replacement"), true);
  assert.equal(
    weakMatches.some((m) => m.questionSetKey === "window.whole_home"),
    true,
  );

  const promotedMatches = matchQuestionSetsForLine(
    { description: "Whole Residential Window Replacement" },
    sets,
    [],
    { minScore: 0.3 },
  );
  assert.equal(
    promotedMatches.some((m) => m.questionSetKey === "window.replacement"),
    false,
  );
  assert.equal(promotedMatches[0]?.questionSetKey, "window.whole_home");
});

test("strong tag match still promotes at minScore 0.3", () => {
  const matches = selectSeedQuestionSetsForLine(
    {
      description: "MSP swap",
      tagKeys: ["service-upgrade"],
    },
    { minScore: 0.3 },
  );
  assert.equal(matches.length >= 1, true);
  assert.equal(matches[0].questionSetKey, "electrical.service_upgrade");
});
