import {
  Prisma,
  type PlatformAuditActorType,
  type PlatformAuditOutcome,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import type { PlatformContext } from "./platform-types";

export type PlatformAuditInput = {
  action: string;
  targetType: string;
  targetId?: string | null;
  organizationId?: string | null;
  reason?: string | null;
  outcome: PlatformAuditOutcome;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  actorType?: PlatformAuditActorType;
  actorUserId?: string | null;
  actorEmailSnapshot?: string | null;
};

const BOOTSTRAP_METADATA_KEYS = new Set([
  "granteeEmail",
  "role",
  "method",
  "environment",
  "scriptVersion",
  "cause",
]);

const GRANTED_METADATA_KEYS = new Set(["granteeEmail", "role", "method"]);

const BETA_INVITE_AUDIT_METADATA_KEYS = new Set([
  "inviteeEmail",
  "betaDays",
  "aiEnabled",
  "aiIncludedUnits",
  "method",
  "organizationId",
]);

const BETA_GRANT_AUDIT_METADATA_KEYS = new Set(["method", "organizationId"]);

function metadataAllowlistForAction(action: string): Set<string> {
  if (action === "platform.access.bootstrapped" || action === "platform.bootstrap.failed") {
    return BOOTSTRAP_METADATA_KEYS;
  }
  if (action === "platform.access.granted") {
    return GRANTED_METADATA_KEYS;
  }
  if (action.startsWith("platform.beta.invite.")) {
    return BETA_INVITE_AUDIT_METADATA_KEYS;
  }
  if (action.startsWith("platform.beta.grant.")) {
    return BETA_GRANT_AUDIT_METADATA_KEYS;
  }
  return new Set<string>();
}

export function sanitizePlatformAuditMetadata(
  action: string,
  raw: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!raw) return Prisma.JsonNull;

  const allowlist = metadataAllowlistForAction(action);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowlist.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0
    ? (sanitized as Prisma.InputJsonValue)
    : Prisma.JsonNull;
}

function validateActorFields(input: PlatformAuditInput): void {
  const actorType = input.actorType ?? "USER";

  if (actorType === "SYSTEM") {
    if (input.actorUserId != null) {
      throw new Error("SYSTEM audit events must not include actorUserId.");
    }
    return;
  }

  if (!input.actorUserId) {
    throw new Error("USER audit events require actorUserId.");
  }
}

export async function appendPlatformAuditEvent(
  ctx: PlatformContext,
  input: PlatformAuditInput,
  tx: ExtendedTransactionClient = db,
) {
  if (input.action.startsWith("platform.") && input.action.includes("grant") && !input.reason) {
    // privileged mutations require reason in service layer
  }

  validateActorFields({
    ...input,
    actorType: input.actorType ?? "USER",
    actorUserId: input.actorUserId ?? ctx.userId,
    actorEmailSnapshot: input.actorEmailSnapshot ?? ctx.userEmail,
  });

  return tx.platformAuditEvent.create({
    data: {
      actorType: input.actorType ?? "USER",
      actorUserId: input.actorType === "SYSTEM" ? null : (input.actorUserId ?? ctx.userId),
      actorEmailSnapshot:
        input.actorType === "SYSTEM"
          ? null
          : (input.actorEmailSnapshot ?? ctx.userEmail),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      organizationId: input.organizationId ?? null,
      reason: input.reason ?? null,
      outcome: input.outcome,
      requestId: input.requestId ?? ctx.requestId,
      metadataJson: sanitizePlatformAuditMetadata(input.action, input.metadata ?? null),
    },
  });
}

export async function appendSystemPlatformAuditEvent(
  input: PlatformAuditInput,
  tx: ExtendedTransactionClient = db,
) {
  if (input.actorUserId != null) {
    throw new Error("SYSTEM audit events must not include actorUserId.");
  }

  validateActorFields({
    ...input,
    actorType: "SYSTEM",
    actorUserId: null,
    actorEmailSnapshot: null,
  });

  return tx.platformAuditEvent.create({
    data: {
      actorType: "SYSTEM",
      actorUserId: null,
      actorEmailSnapshot: null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      organizationId: input.organizationId ?? null,
      reason: input.reason ?? null,
      outcome: input.outcome,
      requestId: input.requestId ?? null,
      metadataJson: sanitizePlatformAuditMetadata(input.action, input.metadata ?? null),
    },
  });
}

export type PlatformAccessDenialInput = {
  userId?: string | null;
  path?: string;
  cause: "missing_session" | "missing_grant" | "revoked_grant";
  requestId?: string;
};

export function logPlatformAccessDenial(input: PlatformAccessDenialInput): void {
  console.info("[platform-access-denied]", {
    scope: "platform",
    event: "access_denied",
    userId: input.userId ?? null,
    path: input.path ?? null,
    cause: input.cause,
    requestId: input.requestId ?? null,
  });
}
