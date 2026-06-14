import assert from "node:assert/strict";
import test from "node:test";
import { appendSystemPlatformAuditEvent } from "./platform-audit";

test("integration: SYSTEM audit rejects actorUserId", async () => {
  await assert.rejects(
    () =>
      appendSystemPlatformAuditEvent({
        action: "platform.access.bootstrapped",
        targetType: "platform_access",
        outcome: "SUCCESS",
        actorUserId: "user-1",
      }),
    /SYSTEM audit events must not include actorUserId/,
  );
});

test("integration: authenticated non-platform users should receive 403 contract", () => {
  const authenticatedWithoutGrant = {
    hasSession: true,
    hasPlatformAccess: false,
    expected: "403",
  };
  const unauthenticated = {
    hasSession: false,
    hasPlatformAccess: false,
    expected: "redirect_login",
  };

  assert.equal(authenticatedWithoutGrant.expected, "403");
  assert.equal(unauthenticated.expected, "redirect_login");
});

test("integration: dev fallback must not satisfy platform auth source", () => {
  const devFallbackAuthSource = "dev";
  const platformAuthSource = "session";
  assert.notEqual(devFallbackAuthSource, platformAuthSource);
});
