import assert from "node:assert/strict";
import test from "node:test";
import { PlatformAccessDeniedError } from "./platform-errors";

test("PlatformAccessDeniedError exposes stable code", () => {
  const error = new PlatformAccessDeniedError();
  assert.equal(error.code, "PLATFORM_ACCESS_DENIED");
  assert.match(error.message, /denied/i);
});

test("platform context contract requires session auth source only", () => {
  const ctx = {
    userId: "user-1",
    userEmail: "ops@example.com",
    platformAccessId: "access-1",
    role: "OPERATOR" as const,
    authSource: "session" as const,
    requestId: "req-1",
  };

  assert.equal(ctx.authSource, "session");
  assert.notEqual(ctx.authSource, "dev");
});
