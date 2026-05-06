import Link from "next/link";
import { QuoteRecordSendCheckpointForm } from "@/components/quotes/quote-record-send-checkpoint-form";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import type { QuoteSendCheckpointSummary } from "@/lib/quote-display";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

/**
 * Staff-only list of SEND checkpoints — not a quote version manager.
 * QuoteCheckpoint rows are internal proof; SEND is not an execution or delivery signal.
 */
export function QuoteSendCheckpointsStaffPanel({
  quoteId,
  isDraft,
  sendCheckpoints,
}: {
  quoteId: string;
  isDraft: boolean;
  sendCheckpoints: QuoteSendCheckpointSummary[];
}) {
  const latest = sendCheckpoints.length > 0 ? sendCheckpoints[sendCheckpoints.length - 1] : null;
  const lastRecordedLabel = latest ? new Date(latest.createdAt).toLocaleString() : null;

  return (
    <WorkspacePanel className="border border-border border-l-[3px] border-l-accent">
      <SectionHeading
        title="Recorded send checkpoints"
        description="Staff-only hidden checkpoints: proof of optional proposal wording from the quote at each capture moment. Not email, SMS, a portal link, or approval. The live proposal preview elsewhere always follows the current working quote."
      />

      {isDraft ? (
        <>
          <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
            Recording a checkpoint stores internal proof from the quote as it is now. It does not email, text, or publish
            an external link. Edit the working quote freely; record again when you want a new proof row.
          </p>
          <QuoteRecordSendCheckpointForm quoteId={quoteId} />
        </>
      ) : (
        <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
          This quote is archived and read-only. You cannot record new sends; existing checkpoints below remain
          historical proof only.
        </p>
      )}

      {latest && lastRecordedLabel ? (
        <p className="mt-4 text-xs font-medium text-foreground">
          Last recorded checkpoint: <time dateTime={latest.createdAt.toISOString()}>{lastRecordedLabel}</time>
          {latest.quoteUpdatedAtAtCapture ? (
            <span className="mt-1 block font-normal text-foreground-muted">
              Workspace last updated at capture:{" "}
              <time dateTime={latest.quoteUpdatedAtAtCapture.toISOString()}>
                {new Date(latest.quoteUpdatedAtAtCapture).toLocaleString()}
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
                Checkpoint #{cp.sequence} ·{" "}
                <time dateTime={cp.createdAt.toISOString()}>{new Date(cp.createdAt).toLocaleString()}</time>
              </span>
              <Link href={`/quotes/${quoteId}/checkpoints/${cp.id}`} className={listLinkClass}>
                Open checkpoint
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-xs text-foreground-muted">
          No send checkpoints yet — the working quote is the only live copy until you record one.
        </p>
      )}
    </WorkspacePanel>
  );
}
