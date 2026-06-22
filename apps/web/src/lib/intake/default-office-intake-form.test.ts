import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS } from "./default-office-intake-form";
import { parseOfficeRequestTypeOptionsFromTriageRules } from "./default-office-intake-form";

test("parseOfficeRequestTypeOptionsFromTriageRules reads triageRules", () => {
  const options = parseOfficeRequestTypeOptionsFromTriageRules({
    requestTypeOptions: [{ value: "bid", label: "Bid request" }],
  });
  assert.deepEqual(options, [{ value: "bid", label: "Bid request" }]);
});

test("parseOfficeRequestTypeOptionsFromTriageRules returns null when missing", () => {
  assert.equal(parseOfficeRequestTypeOptionsFromTriageRules(null), null);
});

test("parseOfficeRequestTypeOptionsFromTriageRules does not use code defaults at runtime", () => {
  const options = parseOfficeRequestTypeOptionsFromTriageRules(null);
  assert.notDeepEqual(options, DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS);
  assert.equal(options, null);
});

test("provisioned default office triageRules resolve at runtime", () => {
  const options = parseOfficeRequestTypeOptionsFromTriageRules({
    requestTypeOptions: DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS,
  });
  assert.deepEqual(options, DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS);
});
