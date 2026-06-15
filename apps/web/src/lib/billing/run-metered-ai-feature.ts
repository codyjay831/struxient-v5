import type { AiMeteringContext } from "@/lib/billing/ai-metering";
import { runOrganizationAiAction } from "@/lib/billing/ai-action-guard";
import type { AiMeteringMetadata } from "@/lib/ai/ai-metering-types";
import { meteringToExecuteResult } from "@/lib/ai/ai-metering-types";

export type RunMeteredAiFeatureParams<T> = {
  ctx: AiMeteringContext;
  promptChars?: number;
  run: () => Promise<{
    result: T;
    metering: AiMeteringMetadata;
    responseChars?: number;
    legacyBillableUnits?: number;
  }>;
};

export async function runMeteredAiFeature<T>(
  params: RunMeteredAiFeatureParams<T>,
): Promise<
  | { ok: true; data: T; usageLogId: string; isOverage: boolean }
  | { ok: false; error: string; billingPath?: string; code?: string }
> {
  const metered = await runOrganizationAiAction({
    ctx: {
      ...params.ctx,
      promptChars: params.promptChars ?? params.ctx.promptChars,
    },
    execute: async () => {
      const executed = await params.run();
      const meteringResult = meteringToExecuteResult(executed.metering);
      return {
        result: executed.result,
        responseChars: executed.responseChars,
        inputTokens: meteringResult.inputTokens,
        outputTokens: meteringResult.outputTokens,
        estimatedCostCents: meteringResult.estimatedCostCents,
        responsePayload: meteringResult.responsePayload,
        legacyBillableUnits: executed.legacyBillableUnits,
      };
    },
  });

  if (!metered.ok) {
    return metered;
  }

  return {
    ok: true,
    data: metered.data,
    usageLogId: metered.usageLogId,
    isOverage: metered.isOverage,
  };
}

export function getDefaultGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

export function buildAiMeteringContext(params: {
  organizationId: string;
  feature: string;
  requestKind: string;
  promptChars?: number;
  serviceLocationId?: string | null;
}): AiMeteringContext {
  return {
    organizationId: params.organizationId,
    feature: params.feature,
    provider: "gemini",
    model: getDefaultGeminiModelName(),
    requestKind: params.requestKind,
    promptChars: params.promptChars,
    serviceLocationId: params.serviceLocationId,
  };
}
