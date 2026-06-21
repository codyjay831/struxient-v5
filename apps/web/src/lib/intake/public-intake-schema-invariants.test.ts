import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_INTAKE_FORM_SCHEMA } from "./default-intake-form";
import { ELECTRICAL_SERVICE_STARTER } from "./trade-starters/electrical-service";
import { PLUMBING_EMERGENCY_STARTER } from "./trade-starters/plumbing-emergency";
import {
  PUBLIC_FORM_MISSING_REQUEST_TYPE_ERROR,
  PUBLIC_SERVICE_CATEGORY_REQUIRED_MESSAGE,
  normalizePublicIntakeSchema,
  publicIntakeSchemaIncludesRequestType,
  validatePublicIntakeSchema,
} from "./public-intake-schema-invariants";

test("publicIntakeSchemaIncludesRequestType detects request.type atom", () => {
  assert.equal(publicIntakeSchemaIncludesRequestType(DEFAULT_INTAKE_FORM_SCHEMA), true);
  assert.equal(
    publicIntakeSchemaIncludesRequestType(ELECTRICAL_SERVICE_STARTER.schema),
    true,
  );
});

test("validatePublicIntakeSchema rejects schemas missing request.type", () => {
  const broken = {
    sections: [
      {
        key: "service",
        title: "Service Details",
        fields: [{ key: "address.service" }, { key: "scope.text" }],
      },
    ],
  };
  const result = validatePublicIntakeSchema(broken);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, PUBLIC_FORM_MISSING_REQUEST_TYPE_ERROR);
});

test("normalizePublicIntakeSchema inserts request.type before scope.text", () => {
  const broken = {
    sections: [
      {
        key: "service",
        title: "Service Details",
        fields: [{ key: "address.service" }, { key: "scope.text" }],
      },
    ],
  };
  const normalized = normalizePublicIntakeSchema(broken);
  assert.equal(publicIntakeSchemaIncludesRequestType(normalized), true);
  assert.deepEqual(normalized.sections[0].fields.map((field) => field.key), [
    "address.service",
    "request.type",
    "scope.text",
  ]);
});

test("trade starters include request.type", () => {
  assert.equal(publicIntakeSchemaIncludesRequestType(PLUMBING_EMERGENCY_STARTER.schema), true);
  assert.equal(publicIntakeSchemaIncludesRequestType(ELECTRICAL_SERVICE_STARTER.schema), true);
});

test("PUBLIC_SERVICE_CATEGORY_REQUIRED_MESSAGE is customer-facing", () => {
  assert.match(PUBLIC_SERVICE_CATEGORY_REQUIRED_MESSAGE, /service category/i);
});
