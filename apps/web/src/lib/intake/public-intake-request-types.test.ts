import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import {
  readPublicRequestTypeOptionsFromTriageRules,
  resolvePublicFormRequestTypeOptions,
} from "./public-intake-request-types";

test("resolvePublicFormRequestTypeOptions prefers per-form triageRules", () => {
  const options = resolvePublicFormRequestTypeOptions(
    { requestTypeOptions: [{ value: "hvac", label: "HVAC service" }] },
    [{ value: "repair", label: "Repair" }],
  );
  assert.deepEqual(options, [{ value: "hvac", label: "HVAC service" }]);
});

test("resolvePublicFormRequestTypeOptions falls back to legacy settings", () => {
  const options = resolvePublicFormRequestTypeOptions(null, [
    { value: "repair", label: "Repair" },
  ]);
  assert.deepEqual(options, [{ value: "repair", label: "Repair" }]);
});

test("resolvePublicFormRequestTypeOptions falls back to code defaults", () => {
  const options = resolvePublicFormRequestTypeOptions(null, null);
  assert.deepEqual(options, DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS);
});

test("readPublicRequestTypeOptionsFromTriageRules returns null when empty", () => {
  assert.equal(readPublicRequestTypeOptionsFromTriageRules({}), null);
});
