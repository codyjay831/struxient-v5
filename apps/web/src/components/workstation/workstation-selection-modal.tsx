"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { QuoteStatus } from "@prisma/client";
import { Drawer } from "@/components/ui/drawer";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
import {
  QuoteWorkspaceDialogBody,
  type QuoteDialogDisplay,
} from "@/components/work-surfaces/quote-workspace-dialog-body";
import { WorkstationModalShell } from "@/components/workstation/workstation-modal-shell";
import {
  WorkstationWorkPanel,
  WorkstationWorkPanelFooter,
} from "@/components/workstation/workstation-work-panel";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import type { QuoteReadinessActionKind } from "@/lib/quote-readiness";
import type { WorkstationWorkItem } from "@/lib/workstation-query";

const QUOTE_READINESS_ACTIONS: readonly QuoteReadinessActionKind[] = [
  "ADD_LINE_ITEM",
  "ADD_FROM_SCOPE_LIBRARY",
  "CONTINUE_EDITING",
  "SEND_QUOTE",
  "MARK_APPROVED",
  "OPEN_PROPOSAL_PREVIEW",
  "OPEN_EXECUTION_REVIEW",
  "ACTIVATE_JOB",
  "OPEN_JOB",
  "RESTORE_TO_DRAFT",
];

function isQuoteReadinessActionKind(
  action: string | undefined,
): action is QuoteReadinessActionKind {
  return Boolean(
    action &&
      QUOTE_READINESS_ACTIONS.includes(action as QuoteReadinessActionKind),
  );
}

function quoteDisplayFromWorkstationItem(
  item: WorkstationWorkItem,
): QuoteDialogDisplay {
  const status = item.status as QuoteStatus;
  const secondaryIdentity = item.subtitle?.startsWith("Quote: ")
    ? item.subtitle.slice("Quote: ".length)
    : null;

  return {
    quoteId: item.recordId,
    primaryIdentity: item.title,
    secondaryIdentity,
    contextLine:
      item.contextLine ?? item.parentLabel ?? item.subtitle ?? "No customer or lead linked",
    statusLabel: formatQuoteStatus(status),
    statusTone: quoteStatusBadgeTone(status),
    readinessLabel: item.workflow?.statusLabel ?? "Review",
    readinessTone: "neutral",
    createdLabel: new Date(item.updatedAt).toLocaleDateString(),
    totalLabel: "—",
    href: item.href ?? `/quotes/${item.recordId}`,
    initialAction: isQuoteReadinessActionKind(item.workflow?.nextAction?.type)
      ? item.workflow.nextAction.type
      : undefined,
  };
}

export type WorkstationSelectionModalProps = {
  item: WorkstationWorkItem | null;
  /** Server-rendered panel body for task, job, and issue recovery items. */
  genericContent?: ReactNode;
};

export function WorkstationSelectionModal({
  item,
  genericContent,
}: WorkstationSelectionModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selectedId");
    params.delete("selectedKind");
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const body =
    item == null ? null : item.kind === "lead" ? (
      <LeadWorkspaceDialogBody
        key={item.id}
        leadId={item.recordId}
        onClose={handleClose}
      />
    ) : item.kind === "quote" ? (
      <QuoteWorkspaceDialogBody
        key={item.id}
        display={quoteDisplayFromWorkstationItem(item)}
        onClose={handleClose}
      />
    ) : (
      <WorkstationModalShell
        key={item.id}
        kindLabel={item.kind.replace("-", " ")}
        title={item.title}
        subtitle={item.contextLine ?? item.subtitle}
        statusLabel={item.status}
        onClose={handleClose}
        footer={
          <WorkstationWorkPanelFooter
            item={item}
            onClose={handleClose}
            showClose={false}
          />
        }
      >
        <WorkstationWorkPanel item={item} onClose={handleClose} chrome="embedded">
          {genericContent}
        </WorkstationWorkPanel>
      </WorkstationModalShell>
    );

  return (
    <Drawer
      open={item != null}
      onClose={handleClose}
      ariaLabel="Work item details"
      placement="center"
      widthClass="w-full max-w-2xl lg:max-w-3xl"
    >
      {body}
    </Drawer>
  );
}
