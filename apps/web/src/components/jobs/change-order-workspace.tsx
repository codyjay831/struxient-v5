"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuoteScopeRevisionStatus } from "@prisma/client";
import { CheckCircle2, FilePlus2, RefreshCw } from "lucide-react";
import {
  approveChangeOrderAction,
  applyChangeOrderAction,
  createChangeOrderDraftAction,
} from "@/app/(workspace)/quotes/quote-scope-revision-actions";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  deriveChangeOrderImpactPreview,
  getApplyButtonState,
  getApproveButtonState,
  getCreateDraftButtonState,
  jobChangeOrdersPath,
  validateChangeOrderDraftInput,
  type ChangeOrderLineDraft,
} from "@/lib/change-order-flow";
import type { LoadedChangeOrderWorkspace } from "@/lib/change-order-loader";
import {
  ChangeOrderLineEditor,
  createEmptyChangeOrderLine,
} from "@/components/jobs/change-order-line-editor";
import { ChangeOrderImpactPreviewPanel } from "@/components/jobs/change-order-impact-preview";
import { ChangeOrderHistoryList } from "@/components/jobs/change-order-history-list";

type WorkspacePhase = "idle" | "creating" | "approving" | "applying";

export function ChangeOrderWorkspace({ data }: { data: LoadedChangeOrderWorkspace }) {
  const router = useRouter();
  const [phase, setPhase] = useState<WorkspacePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showDraftComposer, setShowDraftComposer] = useState(false);
  const [reasoning, setReasoning] = useState("");
  const [draftLines, setDraftLines] = useState<ChangeOrderLineDraft[]>([
    createEmptyChangeOrderLine(),
  ]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    data.focusRevisionId,
  );
  const [expectedJobPlanVersion, setExpectedJobPlanVersion] = useState(data.jobPlanVersion);
  const [, startTransition] = useTransition();

  const activeScopeItemIds = useMemo(
    () => new Set(data.activeScopeItems.map((item) => item.id)),
    [data.activeScopeItems],
  );

  const selectedRevision =
    data.revisions.find((revision) => revision.id === selectedRevisionId) ?? null;

  const draftValidation = validateChangeOrderDraftInput({
    reasoning,
    lines: draftLines,
    activeScopeItemIds,
  });

  const draftImpact =
    draftValidation.ok && showDraftComposer
      ? deriveChangeOrderImpactPreview({
          lines: draftLines,
          priceDeltaCents: draftValidation.priceDeltaCents,
        })
      : null;

  const selectedImpact = selectedRevision
    ? deriveChangeOrderImpactPreview({
        lines: selectedRevision.lines,
        priceDeltaCents: selectedRevision.priceDeltaCents,
      })
    : null;

  const isPending = phase !== "idle";
  const pageBlocked = data.pageBlocked;

  const createDraftState = getCreateDraftButtonState({
    permissions: data.permissions,
    pageBlocked,
    draftLines,
    reasoning,
    activeScopeItemIds,
    isPending,
  });

  const approveState = getApproveButtonState({
    permissions: data.permissions,
    pageBlocked,
    selectedRevision,
    isPending,
  });

  const applyState = getApplyButtonState({
    permissions: data.permissions,
    pageBlocked,
    selectedRevision,
    jobPlanVersion: data.jobPlanVersion,
    expectedJobPlanVersion,
    isPending,
  });

  function handleCreateDraft() {
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
      setShowDraftComposer(false);
      setReasoning("");
      setDraftLines([createEmptyChangeOrderLine()]);
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.revisionId}`);
      router.refresh();
    });
  }

  function handleApprove() {
    if (!selectedRevision || approveState.disabled) {
      setError(approveState.reason ?? "Cannot approve this Change Order.");
      return;
    }
    setError(null);
    setPhase("approving");
    startTransition(async () => {
      const result = await approveChangeOrderAction(selectedRevision.id);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.revisionId}`);
      router.refresh();
    });
  }

  function handleApply() {
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
      router.push(`${jobChangeOrdersPath(data.jobId)}?focus=${result.revisionId}`);
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
          title="Change Order history"
          description="Draft, approve, and apply commercial scope changes after activation."
        />
        <div className="mt-4">
          <ChangeOrderHistoryList
            revisions={data.revisions}
            selectedRevisionId={selectedRevisionId}
            onSelect={setSelectedRevisionId}
          />
        </div>
      </WorkspacePanel>

      {selectedRevision ? (
        <WorkspacePanel>
          <SectionHeading
            title="Selected Change Order"
            description={selectedRevision.reasoning}
          />
          <div className="mt-4 space-y-4">
            {selectedImpact ? <ChangeOrderImpactPreviewPanel preview={selectedImpact} /> : null}

            <div className="flex flex-wrap gap-2">
              {selectedRevision.status === QuoteScopeRevisionStatus.DRAFT ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={approveState.disabled}
                  title={approveState.reason ?? undefined}
                  onClick={handleApprove}
                >
                  {phase === "approving" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Approve Change Order
                </Button>
              ) : null}

              {selectedRevision.status === QuoteScopeRevisionStatus.APPROVED ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={applyState.disabled}
                  title={applyState.reason ?? undefined}
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

              {selectedRevision.status === QuoteScopeRevisionStatus.APPLIED ? (
                <p className="text-sm text-success">
                  Applied{" "}
                  {selectedRevision.appliedAt
                    ? new Date(selectedRevision.appliedAt).toLocaleString()
                    : "successfully"}
                  .
                </p>
              ) : null}
            </div>
          </div>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel>
        <SectionHeading
          title="Create Change Order draft"
          description="Capture new commercial scope changes before customer approval and apply."
        />
        <div className="mt-4 space-y-4">
          {!showDraftComposer ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pageBlocked || !data.permissions.canCreateDraft || isPending}
              title={
                pageBlocked
                  ? data.pageBlockedMessage ?? undefined
                  : data.permissions.createDraftError ?? undefined
              }
              onClick={() => setShowDraftComposer(true)}
            >
              <FilePlus2 className="size-4" />
              New Change Order draft
            </Button>
          ) : (
            <>
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
              />

              {draftImpact ? <ChangeOrderImpactPreviewPanel preview={draftImpact} /> : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={createDraftState.disabled}
                  title={createDraftState.reason ?? undefined}
                  onClick={handleCreateDraft}
                >
                  {phase === "creating" ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <FilePlus2 className="size-4" />
                  )}
                  Create draft
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => {
                    setShowDraftComposer(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </WorkspacePanel>
    </div>
  );
}
