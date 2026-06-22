import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel } from "@prisma/client";
import { canArchiveSpecializedIntakeForm } from "./intake-form-archive";

test("canArchiveSpecializedIntakeForm allows non-default public WEB_FORM", () => {
  assert.equal(
    canArchiveSpecializedIntakeForm({
      isDefault: false,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
    }),
    true,
  );
});

test("canArchiveSpecializedIntakeForm rejects default customer form", () => {
  assert.equal(
    canArchiveSpecializedIntakeForm({
      isDefault: true,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
    }),
    false,
  );
});

test("canArchiveSpecializedIntakeForm rejects office intake forms", () => {
  assert.equal(
    canArchiveSpecializedIntakeForm({
      isDefault: false,
      channel: LeadChannel.MANUAL,
      isPublic: false,
    }),
    false,
  );
});
