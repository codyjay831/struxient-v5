"use client";

import { useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { QuoteStatus } from "@prisma/client";
import { CenteredWorkspaceDialog } from "@/components/ui/centered-workspace-dialog";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
import {
  QuoteWorkspaceDialogBody,
  type QuoteDialogDisplay,
} from "@/components/work-surfaces/quote-workspace-dialog-body";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import type { WorkstationWorkItem } from "@/lib/workstation-query";

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
      <WorkstationWorkPanel key={item.id} item={item} onClose={handleClose}>
        {genericContent}
      </WorkstationWorkPanel>
    );

  return (
    <CenteredWorkspaceDialog open={item != null} onClose={handleClose}>
      {body}
    </CenteredWorkspaceDialog>
  );
}
