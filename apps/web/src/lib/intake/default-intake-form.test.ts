import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INTAKE_FORM_DEFINITION,
  isSyntheticDefaultIntakeFormDefinitionId,
  SYNTHETIC_DEFAULT_INTAKE_FORM_ID,
} from "./default-intake-form";

test("isSyntheticDefaultIntakeFormDefinitionId marks synthetic fallback id", () => {
  assert.equal(
    isSyntheticDefaultIntakeFormDefinitionId(SYNTHETIC_DEFAULT_INTAKE_FORM_ID),
    true,
  );
  assert.equal(isSyntheticDefaultIntakeFormDefinitionId("clxyz123"), false);
});

test("DEFAULT_INTAKE_FORM_DEFINITION uses synthetic id", () => {
  assert.equal(DEFAULT_INTAKE_FORM_DEFINITION.id, SYNTHETIC_DEFAULT_INTAKE_FORM_ID);
});
