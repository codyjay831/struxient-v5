"use server";

import { revalidatePath } from "next/cache";
import { getPlatformContext } from "@/lib/platform/platform-context";
import {
  createPlatformBetaInvite,
  revokePlatformBetaGrant,
  revokePlatformBetaInvite,
} from "@/lib/platform/platform-beta-access";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 25;

export type BetaAccessActionResult =
  | { ok: true; inviteUrl?: string }
  | { ok: false; error: string };

export async function createBetaInviteAction(formData: FormData): Promise<BetaAccessActionResult> {
  const ctx = await getPlatformContext();
  const allowed = await checkRateLimit(`${ctx.userId}:beta-invite`, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    keyPrefix: "platform-beta-invite",
  });
  if (!allowed) {
    return { ok: false, error: "Too many beta invites created recently. Try again later." };
  }

  const email = String(formData.get("email") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const betaDaysRaw = String(formData.get("betaDays") ?? "").trim();
  const aiEnabled = formData.get("aiEnabled") === "on";
  const aiIncludedUnitsRaw = String(formData.get("aiIncludedUnits") ?? "").trim();

  if (!reason) {
    return { ok: false, error: "A reason is required for audit." };
  }

  const betaDays = betaDaysRaw ? Number.parseInt(betaDaysRaw, 10) : undefined;
  const aiIncludedUnits = aiIncludedUnitsRaw ? Number.parseInt(aiIncludedUnitsRaw, 10) : undefined;

  try {
    const result = await createPlatformBetaInvite(ctx, {
      email,
      betaDays,
      aiEnabled,
      aiIncludedUnits,
      reason,
    });
    revalidatePath("/platform/beta-access");
    return { ok: true, inviteUrl: result.inviteUrl };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create beta invite.",
    };
  }
}

export async function revokeBetaInviteAction(inviteId: string, reason: string): Promise<BetaAccessActionResult> {
  const ctx = await getPlatformContext();
  if (!reason.trim()) {
    return { ok: false, error: "A reason is required for audit." };
  }

  try {
    await revokePlatformBetaInvite(ctx, inviteId, reason.trim());
    revalidatePath("/platform/beta-access");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not revoke beta invite.",
    };
  }
}

export async function revokeBetaGrantAction(grantId: string, reason: string): Promise<BetaAccessActionResult> {
  const ctx = await getPlatformContext();
  if (!reason.trim()) {
    return { ok: false, error: "A reason is required for audit." };
  }

  try {
    await revokePlatformBetaGrant(ctx, grantId, reason.trim());
    revalidatePath("/platform/beta-access");
    revalidatePath("/platform/organizations");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not revoke beta grant.",
    };
  }
}
