import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { sanitizePlatformAuditMetadata } from "@/lib/platform/platform-audit";
import {
  canBetaGrantUseAi,
  getBetaGrantRemainingAiUnits,
  isBetaGrantActive,
} from "@/lib/beta/beta-grant";
import { betaInviteMatchesEmail } from "@/lib/beta/beta-signup-invite";

test("isBetaGrantActive returns false for revoked or expired grants", () => {
  assert.equal(
    isBetaGrantActive({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    isBetaGrantActive({
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
    }),
    false,
  );
  assert.equal(
    isBetaGrantActive({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    }),
    true,
  );
});

test("beta AI helpers respect enabled flag and allowance", () => {
  const grant = { aiEnabled: true, aiIncludedUnits: 10, usedAiUnits: 7 };
  assert.equal(getBetaGrantRemainingAiUnits(grant), 3);
  assert.equal(canBetaGrantUseAi(grant), true);

  const exhausted = { aiEnabled: true, aiIncludedUnits: 10, usedAiUnits: 10 };
  assert.equal(canBetaGrantUseAi(exhausted), false);

  const disabled = { aiEnabled: false, aiIncludedUnits: 10, usedAiUnits: 0 };
  assert.equal(canBetaGrantUseAi(disabled), false);
});

test("betaInviteMatchesEmail is case-insensitive", () => {
  assert.equal(
    betaInviteMatchesEmail({ normalizedEmail: "beta@example.com" }, "Beta@Example.com"),
    true,
  );
  assert.equal(
    betaInviteMatchesEmail({ normalizedEmail: "beta@example.com" }, "other@example.com"),
    false,
  );
});

test("sanitizePlatformAuditMetadata allowlists beta invite metadata", () => {
  const result = sanitizePlatformAuditMetadata("platform.beta.invite.created", {
    inviteeEmail: "beta@example.com",
    betaDays: 30,
    aiEnabled: true,
    aiIncludedUnits: 50,
    method: "platform_ui",
    token: "secret",
  });

  assert.notEqual(result, Prisma.JsonNull);
  assert.deepEqual(result, {
    inviteeEmail: "beta@example.com",
    betaDays: 30,
    aiEnabled: true,
    aiIncludedUnits: 50,
    method: "platform_ui",
  });
});

test("sanitizePlatformAuditMetadata allowlists beta grant metadata", () => {
  const result = sanitizePlatformAuditMetadata("platform.beta.grant.revoked", {
    method: "platform_ui",
    organizationId: "org_123",
    passwordHash: "secret",
  });

  assert.deepEqual(result, {
    method: "platform_ui",
    organizationId: "org_123",
  });
});
