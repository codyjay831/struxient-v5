import assert from "node:assert/strict";
import test from "node:test";
import { getResendFromAddress, getResendFromEmail } from "./resend-from";

test("getResendFromAddress uses defaults when env unset", () => {
  const prevEmail = process.env.RESEND_FROM_EMAIL;
  const prevName = process.env.RESEND_FROM_NAME;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.RESEND_FROM_NAME;
  try {
    assert.equal(getResendFromAddress(), "Struxient <notifications@struxient.com>");
    assert.equal(getResendFromEmail(), "notifications@struxient.com");
  } finally {
    if (prevEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = prevEmail;
    if (prevName === undefined) delete process.env.RESEND_FROM_NAME;
    else process.env.RESEND_FROM_NAME = prevName;
  }
});

test("getResendFromAddress respects env overrides", () => {
  const prevEmail = process.env.RESEND_FROM_EMAIL;
  const prevName = process.env.RESEND_FROM_NAME;
  process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev";
  process.env.RESEND_FROM_NAME = "Demo Co";
  try {
    assert.equal(getResendFromAddress(), "Demo Co <onboarding@resend.dev>");
  } finally {
    if (prevEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = prevEmail;
    if (prevName === undefined) delete process.env.RESEND_FROM_NAME;
    else process.env.RESEND_FROM_NAME = prevName;
  }
});
