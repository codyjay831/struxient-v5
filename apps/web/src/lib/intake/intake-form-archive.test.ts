import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel } from "@prisma/client";
import {
  canArchiveSpecializedIntakeForm,
  canRestoreSpecializedIntakeForm,
} from "./intake-form-archive";

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

test("canRestoreSpecializedIntakeForm allows non-default public WEB_FORM", () => {
  assert.equal(
    canRestoreSpecializedIntakeForm({
      isDefault: false,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
    }),
    true,
  );
});

test("canRestoreSpecializedIntakeForm rejects primary customer form", () => {
  assert.equal(
    canRestoreSpecializedIntakeForm({
      isDefault: true,
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
    }),
    false,
  );
});

test("canRestoreSpecializedIntakeForm rejects office intake forms", () => {
  assert.equal(
    canRestoreSpecializedIntakeForm({
      isDefault: false,
      channel: LeadChannel.MANUAL,
      isPublic: false,
    }),
    false,
  );
});
