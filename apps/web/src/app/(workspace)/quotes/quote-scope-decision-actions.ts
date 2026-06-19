"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import {
  applyQuoteScopeDecisionManualAction,
} from "@/lib/quote-scope-decision-core";
import type { QuoteScopeDecisionManualAction } from "@/lib/quote-scope-decision-types";

const ManualActionSchema = z.enum([
  "resolve",
  "ask_customer",
  "verify_on_site",
  "defer_to_execution",
  "use_assumption",
  "dismiss",
]);

export type QuoteScopeDecisionActionResult =
  | { success: true }
  | { error: string };

function revalidateQuoteSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/workstation");
}

export async function updateQuoteScopeDecisionAction(
  quoteId: string,
  decisionId: string,
  action: QuoteScopeDecisionManualAction,
): Promise<QuoteScopeDecisionActionResult> {
  const qid = quoteId.trim();
  const did = decisionId.trim();
  if (!qid || !did) {
    return { error: "Missing quote or decision id." };
  }

  const parsedAction = ManualActionSchema.safeParse(action);
  if (!parsedAction.success) {
    return { error: "Invalid scope decision action." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const outcome = await db.$transaction(async (tx) =>
      applyQuoteScopeDecisionManualAction(tx, {
        organizationId: ctx.organizationId,
        quoteId: qid,
        decisionId: did,
        action: parsedAction.data,
        resolvedByUserId: ctx.userId ?? null,
      }),
    );

    if (!outcome.ok) {
      return { error: outcome.error };
    }

    revalidateQuoteSurfaces(qid);
    return { success: true };
  } catch (e) {
    console.error("[quote-scope-decision] update failed", {
      quoteId: qid,
      decisionId: did,
      error: e,
    });
    return {
      error: e instanceof Error ? e.message : "Failed to update scope decision.",
    };
  }
}
