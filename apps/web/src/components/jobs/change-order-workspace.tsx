"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChangeOrderStatus } from "@prisma/client";
import { CheckCircle2, FilePlus2, RefreshCw, Save, SendHorizontal } from "lucide-react";
import {
  applyChangeOrderAction,
  createChangeOrderDraftAction,
  markChangeOrderAcceptedAction,
  rejectChangeOrderAction,
  sendChangeOrderAction,
  updateChangeOrderDraftAction,
  voidChangeOrderAction,
} from "@/app/(workspace)/change-orders/change-order-actions";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  createLineFromIntent,
  deriveChangeOrderReadiness,
  jobChangeOrdersPath,
  validateChangeOrderDraftInput,
  type ChangeOrderIntent,
  type ChangeOrderLineDraft,
  type ChangeOrderRevisionSnapshot,
} from "@/lib/change-order-flow";
import type { LoadedChangeOrderWorkspace } from "@/lib/change-order-loader";
import {
  changeOrderExecutionDeltaToJson,
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import {
  projectChangeOrderExecutionImpact,
} from "@/lib/change-order/change-order-execution-projection";
import { isExecutionTaskComposerEditable } from "@/lib/change-order/change-order-execution-task-composer";
import {
  commercialDraftChanged,
  executionDraftChanged,
  resolveDraftUpdateSaveIntent,
  UNSAVED_EXECUTION_IMPACT_BANNER,
} from "@/lib/change-order/change-order-draft-save-semantics";
import { ChangeOrderLineEditor } from "@/components/jobs/change-order-line-editor";
import { ChangeOrderImpactPreviewPanel } from "@/components/jobs/change-order-impact-preview";
import { ChangeOrderHistoryList } from "@/components/jobs/change-order-history-list";
import { ChangeOrderIntentPicker } from "@/components/jobs/change-order-intent-picker";
import { ChangeOrderReadinessPanel } from "@/components/jobs/change-order-readiness-panel";
import { ChangeOrderExecutionImpactPanel } from "@/components/jobs/change-order-execution-impact-panel";

type WorkspacePhase = "idle" | "creating" | "updating" | "approving" | "applying";
type DraftComposerPhase = "closed" | "intent" | "editing";

function toRevisionSnapshot(
  changeOrder: LoadedChangeOrderWorkspace["changeOrders"][number],
  executionImpactOverride?: ReturnType<typeof projectChangeOrderExecutionImpact>,
): ChangeOrderRevisionSnapshot {
  return {
    id: changeOrder.id,
    status: changeOrder.status,
    reasoning: changeOrder.reasoning,
    priceDeltaCents: changeOrder.priceDeltaCents,
    lines: changeOrder.lines,
    applicationStatus: changeOrder.applicationStatus,
    baseJobPlanVersion: changeOrder.baseJobPlanVersion,
    lastApplyErrorJson: changeOrder.lastApplyErrorJson,
    customerDocumentTitle: changeOrder.customerDocumentTitle,
    executionImpact: executionImpactOverride ?? changeOrder.executionImpact,
  };
}

type EditState = {
  changeOrderId: string;
  reasoning: string;
  lines: ChangeOrderLineDraft[];
  executionDeltaProposal: ChangeOrderExecutionDeltaProposal | null;
  baselineReasoning: string;
  baselineLines: ChangeOrderLineDraft[];
  baselineExecutionDeltaProposal: ChangeOrderExecutionDeltaProposal | null;
};

function buildEditState(
  changeOrder: LoadedChangeOrderWorkspace["changeOrders"][number],
): EditState {
  const parsed = parseChangeOrderExecutionDelta(changeOrder.executionDeltaJson);
  const executionDeltaProposal = parsed.ok ? parsed.proposal : null;
  return {
    changeOrderId: changeOrder.id,
    reasoning: changeOrder.reasoning,
    lines: changeOrder.lines,
    executionDeltaProposal,
    baselineReasoning: changeOrder.reasoning,
    baselineLines: changeOrder.lines,
    baselineExecutionDeltaProposal: executionDeltaProposal,
  };
}

export function ChangeOrderWorkspace({ data }: { data: LoadedChangeOrderWorkspace }) {
  const router = useRouter();
  const [phase, setPhase] = useState<WorkspacePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [composerPhase, setComposerPhase] = useState<DraftComposerPhase>("closed");
  const [selectedIntent, setSelectedIntent] = useState<ChangeOrderIntent | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [draftLines, setDraftLines] = useState<ChangeOrderLineDraft[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    data.focusChangeOrderId,
  );
  const [editState, setEditState] = useState<EditState | null>(() => {
    const focused = data.changeOrders.find(
      (changeOrder) => changeOrder.id === data.focusChangeOrderId,
    );
    return focused ? buildEditState(focused) : null;
  });
  const [expectedJobPlanVersion, setExpectedJobPlanVersion] = useState(() => {
    const focused = data.changeOrders.find(
      (changeOrder) => changeOrder.id === data.focusChangeOrderId,
    );
    return focused?.baseJobPlanVersion ?? data.jobPlanVersion;
  });
  const [composerError, setComposerError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const selectedChangeOrder =
    data.changeOrders.find((changeOrder) => changeOrder.id === selectedRevisionId) ?? null;

  const activeEditState =
    editState?.changeOrderId === selectedRevisionId ? editState : null;
  const editReasoning = activeEditState?.reasoning ?? selectedChangeOrder?.reasoning ?? "";
  const editLines = activeEditState?.lines ?? selectedChangeOrder?.lines ?? [];
  const executionDeltaProposal = activeEditState?.executionDeltaProposal ?? null;

  function selectChangeOrder(revisionId: string) {
    setSelectedRevisionId(revisionId);
    const changeOrder = data.changeOrders.find((item) => item.id === revisionId);
    if (changeOrder) {
      setEditState(buildEditState(changeOrder));
      setExpectedJobPlanVersion(changeOrder.baseJobPlanVersion ?? data.jobPlanVersion);
    } else {
      setEditState(null);
    }
  }

  function updateEditState(patch: Partial<Omit<EditState, "changeOrderId">>) {
    if (!selectedRevisionId) return;
    setEditState((current) => {
      const base =
        current?.changeOrderId === selectedRevisionId
          ? current
          : selectedChangeOrder
            ? buildEditState(selectedChangeOrder)
            : null;
      if (!base) return current;
      return { ...base, ...patch };
    });
  }

  const activeScopeItemIds = useMemo(
    () => new Set(data.activeScopeItems.map((item) => item.id)),
    [data.activeScopeItems],
  );

  const scopeItemsForProjection = useMemo(
    () =>
      data.activeScopeItems.map((item) => ({
        id: item.id,
        description: item.description,
        executionRelevant: item.executionRelevant,
        status: item.status,
      })),
    [data.activeScopeItems],
  );

  const localExecutionImpact = useMemo(() => {
    if (!selectedChangeOrder || !executionDeltaProposal) {
      return selectedChangeOrder?.executionImpact ?? null;
    }
    return projectChangeOrderExecutionImpact({
      executionDeltaJson: executionDeltaProposal,
      baseJobPlanVersion: selectedChangeOrder.baseJobPlanVersion,
      currentJobPlanVersion: data.jobPlanVersion,
      priceDeltaCents: selectedChangeOrder.priceDeltaCents,
      scopeItems: scopeItemsForProjection,
      tasks: data.jobTasks,
    });
  }, [
    selectedChangeOrder,
    executionDeltaProposal,
    data.jobPlanVersion,
    data.jobTasks,
    scopeItemsForProjection,
  ]);

  const selectedRevision = selectedChangeOrder
    ? toRevisionSnapshot(selectedChangeOrder, localExecutionImpact ?? undefined)
    : null;

  const editValidation = validateChangeOrderDraftInput({
    reasoning: editReasoning,
    lines: editLines,
    activeScopeItemIds,
    activeScopeItems: data.activeScopeItems,
  });

  const draftValidation = validateChangeOrderDraftInput({
    reasoning,
    lines: draftLines,
    activeScopeItemIds,
    activeScopeItems: data.activeScopeItems,
  });

  const isPending = phase !== "idle";
  const pageBlocked = data.pageBlocked;
  const isDrafting = composerPhase !== "closed";
  const isSelectedEditable = selectedRevision?.status
    ? selectedRevision.status === ChangeOrderStatus.DRAFT ||
      selectedRevision.status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES
    : false;
  const isExecutionEditable =
    isSelectedEditable &&
    selectedChangeOrder &&
    isExecutionTaskComposerEditable({
      status: selectedChangeOrder.status,
      applicationStatus: selectedChangeOrder.applicationStatus,
    });

  const draftReadiness = deriveChangeOrderReadiness({
    permissions: data.permissions,
    pageBlocked,
    draftLines,
    reasoning,
    activeScopeItems: data.activeScopeItems,
    selectedRevision: null,
    jobPlanVersion: data.jobPlanVersion,
    expectedJobPlanVersion,
    isPending,
  });

  const selectedReadiness = deriveChangeOrderReadiness({
    permissions: data.permissions,
    pageBlocked,
    draftLines: isSelectedEditable ? editLines : [],
    reasoning: isSelectedEditable ? editReasoning : "",
    activeScopeItems: data.activeScopeItems,
    selectedRevision,
    jobPlanVersion: data.jobPlanVersion,
    expectedJobPlanVersion,
    isPending,
    baselineReasoning: activeEditState?.baselineReasoning,
    baselineLines: activeEditState?.baselineLines,
    baselineExecutionProposal: activeEditState?.baselineExecutionDeltaProposal,
    currentExecutionProposal: executionDeltaProposal,
    executionComposerEditable: Boolean(isExecutionEditable),
  });

  function resetComposer() {
    setComposerPhase("closed");
    setSelectedIntent(null);
    setReasoning("");
    setDraftLines([]);
    setError(null);
  }

  function handleIntentSelect(intent: ChangeOrderIntent) {
    setSelectedIntent(intent);
    setDraftLines([createLineFromIntent(intent)]);
    setComposerPhase("editing");
    setSelectedRevisionId(null);
  }

  function handleCreateDraft() {
    const createDraftState = draftReadiness.createDraft;
    if (createDraftState.disabled || !draftValidation.ok) {
      setError(
        createDraftState.reason ??
          (draftValidation.ok ? "Cannot create draft." : draftValidation.error),
      );
      return;
    }
    setError(null);
    setPhase("creating");
    startTransition(async () => {
      const result = await createChangeOrderDraftAction({
        quoteId: data.quoteId,
        jobId: data.jobId,
        reasoning: reasoning.trim(),
        priceDeltaCents: draftValidation.priceDeltaCents,
        lines: draftLines,
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      resetComposer();
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleSaveDraft(saveKind: "commercial_only" | "execution_only") {
    const saveState =
      saveKind === "commercial_only"
        ? selectedReadiness.saveCommercial
        : selectedReadiness.saveExecutionImpact;

    if (!selectedChangeOrder || saveState.disabled) {
      setError(saveState.reason ?? "Cannot save draft changes.");
      return;
    }
    if (saveKind === "commercial_only" && !editValidation.ok) {
      setError(editValidation.error);
      return;
    }

    const commercialChanged = activeEditState
      ? commercialDraftChanged({
          baselineReasoning: activeEditState.baselineReasoning,
          baselineLines: activeEditState.baselineLines,
          reasoning: editReasoning,
          lines: editLines,
        })
      : false;
    const executionChanged = activeEditState
      ? executionDraftChanged({
          baselineProposal: activeEditState.baselineExecutionDeltaProposal,
          proposal: executionDeltaProposal,
        })
      : false;
    const saveIntent = resolveDraftUpdateSaveIntent({ commercialChanged, executionChanged });

    if (saveIntent.kind !== saveKind) {
      setError(
        saveIntent.kind === "blocked_mixed"
          ? saveIntent.message
          : "Nothing to save in this section.",
      );
      return;
    }

    setError(null);
    setPhase("updating");
    startTransition(async () => {
      const result = await updateChangeOrderDraftAction({
        changeOrderId: selectedChangeOrder.id,
        ...(saveKind === "execution_only"
          ? {
              executionDeltaJson: executionDeltaProposal
                ? changeOrderExecutionDeltaToJson(executionDeltaProposal)
                : undefined,
            }
          : {
              reasoning: editReasoning.trim(),
              priceDeltaCents: editValidation.priceDeltaCents,
              lines: editLines,
            }),
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleSend() {
    const sendState = selectedReadiness.send;
    if (!selectedRevision || sendState.disabled) {
      setError(sendState.reason ?? "Cannot send this Change Order.");
      return;
    }
    setError(null);
    setPhase("approving");
    startTransition(async () => {
      const result = await sendChangeOrderAction(selectedRevision.id, { expiresInDays: 14 });
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleMarkAccepted() {
    const acceptState = selectedReadiness.staffAccept;
    if (!selectedRevision || acceptState.disabled) {
      setError(acceptState.reason ?? "Cannot mark this Change Order as accepted.");
      return;
    }
    setError(null);
    setPhase("approving");
    startTransition(async () => {
      const result = await markChangeOrderAcceptedAction(selectedRevision.id);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleApply() {
    const applyState = selectedReadiness.apply;
    if (!selectedRevision || applyState.disabled) {
      setError(applyState.reason ?? "Cannot apply this Change Order.");
      return;
    }
    setError(null);
    setPhase("applying");
    startTransition(async () => {
      const result = await applyChangeOrderAction(selectedRevision.id, {
        expectedJobPlanVersion,
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        if (result.error.includes("Job plan changed")) {
          router.refresh();
        }
        return;
      }
      setExpectedJobPlanVersion(result.resultingJobPlanVersion);
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleReject() {
    if (!selectedRevision) return;
    setError(null);
    setPhase("approving");
    startTransition(async () => {
      const result = await rejectChangeOrderAction(selectedRevision.id);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  function handleVoid() {
    if (!selectedRevision) return;
    setError(null);
    setPhase("approving");
    startTransition(async () => {
      const result = await voidChangeOrderAction(selectedRevision.id);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.changeOrderId}`);
      router.refresh();
    });
  }

  const showStaffAcceptButton =
    selectedRevision &&
    selectedRevision.status !== ChangeOrderStatus.ACCEPTED &&
    selectedRevision.status !== ChangeOrderStatus.APPLIED &&
    selectedRevision.status !== ChangeOrderStatus.REJECTED &&
    selectedRevision.status !== ChangeOrderStatus.VOID &&
    (selectedRevision.status === ChangeOrderStatus.SENT ||
      (selectedRevision.status === ChangeOrderStatus.DRAFT &&
        !selectedReadiness.requiresCustomerApproval));

  return (
    <div className="space-y-6">
      {data.pageBlockedMessage ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {data.pageBlockedMessage}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <WorkspacePanel>
        <SectionHeading
          title="Create Change Order"
          description="Commercial scope and price changes for this job. Execution impact is reviewed before send or apply."
        />
        <div className="mt-4 space-y-4">
          {composerPhase === "closed" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pageBlocked || !data.permissions.canCreateDraft || isPending}
              title={
                pageBlocked
                  ? data.pageBlockedMessage ?? undefined
                  : data.permissions.createDraftError ?? undefined
              }
              onClick={() => {
                setComposerPhase("intent");
                setSelectedRevisionId(null);
              }}
            >
              <FilePlus2 className="size-4" />
              New Change Order
            </Button>
          ) : null}

          {composerPhase === "intent" ? (
            <div className="space-y-4">
              <ChangeOrderIntentPicker
                disabled={isPending || pageBlocked}
                onSelect={handleIntentSelect}
              />
              <Button type="button" variant="ghost" disabled={isPending} onClick={resetComposer}>
                Cancel
              </Button>
            </div>
          ) : null}

          {composerPhase === "editing" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div className="space-y-4">
                {selectedIntent ? (
                  <p className="text-sm text-foreground-muted">
                    {selectedIntent === "add"
                      ? "Adding new work or cost."
                      : selectedIntent === "modify"
                        ? "Modifying existing scope."
                        : "Removing existing scope."}
                  </p>
                ) : null}

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground-muted">Reason</span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={reasoning}
                    disabled={isPending || pageBlocked}
                    onChange={(event) => setReasoning(event.target.value)}
                    placeholder="Why is this scope changing?"
                  />
                </label>

                <ChangeOrderLineEditor
                  lines={draftLines}
                  activeScopeItems={data.activeScopeItems}
                  onChange={setDraftLines}
                  disabled={isPending || pageBlocked}
                  showAdvancedControls={selectedIntent === "add" || draftLines.length > 1}
                />

                {draftValidation.ok ? (
                  <ChangeOrderImpactPreviewPanel preview={draftReadiness.impact} />
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={draftReadiness.createDraft.disabled}
                    title={draftReadiness.createDraft.reason ?? undefined}
                    onClick={handleCreateDraft}
                  >
                    {phase === "creating" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <FilePlus2 className="size-4" />
                    )}
                    Create draft
                  </Button>
                  <Button type="button" variant="ghost" disabled={isPending} onClick={resetComposer}>
                    Cancel
                  </Button>
                </div>
              </div>

              <ChangeOrderReadinessPanel readiness={draftReadiness} mode="draft" />
            </div>
          ) : null}
        </div>
      </WorkspacePanel>

      {selectedRevision && selectedChangeOrder ? (
        <WorkspacePanel>
          <SectionHeading
            title={`CO-${String(selectedChangeOrder.number).padStart(3, "0")} · ${selectedChangeOrder.title}`}
            description={`Status: ${selectedRevision.status.replaceAll("_", " ")}`}
          />
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Commercial change</h3>
                <p className="mt-1 text-xs text-foreground-muted">
                  Scope and price the customer will review and approve.
                </p>
              </div>

              {isSelectedEditable ? (
                <>
                  {selectedReadiness.commercialChanged ? (
                    <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                      You have unsaved commercial changes. Save commercial changes before sending.
                    </div>
                  ) : null}
                  {selectedReadiness.mixedEditBlocked && selectedReadiness.mixedEditMessage ? (
                    <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                      {selectedReadiness.mixedEditMessage}
                    </div>
                  ) : null}
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground-muted">Reason</span>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={editReasoning}
                    disabled={isPending || pageBlocked}
                    onChange={(event) => updateEditState({ reasoning: event.target.value })}
                    />
                  </label>
                  <ChangeOrderLineEditor
                    lines={editLines}
                    activeScopeItems={data.activeScopeItems}
                    onChange={(lines) => updateEditState({ lines })}
                    disabled={isPending || pageBlocked}
                    showAdvancedControls
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-foreground-muted whitespace-pre-wrap">
                    {selectedRevision.reasoning}
                  </p>
                  <ChangeOrderImpactPreviewPanel
                    preview={selectedReadiness.impact}
                    customerFacingLabel="What the customer will see"
                  />
                </>
              )}

              {editValidation.ok && isSelectedEditable ? (
                <ChangeOrderImpactPreviewPanel preview={selectedReadiness.impact} />
              ) : null}

              <div className="flex flex-wrap gap-2">
                {isSelectedEditable ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedReadiness.saveCommercial.disabled}
                    title={selectedReadiness.saveCommercial.reason ?? undefined}
                    onClick={() => handleSaveDraft("commercial_only")}
                  >
                    {phase === "updating" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save commercial changes
                  </Button>
                ) : null}

                {selectedRevision.status === ChangeOrderStatus.DRAFT ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectedReadiness.send.disabled}
                    title={selectedReadiness.send.reason ?? undefined}
                    onClick={handleSend}
                  >
                    {phase === "approving" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <SendHorizontal className="size-4" />
                    )}
                    Send change order
                  </Button>
                ) : null}

                {showStaffAcceptButton ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedReadiness.staffAccept.disabled}
                    title={selectedReadiness.staffAccept.reason ?? undefined}
                    onClick={handleMarkAccepted}
                  >
                    {phase === "approving" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Mark internally accepted
                  </Button>
                ) : null}

                {selectedRevision.status === ChangeOrderStatus.ACCEPTED ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectedReadiness.apply.disabled}
                    title={selectedReadiness.apply.reason ?? undefined}
                    onClick={handleApply}
                  >
                    {phase === "applying" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Apply to job plan
                  </Button>
                ) : null}

                {selectedRevision.status === ChangeOrderStatus.APPLIED ? (
                  <p className="text-sm text-success">
                    Applied{" "}
                    {selectedChangeOrder.appliedAt
                      ? new Date(selectedChangeOrder.appliedAt).toLocaleString()
                      : "successfully"}
                    .
                  </p>
                ) : null}

                {(selectedRevision.status === ChangeOrderStatus.DRAFT ||
                  selectedRevision.status === ChangeOrderStatus.SENT ||
                  selectedRevision.status === ChangeOrderStatus.ACCEPTED ||
                  selectedRevision.status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES) ? (
                  <>
                    <Button type="button" variant="ghost" disabled={isPending} onClick={handleReject}>
                      Reject
                    </Button>
                    <Button type="button" variant="ghost" disabled={isPending} onClick={handleVoid}>
                      Void change order
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              {localExecutionImpact && selectedChangeOrder ? (
                <ChangeOrderExecutionImpactPanel
                  impact={localExecutionImpact}
                  editable={Boolean(isExecutionEditable)}
                  executionChanged={selectedReadiness.executionChanged}
                  mixedEditBlocked={selectedReadiness.mixedEditBlocked}
                  mixedEditMessage={selectedReadiness.mixedEditMessage}
                  saveExecutionImpact={selectedReadiness.saveExecutionImpact}
                  onSaveExecutionImpact={() => handleSaveDraft("execution_only")}
                  isSaving={phase === "updating"}
                  unsavedBannerMessage={UNSAVED_EXECUTION_IMPACT_BANNER}
                  jobTasks={data.jobTasks}
                  scopeItems={data.activeScopeItems.map((item) => ({
                    id: item.id,
                    description: item.description,
                  }))}
                  proposal={executionDeltaProposal}
                  baseJobPlanVersion={selectedChangeOrder.baseJobPlanVersion}
                  onProposalChange={(nextProposal) => {
                    updateEditState({ executionDeltaProposal: nextProposal });
                    setComposerError(null);
                  }}
                  composerError={composerError}
                  onComposerError={setComposerError}
                />
              ) : null}
              <ChangeOrderReadinessPanel readiness={selectedReadiness} mode="selected" />
            </div>
          </div>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel>
        <SectionHeading
          title="Change Order history"
          description="Prior drafts, sent orders, and applied Change Orders for this job."
        />
        <div className="mt-4">
          <ChangeOrderHistoryList
            revisions={data.changeOrders}
            selectedRevisionId={selectedRevisionId}
            jobId={data.jobId}
            onSelect={(revisionId) => {
              selectChangeOrder(revisionId);
              if (isDrafting) resetComposer();
            }}
          />
        </div>
      </WorkspacePanel>
    </div>
  );
}
