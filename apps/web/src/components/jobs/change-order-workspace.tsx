"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChangeOrderStatus } from "@prisma/client";
import { CheckCircle2, FilePlus2, RefreshCw, SendHorizontal } from "lucide-react";
import {
  applyChangeOrderAction,
  createChangeOrderDraftAction,
  markChangeOrderAcceptedAction,
  rejectChangeOrderAction,
  sendChangeOrderAction,
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
} from "@/lib/change-order-flow";
import type { LoadedChangeOrderWorkspace } from "@/lib/change-order-loader";
import { ChangeOrderLineEditor } from "@/components/jobs/change-order-line-editor";
import { ChangeOrderImpactPreviewPanel } from "@/components/jobs/change-order-impact-preview";
import { ChangeOrderHistoryList } from "@/components/jobs/change-order-history-list";
import {
  ChangeOrderIntentPicker,
} from "@/components/jobs/change-order-intent-picker";
import { ChangeOrderReadinessPanel } from "@/components/jobs/change-order-readiness-panel";

type WorkspacePhase = "idle" | "creating" | "approving" | "applying";
type DraftComposerPhase = "closed" | "intent" | "editing";

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
  const [expectedJobPlanVersion, setExpectedJobPlanVersion] = useState(data.jobPlanVersion);
  const [, startTransition] = useTransition();

  const activeScopeItemIds = useMemo(
    () => new Set(data.activeScopeItems.map((item) => item.id)),
    [data.activeScopeItems],
  );

  const selectedRevision =
    data.changeOrders.find((changeOrder) => changeOrder.id === selectedRevisionId) ?? null;

  const draftValidation = validateChangeOrderDraftInput({
    reasoning,
    lines: draftLines,
    activeScopeItemIds,
    activeScopeItems: data.activeScopeItems,
  });

  const isPending = phase !== "idle";
  const pageBlocked = data.pageBlocked;
  const isDrafting = composerPhase !== "closed";

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
    draftLines: [],
    reasoning: "",
    activeScopeItems: data.activeScopeItems,
    selectedRevision,
    jobPlanVersion: data.jobPlanVersion,
    expectedJobPlanVersion,
    isPending,
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

  function handleSend() {
    const approveState = selectedReadiness.approve;
    if (!selectedRevision || approveState.disabled) {
      setError(approveState.reason ?? "Cannot send this Change Order.");
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
    if (!selectedRevision) {
      setError("Cannot mark this Change Order as accepted.");
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
          description="You are creating a customer-facing Change Order for signed scope changes. This does not mutate the original quote."
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
                  <span className="text-xs font-medium text-foreground-muted">Reasoning</span>
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

      {selectedRevision ? (
        <WorkspacePanel>
          <SectionHeading
            title="Selected Change Order"
            description={selectedRevision.reasoning}
          />
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <div className="space-y-4">
              <ChangeOrderImpactPreviewPanel preview={selectedReadiness.impact} />

              <div className="flex flex-wrap gap-2">
                {selectedRevision.status === ChangeOrderStatus.DRAFT ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={selectedReadiness.approve.disabled}
                    title={selectedReadiness.approve.reason ?? undefined}
                    onClick={handleSend}
                  >
                    {phase === "approving" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <SendHorizontal className="size-4" />
                    )}
                    Send Change Order
                  </Button>
                ) : null}

                {selectedRevision.status === ChangeOrderStatus.SENT ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={handleMarkAccepted}
                  >
                    {phase === "approving" ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Mark Accepted (Office)
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
                    Apply Change Order
                  </Button>
                ) : null}

                {selectedRevision.status === ChangeOrderStatus.APPLIED ? (
                  <p className="text-sm text-success">
                    Applied{" "}
                    {selectedRevision.appliedAt
                      ? new Date(selectedRevision.appliedAt).toLocaleString()
                      : "successfully"}
                    .
                  </p>
                ) : null}

                {(selectedRevision.status === ChangeOrderStatus.DRAFT ||
                  selectedRevision.status === ChangeOrderStatus.SENT ||
                  selectedRevision.status === ChangeOrderStatus.ACCEPTED) ? (
                  <>
                    <Button type="button" variant="ghost" disabled={isPending} onClick={handleReject}>
                      Reject
                    </Button>
                    <Button type="button" variant="ghost" disabled={isPending} onClick={handleVoid}>
                      Void
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <ChangeOrderReadinessPanel readiness={selectedReadiness} mode="selected" />
          </div>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel>
        <SectionHeading
          title="Change Order history"
          description="Prior drafts, approvals, and applied Change Orders for this job."
        />
        <div className="mt-4">
          <ChangeOrderHistoryList
            revisions={data.changeOrders}
            selectedRevisionId={selectedRevisionId}
            jobId={data.jobId}
            onSelect={(revisionId) => {
              setSelectedRevisionId(revisionId);
              if (isDrafting) resetComposer();
            }}
          />
        </div>
      </WorkspacePanel>
    </div>
  );
}
