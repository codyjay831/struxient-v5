import assert from "node:assert/strict";
import test from "node:test";
import { resolveIntakeFormSlugOnCreate } from "./intake-form-slug-create";

test("resolveIntakeFormSlugOnCreate returns create when slug is unused", () => {
  assert.equal(resolveIntakeFormSlugOnCreate(null), "create");
});

test("resolveIntakeFormSlugOnCreate returns error_active for active slug", () => {
  assert.equal(
    resolveIntakeFormSlugOnCreate({ archivedAt: null, isDefault: false }),
    "error_active",
  );
});

test("resolveIntakeFormSlugOnCreate returns error_active for primary slug", () => {
  assert.equal(
    resolveIntakeFormSlugOnCreate({ archivedAt: new Date(), isDefault: true }),
    "error_active",
  );
});

test("resolveIntakeFormSlugOnCreate returns restore_archived for archived additional slug", () => {
  assert.equal(
    resolveIntakeFormSlugOnCreate({ archivedAt: new Date(), isDefault: false }),
    "restore_archived",
  );
});
