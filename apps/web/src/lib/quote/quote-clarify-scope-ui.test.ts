import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPRECATED_SCOPE_DETAILS_NEEDED_TITLE,
  LEGACY_GAP_HANDLING_LABEL,
  QUOTE_SEND_READINESS_HEADING,
  isDeprecatedScopeDetailsNeededTitle,
  lineClarifyActionLabel,
  shouldShowLegacyGapHandling,
} from "./quote-clarify-scope-ui";

test("lineClarifyActionLabel shows Clarify (N) when send-blocking gaps exist", () => {
  assert.equal(lineClarifyActionLabel(0), "Clarify scope");
  assert.equal(lineClarifyActionLabel(1), "Clarify (1)");
  assert.equal(lineClarifyActionLabel(3), "Clarify (3)");
});

test("primary quote readiness heading is not deprecated Scope Details Needed copy", () => {
  assert.notEqual(QUOTE_SEND_READINESS_HEADING.toLowerCase(), "scope details needed");
  assert.equal(isDeprecatedScopeDetailsNeededTitle(QUOTE_SEND_READINESS_HEADING), false);
  assert.equal(isDeprecatedScopeDetailsNeededTitle(DEPRECATED_SCOPE_DETAILS_NEEDED_TITLE), true);
});

test("legacy gap handling remains available while OPEN records exist", () => {
  assert.equal(shouldShowLegacyGapHandling(0), false);
  assert.equal(shouldShowLegacyGapHandling(2), true);
  assert.match(LEGACY_GAP_HANDLING_LABEL, /legacy gap handling/i);
});
