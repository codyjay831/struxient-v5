import Link from "next/link";
import { QuoteStatus } from "@prisma/client";
import { QuoteMarkApprovedForm } from "@/components/quotes/quote-mark-approved-form";
import { QuoteRecordSendCheckpointForm } from "@/components/quotes/quote-record-send-checkpoint-form";
import { quoteExecutionReviewPreviewPath } from "@/lib/quote-execution-review-path";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import type { QuoteSendCheckpointSummary } from "@/lib/quote-display";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/**
 * Staff-only commercial proof: SEND (proposal as sent) and APPROVAL (customer acceptance).
 * Not a version browser; payloads stay customer-commercial only (no internal execution planning).
 */
export function QuoteSendCheckpointsStaffPanel({
  id,
  quoteId,
  quoteStatus,
  sendCheckpoints,
  approvalCheckpoints,
  customerEmail,
}: {
  id?: string;
  quoteId: string;
  quoteStatus: QuoteStatus;
  sendCheckpoints: QuoteSendCheckpointSummary[];
  approvalCheckpoints: QuoteSendCheckpointSummary[];
  customerEmail?: string | null;
}) {
  const isArchived = quoteStatus === QuoteStatus.ARCHIVED;
  const canSendQuote = quoteStatus === QuoteStatus.DRAFT;
  const canMarkApproved = quoteStatus === QuoteStatus.SENT;
  const isApproved = quoteStatus === QuoteStatus.APPROVED;

  const latestSend = sendCheckpoints.length > 0 ? sendCheckpoints[sendCheckpoints.length - 1] : null;
  const lastSendLabel = latestSend ? new Date(latestSend.createdAt).toLocaleString() : null;

  const latestApproval =
    approvalCheckpoints.length > 0 ? approvalCheckpoints[approvalCheckpoints.length - 1] : null;
  const lastApprovalLabel = latestApproval ? new Date(latestApproval.createdAt).toLocaleString() : null;

  return (
    <WorkspacePanel id={id} className="border border-border border-l-[3px] border-l-accent">
      <SectionHeading
        title="Commercial send & acceptance"
        description="Internal records only—not email, not a customer portal, and not job activation. Send captures the proposal as sent; approval captures commercial acceptance (staff-recorded until e-sign exists)."
      />

      {!isArchived && canSendQuote ? (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3">
          <p className="text-xs font-medium text-foreground">Send this quote</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            When you are ready to treat this proposal as sent to the customer, use Send quote. Commercial fields stay
            editable only while Draft—after send, scope and pricing lock here until a future revision flow exists.
          </p>
          <div className="mt-3">
            <QuoteRecordSendCheckpointForm quoteId={quoteId} customerEmail={customerEmail} />
          </div>
        </div>
      ) : null}

      {!isArchived && canMarkApproved ? (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-foreground/[0.02] px-3 py-3">
          <p className="text-xs font-medium text-foreground">Customer accepted commercially</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            This quote is Sent. When the customer has agreed to scope and price, record approval here.
            The work plan can still be updated before the job is created.
          </p>
          <div className="mt-3">
            <QuoteMarkApprovedForm quoteId={quoteId} />
          </div>
        </div>
      ) : null}

      {!isArchived && isApproved ? (
        <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] px-3 py-3">
          <p className="text-xs font-medium text-foreground">Next: review job plan before creation</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Commercial terms are approved. Review the job plan on this quote, then create the job when setup is ready.
          </p>
          <div className="mt-3">
            <Link href={quoteExecutionReviewPreviewPath(quoteId)} className={listLinkClass}>
              Review job plan
            </Link>
          </div>
        </div>
      ) : null}

      {isArchived ? (
        <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
          This quote is archived and read-only. Existing rows below stay historical; restore to draft to change status
          or commercial fields again.
        </p>
      ) : null}

      {latestSend && lastSendLabel ? (
        <p className="mt-2 text-xs font-medium text-foreground">
          Last send record: <time dateTime={latestSend.createdAt.toISOString()}>{lastSendLabel}</time>
          {latestSend.quoteUpdatedAtAtCapture ? (
            <span className="mt-1 block font-normal text-foreground-muted">
              Quote last updated at capture:{" "}
              <time dateTime={latestSend.quoteUpdatedAtAtCapture.toISOString()}>
                {new Date(latestSend.quoteUpdatedAtAtCapture).toLocaleString()}
              </time>
            </span>
          ) : null}
        </p>
      ) : null}

      {sendCheckpoints.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-foreground-muted">
          {sendCheckpoints.map((cp) => (
            <li key={cp.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                Send #{cp.sequence} · <time dateTime={cp.createdAt.toISOString()}>{new Date(cp.createdAt).toLocaleString()}</time>
              </span>
              <Link href={`/quotes/${quoteId}/checkpoints/${cp.id}`} className={listLinkClass}>
                Open record
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-xs text-foreground-muted">
          No send records yet—use Send quote while the quote is still a draft.
        </p>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">Acceptance records</p>
        {latestApproval && lastApprovalLabel ? (
          <p className="mt-2 text-xs font-medium text-foreground">
            Last acceptance record:{" "}
            <time dateTime={latestApproval.createdAt.toISOString()}>{lastApprovalLabel}</time>
          </p>
        ) : null}
        {approvalCheckpoints.length > 0 ? (
          <ul className="mt-3 space-y-2 text-xs text-foreground-muted">
            {approvalCheckpoints.map((cp) => (
              <li key={cp.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  Acceptance #{cp.sequence} ·{" "}
                  <time dateTime={cp.createdAt.toISOString()}>{new Date(cp.createdAt).toLocaleString()}</time>
                </span>
                <Link href={`/quotes/${quoteId}/checkpoints/${cp.id}`} className={listLinkClass}>
                  Open record
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-foreground-muted">No acceptance records yet.</p>
        )}
      </div>
    </WorkspacePanel>
  );
}
