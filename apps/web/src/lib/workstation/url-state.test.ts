import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkstationUrl,
  parseWorkstationUrlState,
  serializeWorkstationUrlState,
  type WorkstationUrlState,
} from "./url-state";

const baseState: WorkstationUrlState = {
  v: 1,
  lens: "today",
  filter: "quotes",
  selected: { id: "quote-1", kind: "quote" },
};

test("serializeWorkstationUrlState includes selected fields when present", () => {
  const query = serializeWorkstationUrlState(baseState);
  assert.match(query, /selectedId=quote-1/);
  assert.match(query, /selectedKind=quote/);
});

test("buildWorkstationUrl clears selected when set to undefined", () => {
  const query = buildWorkstationUrl(baseState, { selected: undefined });
  assert.equal(query, "?v=1&lens=today&filter=quotes");
});

test("buildWorkstationUrl preserves lens/filter while clearing selected", () => {
  const query = buildWorkstationUrl(baseState, {
    lens: "waiting",
    filter: "tasks",
    selected: undefined,
  });
  assert.equal(query, "?v=1&lens=waiting&filter=tasks");
});

test("parseWorkstationUrlState ignores selection when one key is missing", () => {
  const parsed = parseWorkstationUrlState(
    new URLSearchParams("v=1&lens=today&filter=quotes&selectedId=quote-1"),
  );
  assert.equal(parsed.selected, undefined);
});
