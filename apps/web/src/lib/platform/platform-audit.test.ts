import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  logPlatformAccessDenial,
  sanitizePlatformAuditMetadata,
} from "./platform-audit";

test("sanitizePlatformAuditMetadata strips unknown bootstrap keys", () => {
  const result = sanitizePlatformAuditMetadata("platform.access.bootstrapped", {
    granteeEmail: "ops@example.com",
    role: "OPERATOR",
    method: "bootstrap_script",
    passwordHash: "secret",
    token: "abc",
  });

  assert.notEqual(result, Prisma.JsonNull);
  assert.deepEqual(result, {
    granteeEmail: "ops@example.com",
    role: "OPERATOR",
    method: "bootstrap_script",
  });
});

test("sanitizePlatformAuditMetadata returns JsonNull for empty input", () => {
  assert.equal(sanitizePlatformAuditMetadata("platform.access.granted", null), Prisma.JsonNull);
});

test("sanitizePlatformAuditMetadata allowlists granted metadata only", () => {
  const result = sanitizePlatformAuditMetadata("platform.access.granted", {
    granteeEmail: "ops@example.com",
    role: "OPERATOR",
    method: "platform_ui",
    before: { revokedAt: null },
  });

  assert.deepEqual(result, {
    granteeEmail: "ops@example.com",
    role: "OPERATOR",
    method: "platform_ui",
  });
});

test("appendPlatformAuditEvent rejects USER events without actor identity", async () => {
  const { appendPlatformAuditEvent } = await import("./platform-audit");

  await assert.rejects(
    () =>
      appendPlatformAuditEvent(
        {
          userId: "",
          userEmail: null,
          platformAccessId: "access-1",
          role: "OPERATOR",
          authSource: "session",
          requestId: "req-1",
        },
        {
          action: "platform.access.granted",
          targetType: "platform_access",
          outcome: "SUCCESS",
          actorType: "USER",
          actorUserId: null,
        },
      ),
    /USER audit events require actorUserId/,
  );
});

test("logPlatformAccessDenial emits structured payload", () => {
  const original = console.info;
  let captured: unknown;
  console.info = (...args: unknown[]) => {
    captured = args[1];
  };

  try {
    logPlatformAccessDenial({
      cause: "missing_grant",
      userId: "user-1",
      path: "/platform",
      requestId: "req-1",
    });

    assert.deepEqual(captured, {
      scope: "platform",
      event: "access_denied",
      userId: "user-1",
      path: "/platform",
      cause: "missing_grant",
      requestId: "req-1",
    });
  } finally {
    console.info = original;
  }
});
