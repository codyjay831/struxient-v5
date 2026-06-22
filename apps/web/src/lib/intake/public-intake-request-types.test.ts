import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import { DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS } from "@/lib/intake/default-office-intake-form";
import {
  readPublicRequestTypeOptionsFromTriageRules,
  resolvePublicFormRequestTypeOptions,
} from "./public-intake-request-types";

test("resolvePublicFormRequestTypeOptions returns options from triageRules", () => {
  const options = resolvePublicFormRequestTypeOptions({
    requestTypeOptions: [{ value: "hvac", label: "HVAC service" }],
  });
  assert.deepEqual(options, [{ value: "hvac", label: "HVAC service" }]);
});

test("resolvePublicFormRequestTypeOptions returns null when triageRules missing", () => {
  assert.equal(resolvePublicFormRequestTypeOptions(null), null);
});

test("resolvePublicFormRequestTypeOptions returns null when requestTypeOptions empty", () => {
  assert.equal(resolvePublicFormRequestTypeOptions({ requestTypeOptions: [] }), null);
});

test("resolvePublicFormRequestTypeOptions does not use code defaults at runtime", () => {
  const options = resolvePublicFormRequestTypeOptions(null);
  assert.notDeepEqual(options, DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS);
  assert.equal(options, null);
});

test("provisioned default public triageRules resolve at runtime", () => {
  const options = resolvePublicFormRequestTypeOptions({
    requestTypeOptions: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  });
  assert.deepEqual(options, DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS);
  assert.ok(options && options.length > 0);
});

test("readPublicRequestTypeOptionsFromTriageRules returns null when empty", () => {
  assert.equal(readPublicRequestTypeOptionsFromTriageRules({}), null);
});

test("provision constants differ between public and office defaults", () => {
  assert.notDeepEqual(DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS, DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS);
});
