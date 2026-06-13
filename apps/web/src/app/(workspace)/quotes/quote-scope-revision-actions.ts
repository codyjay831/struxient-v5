"use server";

import type {
  ChangeOrderLineInput,
  CreateChangeOrderDraftInput,
} from "@/app/(workspace)/change-orders/change-order-actions";
import {
  applyChangeOrderAction as applyChangeOrderActionCore,
  createChangeOrderDraftAction as createChangeOrderDraftActionCore,
  markChangeOrderAcceptedAction,
  rejectChangeOrderAction,
  sendChangeOrderAction,
  voidChangeOrderAction,
} from "@/app/(workspace)/change-orders/change-order-actions";

export type CreateQuoteScopeRevisionInput = CreateChangeOrderDraftInput;
export type QuoteScopeRevisionLineInput = ChangeOrderLineInput;

type QuoteScopeRevisionActionResult =
  | { ok: true; revisionId: string }
  | { ok: false; error: string };

type QuoteScopeRevisionApplyResult =
  | {
      ok: true;
      revisionId: string;
      executionPlanRevisionId: string;
      resultingJobPlanVersion: number;
    }
  | { ok: false; error: string };

function toLegacyActionResult(result: { ok: true; changeOrderId: string } | { ok: false; error: string }): QuoteScopeRevisionActionResult {
  return result.ok ? { ok: true, revisionId: result.changeOrderId } : result;
}

function toLegacyApplyResult(
  result:
    | { ok: true; changeOrderId: string; executionPlanRevisionId: string; resultingJobPlanVersion: number }
    | { ok: false; error: string },
): QuoteScopeRevisionApplyResult {
  return result.ok
    ? {
        ok: true,
        revisionId: result.changeOrderId,
        executionPlanRevisionId: result.executionPlanRevisionId,
        resultingJobPlanVersion: result.resultingJobPlanVersion,
      }
    : result;
}

export async function createQuoteScopeRevisionDraftAction(
  input: CreateQuoteScopeRevisionInput,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await createChangeOrderDraftActionCore(input));
}

export async function createChangeOrderDraftAction(
  input: CreateChangeOrderDraftInput,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await createChangeOrderDraftActionCore(input));
}

export async function approveQuoteScopeRevisionAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await sendChangeOrderAction(revisionId));
}

export async function approveChangeOrderAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await sendChangeOrderAction(revisionId));
}

export async function applyQuoteScopeRevisionAction(
  revisionId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
  },
): Promise<QuoteScopeRevisionApplyResult> {
  return toLegacyApplyResult(await applyChangeOrderActionCore(revisionId, options));
}

export async function applyChangeOrderAction(
  revisionId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
  },
): Promise<QuoteScopeRevisionApplyResult> {
  return toLegacyApplyResult(await applyChangeOrderActionCore(revisionId, options));
}

export async function markChangeOrderAcceptedCompatibilityAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await markChangeOrderAcceptedAction(revisionId));
}

export async function rejectChangeOrderCompatibilityAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await rejectChangeOrderAction(revisionId));
}

export async function voidChangeOrderCompatibilityAction(
  revisionId: string,
): Promise<QuoteScopeRevisionActionResult> {
  return toLegacyActionResult(await voidChangeOrderAction(revisionId));
}

