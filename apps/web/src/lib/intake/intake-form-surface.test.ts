import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel } from "@prisma/client";
import {
  formBelongsToIntakeSurface,
  OFFICE_INTAKE_FORM_WHERE,
  PUBLIC_INTAKE_FORM_WHERE,
} from "./intake-form-surface";

test("PUBLIC_INTAKE_FORM_WHERE matches WEB_FORM public forms", () => {
  assert.equal(PUBLIC_INTAKE_FORM_WHERE.channel, LeadChannel.WEB_FORM);
  assert.equal(PUBLIC_INTAKE_FORM_WHERE.isPublic, true);
});

test("OFFICE_INTAKE_FORM_WHERE matches MANUAL private forms", () => {
  assert.equal(OFFICE_INTAKE_FORM_WHERE.channel, LeadChannel.MANUAL);
  assert.equal(OFFICE_INTAKE_FORM_WHERE.isPublic, false);
});

test("formBelongsToIntakeSurface classifies public and office families", () => {
  assert.equal(
    formBelongsToIntakeSurface(
      { channel: LeadChannel.WEB_FORM, isPublic: true },
      "public",
    ),
    true,
  );
  assert.equal(
    formBelongsToIntakeSurface(
      { channel: LeadChannel.WEB_FORM, isPublic: true },
      "office",
    ),
    false,
  );
  assert.equal(
    formBelongsToIntakeSurface(
      { channel: LeadChannel.MANUAL, isPublic: false },
      "office",
    ),
    true,
  );
  assert.equal(
    formBelongsToIntakeSurface(
      { channel: LeadChannel.MANUAL, isPublic: true },
      "office",
    ),
    false,
  );
});
