import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClarificationQuestionSetSummaries,
  type ClarificationSetSummarySource,
} from "./clarification-repository";

test("buildClarificationQuestionSetSummaries keeps latest key rows and sorts by label", () => {
  const rows: ClarificationSetSummarySource[] = [
    {
      key: "solar.installation",
      label: "Solar install",
      description: "old version",
      aliases: ["pv install"],
      keywords: ["solar"],
      questionCount: 3,
      tagNames: ["Solar"],
    },
    {
      key: "solar.installation",
      label: "Solar install v2",
      description: "new version",
      aliases: ["pv install"],
      keywords: ["solar"],
      questionCount: 5,
      tagNames: ["Solar"],
    },
    {
      key: "battery.storage",
      label: "Battery storage",
      description: "battery questions",
      aliases: ["ess"],
      keywords: ["battery backup"],
      questionCount: 4,
      tagNames: ["Battery"],
    },
  ];

  const summaries = buildClarificationQuestionSetSummaries(rows);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].key, "battery.storage");
  assert.equal(summaries[1].key, "solar.installation");
  assert.equal(summaries[1].label, "Solar install");
});

test("buildClarificationQuestionSetSummaries searches aliases, tags, and keywords", () => {
  const rows: ClarificationSetSummarySource[] = [
    {
      key: "electrical.panel",
      label: "Electrical panel",
      description: "service upgrade",
      aliases: ["msp upgrade"],
      keywords: ["200a"],
      questionCount: 6,
      tagNames: ["Electrical"],
    },
    {
      key: "battery.storage",
      label: "Battery storage",
      description: "backup scope",
      aliases: ["energy storage system"],
      keywords: ["backup"],
      questionCount: 4,
      tagNames: ["Battery Backup"],
    },
  ];

  assert.equal(buildClarificationQuestionSetSummaries(rows, { query: "msp" }).length, 1);
  assert.equal(buildClarificationQuestionSetSummaries(rows, { query: "battery" }).length, 1);
  assert.equal(buildClarificationQuestionSetSummaries(rows, { query: "200a" }).length, 1);
});

test("buildClarificationQuestionSetSummaries applies sensible limits", () => {
  const rows: ClarificationSetSummarySource[] = Array.from({ length: 8 }, (_, i) => ({
    key: `set.${i}`,
    label: `Set ${i}`,
    description: null,
    aliases: [],
    keywords: [],
    questionCount: 1,
    tagNames: [],
  }));

  const summaries = buildClarificationQuestionSetSummaries(rows, { limit: 3 });
  assert.equal(summaries.length, 3);
});
