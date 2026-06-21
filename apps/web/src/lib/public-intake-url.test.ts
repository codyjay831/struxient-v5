import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicIntakeUrl,
  buildPublicIntakeUrlForForm,
} from "./public-intake-url";

test("buildPublicIntakeUrl uses bare company path for default route", () => {
  assert.equal(buildPublicIntakeUrl({ companySlug: "hargen-energy" }), "/request/hargen-energy");
});

test("buildPublicIntakeUrlForForm omits slug for default forms", () => {
  assert.equal(
    buildPublicIntakeUrlForForm({
      companySlug: "hargen-energy",
      formSlug: "electrical-service",
      isDefault: true,
    }),
    "/request/hargen-energy",
  );
});

test("buildPublicIntakeUrlForForm keeps slug for additional forms", () => {
  assert.equal(
    buildPublicIntakeUrlForForm({
      companySlug: "hargen-energy",
      formSlug: "roofing-estimate",
      isDefault: false,
    }),
    "/request/hargen-energy/roofing-estimate",
  );
});
