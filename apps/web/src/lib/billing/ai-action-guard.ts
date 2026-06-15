import { assertCanUseAi, BillingEntitlementError } from "./billing-entitlement";
import { runMeteredAiCall, type AiMeteringContext } from "./ai-metering";

export type AiActionErrorResult = {
  ok: false;
  error: string;
  billingPath?: string;
  code?: "BILLING_REQUIRED" | "AI_BLOCKED" | "PAST_DUE";
};

export type AiActionSuccessResult<T> = {
  ok: true;
  data: T;
  usageLogId: string;
  isOverage: boolean;
};

export type AiActionResult<T> = AiActionSuccessResult<T> | AiActionErrorResult;

export function mapAiBillingError(error: unknown): AiActionErrorResult | null {
  if (error instanceof BillingEntitlementError) {
    return {
      ok: false,
      error: error.message,
      billingPath: error.billingPath,
      code: error.code,
    };
  }
  return null;
}

export async function runOrganizationAiAction<T>(params: {
  ctx: AiMeteringContext;
  execute: (usageLogId: string) => Promise<{
    result: T;
    responseChars?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostCents?: number;
    responsePayload?: import("@prisma/client").Prisma.InputJsonValue;
    legacyBillableUnits?: number;
  }>;
}): Promise<AiActionResult<T>> {
  try {
    const metered = await runMeteredAiCall({
      ctx: params.ctx,
      execute: async (usageLogId) => {
        const executed = await params.execute(usageLogId);
        return executed;
      },
    });
    return {
      ok: true,
      data: metered.result,
      usageLogId: metered.usageLogId,
      isOverage: metered.isOverage,
    };
  } catch (error) {
    const billingError = mapAiBillingError(error);
    if (billingError) return billingError;
    throw error;
  }
}

export async function preflightAiUsage(
  organizationId: string,
  feature: string,
): Promise<AiActionErrorResult | null> {
  try {
    await assertCanUseAi(organizationId, feature);
    return null;
  } catch (error) {
    return mapAiBillingError(error);
  }
}

export { BillingEntitlementError };
