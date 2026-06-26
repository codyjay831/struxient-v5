"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import {
  applyChangeOrderAction,
  markChangeOrderAcceptedAction,
  sendChangeOrderAction,
} from "@/app/(workspace)/change-orders/change-order-actions";
import { loadChangeOrderWorkstationPanelAction } from "@/app/(workspace)/workstation/change-order-panel-actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { WorkstationModalShell } from "@/components/workstation/workstation-modal-shell";
import {
  CHANGE_ORDER_WORKSTATION_STAFF_ACCEPT_LABEL,
  resolveBlockedPrimaryActionMessage,
  type ChangeOrderWorkstationPanelDto,
} from "@/lib/change-order/change-order-workstation-panel";
import { ChangeOrderStatus } from "@prisma/client";

type PanelLoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; panel: ChangeOrderWorkstationPanelDto };

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function ReadinessRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function ChangeOrderWorkstationPanel({
  changeOrderId,
  jobId,
  href,
  title,
  subtitle,
  statusLabel,
  onClose,
}: {
  changeOrderId: string;
  jobId: string;
  href: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<PanelLoadState>({ kind: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reloadPanel = useCallback(async () => {
    const result = await loadChangeOrderWorkstationPanelAction(changeOrderId, jobId);
    if (!result.ok) {
      setState({ kind: "error", message: result.error });
      return;
    }
    setState({ kind: "loaded", panel: result.panel });
  }, [changeOrderId, jobId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadChangeOrderWorkstationPanelAction(changeOrderId, jobId);
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "loaded", panel: result.panel });
    })();
    return () => {
      cancelled = true;
    };
  }, [changeOrderId, jobId]);

  function runMutation(action: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setActionError(result.error ?? "Action failed.");
        return;
      }
      await reloadPanel();
      router.refresh();
    });
  }

  function renderPrimaryAction(panel: ChangeOrderWorkstationPanelDto) {
    const primary = panel.primaryAction;

    if (primary.kind === "send") {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={isPending || primary.disabled}
          title={primary.reason ?? undefined}
          onClick={() =>
            runMutation(() => sendChangeOrderAction(panel.id, { expiresInDays: 14 }))
          }
        >
          {isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
          Send change order
        </Button>
      );
    }

    if (primary.kind === "apply") {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={isPending || primary.disabled}
          title={primary.reason ?? undefined}
          onClick={() =>
            runMutation(() =>
              applyChangeOrderAction(panel.id, {
                expectedJobPlanVersion: primary.expectedJobPlanVersion,
              }),
            )
          }
        >
          {isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
          Apply change order
        </Button>
      );
    }

    if (primary.kind === "staff_accept") {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={isPending || primary.disabled}
          title={primary.reason ?? undefined}
          onClick={() => runMutation(() => markChangeOrderAcceptedAction(panel.id))}
        >
          {isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
          {CHANGE_ORDER_WORKSTATION_STAFF_ACCEPT_LABEL}
        </Button>
      );
    }

    if (primary.kind === "review_full") {
      return (
        <ButtonLink href={primary.href} variant="primary">
          {primary.label}
          <ArrowUpRight className="size-4" />
        </ButtonLink>
      );
    }

    return (
      <ButtonLink href={primary.href} variant="secondary">
        {primary.label}
        <ArrowUpRight className="size-4" />
      </ButtonLink>
    );
  }

  const body =
    state.kind === "loading" ? (
      <p className="text-sm text-foreground-muted" role="status">
        Loading change order…
      </p>
    ) : state.kind === "error" ? (
      <div className="space-y-3">
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
        <ButtonLink href={href} variant="secondary" size="sm">
          Open full change order
          <ArrowUpRight className="size-3.5" />
        </ButtonLink>
      </div>
    ) : (
      (() => {
        const panel = state.panel;
        const sentAtLabel = formatTimestamp(panel.lastSentEmailAt);
        const acceptedAtLabel = formatTimestamp(panel.acceptedAt);
        const blockedPrimaryMessage = resolveBlockedPrimaryActionMessage(panel);

        return (
          <div className="space-y-6">
            {panel.pageBlockedMessage ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                {panel.pageBlockedMessage}
              </div>
            ) : null}

            {actionError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Readiness</h3>
                {panel.officeNextStep ? (
                  <p className="mt-1 text-sm text-foreground-muted">{panel.officeNextStep}</p>
                ) : null}
              </div>

              {panel.lifecycleReadinessLabel ? (
                <ReadinessRow label="Status" value={panel.lifecycleReadinessLabel} />
              ) : null}

              <dl className="grid gap-3 sm:grid-cols-2">
                <ReadinessRow label="Total price delta" value={panel.priceDeltaLabel} />
                <ReadinessRow label="Commercial" value={panel.commercialStatusLabel} />
                <ReadinessRow label="Payment plan" value={panel.paymentPlanStatusLabel} />
                <ReadinessRow label="Work impact" value={panel.workImpactStatusLabel} />
              </dl>

              {panel.status === ChangeOrderStatus.SENT ? (
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground-muted">
                  Waiting on customer acceptance.
                  {sentAtLabel ? ` Last sent ${sentAtLabel}.` : null}
                </div>
              ) : null}

              {panel.status === ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES &&
              panel.customerRequestSummary ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                  <p className="text-xs font-medium text-foreground-muted">Customer request</p>
                  <p className="mt-1 text-sm text-foreground">{panel.customerRequestSummary}</p>
                </div>
              ) : null}

              {acceptedAtLabel ? (
                <ReadinessRow label="Accepted" value={acceptedAtLabel} />
              ) : null}

              {panel.sendBlockers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground-muted">Blockers</p>
                  {panel.sendBlockers.map((blocker) => (
                    <div
                      key={blocker.title}
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-destructive">{blocker.title}</p>
                      <p className="mt-1 text-xs text-destructive/90">{blocker.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {panel.applyErrorSummary && panel.applyErrorSummary.messages.length > 0 ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <p className="text-sm font-medium text-destructive">
                    Apply failed
                    {panel.applyErrorSummary.classification
                      ? ` (${panel.applyErrorSummary.classification.replaceAll("_", " ").toLowerCase()})`
                      : ""}
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-destructive">
                    {panel.applyErrorSummary.messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!panel.apply.disabled &&
              panel.status === ChangeOrderStatus.ACCEPTED &&
              panel.jobPlanVersion !== panel.expectedJobPlanVersion ? (
                <p className="text-sm text-warning">
                  Job plan version changed. Review work impact before applying.
                </p>
              ) : null}
            </div>

            {blockedPrimaryMessage ? (
              <p className="text-sm text-foreground-muted" role="status">
                {blockedPrimaryMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              {renderPrimaryAction(panel)}
              <ButtonLink href={panel.href} variant="secondary">
                Open full change order
                <ArrowUpRight className="size-4" />
              </ButtonLink>
            </div>
          </div>
        );
      })()
    );

  return (
    <WorkstationModalShell
      kindLabel="Change Order"
      title={title}
      subtitle={subtitle}
      statusLabel={statusLabel}
      onClose={onClose}
    >
      {body}
    </WorkstationModalShell>
  );
}
