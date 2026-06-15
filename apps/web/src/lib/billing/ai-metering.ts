import type { AiUsageBillableStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCanUseAi } from "./billing-entitlement";
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
};

export async function runMeteredAiCall<T>(params: {
  ctx: AiMeteringContext;
  execute: (usageLogId: string) => Promise<{
    result: T;
    responseChars?: number;
    inputTokens?: number;
    outputTokens?: number;
    responsePayload?: Prisma.InputJsonValue;
  }>;
}): Promise<AiMeteringResult<T>> {
  await assertCanUseAi(params.ctx.organizationId, params.ctx.feature);

  const period = await getCurrentAiBillingPeriod(params.ctx.organizationId);

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

    let billableStatus: AiUsageBillableStatus = "UNBILLABLE";
    if (period && billableUnits > 0) {
      const recorded = await recordAiUsageAgainstPeriod({
        aiBillingPeriodId: period.id,
        billableUnits,
      });
      billableStatus = recorded.billableStatus;
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
        responsePayload: executed.responsePayload,
        finishedAt: new Date(),
      },
    });

    return {
      result: executed.result,
      usageLogId: usage.id,
      billableStatus,
      billableUnits,
      isOverage: billableStatus === "OVERAGE",
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
