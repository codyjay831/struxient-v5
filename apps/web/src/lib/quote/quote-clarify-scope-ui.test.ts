import assert from "node:assert/strict";
import test from "node:test";
import {
  QUOTE_SEND_READINESS_HEADING,
  lineClarifyActionLabel,
} from "./quote-clarify-scope-ui";

test("lineClarifyActionLabel shows Clarify (N) when send-blocking gaps exist", () => {
  assert.equal(lineClarifyActionLabel(0), "Clarify scope");
  assert.equal(lineClarifyActionLabel(1), "Clarify (1)");
  assert.equal(lineClarifyActionLabel(3), "Clarify (3)");
});

test("primary quote readiness heading is not deprecated Scope Details Needed copy", () => {
  assert.notEqual(QUOTE_SEND_READINESS_HEADING.toLowerCase(), "scope details needed");
});
