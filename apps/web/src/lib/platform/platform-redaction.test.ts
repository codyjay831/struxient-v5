import assert from "node:assert/strict";
import test from "node:test";
import { PlatformAuditOutcome } from "@prisma/client";
import { toRedactedAiFailure, toRedactedNotificationFailure } from "./platform-redaction";

const FORBIDDEN_AI_KEYS = [
  "requestPayload",
  "responsePayload",
  "passwordHash",
  "token",
  "authorization",
  "cookie",
];

const FORBIDDEN_NOTIFICATION_KEYS = ["body", "payloadJson", "passwordHash", "token"];

test("redacted AI failure DTO omits raw payload fields", () => {
  const dto = toRedactedAiFailure({
    id: "ai-1",
    feature: "quote_scope",
    provider: "openai",
    model: "gpt-4",
    status: "error",
    errorMessage: "Provider timeout",
    createdAt: new Date(),
  });

  for (const key of FORBIDDEN_AI_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(dto, key), false, `forbidden key: ${key}`);
  }

  assert.deepEqual(Object.keys(dto).sort(), [
    "createdAt",
    "errorMessage",
    "feature",
    "id",
    "model",
    "provider",
    "status",
  ]);
});

test("redacted notification failure DTO omits provider payload fields", () => {
  const dto = toRedactedNotificationFailure({
    id: "n-1",
    kind: "email",
    title: "Quote sent",
    errorMessage: "SMTP failure",
    createdAt: new Date(),
  });

  for (const key of FORBIDDEN_NOTIFICATION_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(dto, key), false, `forbidden key: ${key}`);
  }
});

test("normalizePlatformAuditFilters rejects invalid outcome values", async () => {
  const { normalizePlatformAuditFilters } = await import("./platform-audit-query");

  const normalized = normalizePlatformAuditFilters({
    outcome: "DROP TABLE" as PlatformAuditOutcome,
    action: "  platform.access.bootstrapped  ",
    page: -1,
    pageSize: 999,
  });

  assert.equal(normalized.outcome, undefined);
  assert.equal(normalized.action, "platform.access.bootstrapped");
  assert.equal(normalized.page, 1);
  assert.equal(normalized.pageSize, 50);
});
