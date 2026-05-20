import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS,
  parseOfficeRequestTypeOptionsFromTriageRules,
} from "./default-office-intake-form";

test("parseOfficeRequestTypeOptionsFromTriageRules falls back to defaults", () => {
  const options = parseOfficeRequestTypeOptionsFromTriageRules(null);
  assert.equal(options.length, DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS.length);
  assert.equal(options[0]?.value, "repair");
});

test("parseOfficeRequestTypeOptionsFromTriageRules reads triageRules", () => {
  const options = parseOfficeRequestTypeOptionsFromTriageRules({
    requestTypeOptions: [{ value: "bid", label: "Bid request" }],
  });
  assert.deepEqual(options, [{ value: "bid", label: "Bid request" }]);
});
