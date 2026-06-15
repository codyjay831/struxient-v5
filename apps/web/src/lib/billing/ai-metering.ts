import type { AiUsageBillableStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { recordBetaGrantAiUsage } from "@/lib/beta/beta-grant";
import { estimateGeminiCostCents } from "./billing-ai-cost-config";
import { isAiMeteringShadowMode } from "./ai-metering-config";
import { assertCanUseAi, getOrganizationEntitlement } from "./billing-entitlement";
import {
  computeBillableUnits,
  getCurrentAiBillingPeriod,
  recordAiUsageAgainstPeriod,
} from "./billing-periods";

export type AiMeteringContext = {
  organizationId: string;
  feature: string;
  provider: string;
  model: string;
  requestKind: string;
  serviceLocationId?: string | null;
  promptChars?: number;
  requestPayload?: Prisma.InputJsonValue;
};

export type AiMeteringResult<T> = {
  result: T;
  usageLogId: string;
  billableStatus: AiUsageBillableStatus | null;
  billableUnits: number;
  isOverage: boolean;
  shadowMode: boolean;
};

export type AiMeteringExecuteResult<T> = {
  result: T;
  responseChars?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostCents?: number;
  responsePayload?: Prisma.InputJsonValue;
  /** Legacy billing path units (char proxy / min-1) for shadow comparison. */
  legacyBillableUnits?: number;
};

export async function runMeteredAiCall<T>(params: {
  ctx: AiMeteringContext;
  execute: (usageLogId: string) => Promise<AiMeteringExecuteResult<T>>;
}): Promise<AiMeteringResult<T>> {
  await assertCanUseAi(params.ctx.organizationId, params.ctx.feature);

  const shadowMode = isAiMeteringShadowMode();
  const entitlement = await getOrganizationEntitlement(params.ctx.organizationId);
  const period =
    entitlement.accessSource === "stripe"
      ? await getCurrentAiBillingPeriod(params.ctx.organizationId)
      : null;

  const usage = await db.aiUsageLog.create({
    data: {
      organizationId: params.ctx.organizationId,
      serviceLocationId: params.ctx.serviceLocationId ?? null,
      feature: params.ctx.feature,
      provider: params.ctx.provider,
      model: params.ctx.model,
      requestKind: params.ctx.requestKind,
      status: "started",
      promptChars: params.ctx.promptChars ?? 0,
      requestPayload: params.ctx.requestPayload,
      aiBillingPeriodId: period?.id ?? null,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  try {
    const executed = await params.execute(usage.id);
    const inputTokens = executed.inputTokens ?? 0;
    const outputTokens = executed.outputTokens ?? 0;
    const billableUnits = computeBillableUnits(inputTokens, outputTokens);
    const estimatedCostCents =
      executed.estimatedCostCents ??
      estimateGeminiCostCents({
        usage: {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: inputTokens + outputTokens,
        },
        model: params.ctx.model,
      });

    const shadowPayload: Prisma.InputJsonValue = {
      shadowMode,
      shadowBillableUnits: billableUnits,
      legacyBillableUnits: executed.legacyBillableUnits ?? null,
      estimatedCostCents,
      ...(executed.responsePayload && typeof executed.responsePayload === "object"
        ? (executed.responsePayload as Record<string, unknown>)
        : {}),
    };

    let billableStatus: AiUsageBillableStatus = shadowMode ? "UNBILLABLE" : "UNBILLABLE";

    if (!shadowMode && billableUnits > 0) {
      if (entitlement.accessSource === "beta") {
        const recorded = await recordBetaGrantAiUsage({
          organizationId: params.ctx.organizationId,
          billableUnits,
        });
        billableStatus = recorded.billableStatus === "INCLUDED" ? "INCLUDED" : "UNBILLABLE";
      } else if (period) {
        const recorded = await recordAiUsageAgainstPeriod({
          aiBillingPeriodId: period.id,
          billableUnits,
        });
        billableStatus = recorded.billableStatus;
      }
    } else if (shadowMode && billableUnits > 0) {
      billableStatus = "UNBILLABLE";
    }

    await db.aiUsageLog.update({
      where: { id: usage.id },
      data: {
        status: "success",
        responseChars: executed.responseChars ?? 0,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
        billableUnits,
        billableStatus,
        estimatedCostCents,
        responsePayload: shadowPayload,
        finishedAt: new Date(),
      },
    });

    return {
      result: executed.result,
      usageLogId: usage.id,
      billableStatus,
      billableUnits,
      isOverage: billableStatus === "OVERAGE",
      shadowMode,
    };
  } catch (error) {
    await db.aiUsageLog.update({
      where: { id: usage.id },
      data: {
        status: "error",
        billableStatus: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Unknown AI error",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

export function getAiBillingErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.name === "BillingEntitlementError") {
    return error.message;
  }
  return null;
}
