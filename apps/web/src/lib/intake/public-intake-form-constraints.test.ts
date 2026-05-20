import assert from "node:assert/strict";
import test from "node:test";
import { LeadChannel } from "@prisma/client";
import {
  normalizePublicIntakeFormSlug,
  publicIntakeCreateDefaults,
} from "./public-intake-form-constraints";

test("normalizePublicIntakeFormSlug accepts valid slug", () => {
  assert.equal(normalizePublicIntakeFormSlug("Roofing-Estimate"), "roofing-estimate");
});

test("normalizePublicIntakeFormSlug rejects invalid slug", () => {
  assert.equal(normalizePublicIntakeFormSlug("Roofing Estimate"), null);
  assert.equal(normalizePublicIntakeFormSlug(""), null);
});

test("publicIntakeCreateDefaults enforces public web form settings", () => {
  const defaults = publicIntakeCreateDefaults();
  assert.equal(defaults.channel, LeadChannel.WEB_FORM);
  assert.equal(defaults.isPublic, true);
});
