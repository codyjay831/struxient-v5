import Link from "next/link";
import { QuoteCheckpointKind } from "@prisma/client";
import { QuoteCheckpointRecordedBody } from "@/components/quotes/quote-checkpoint-recorded-body";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  parseQuoteCheckpointStaffOnly,
  parseQuoteSendCheckpointSnapshot,
} from "@/lib/quote-checkpoint-snapshot";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function checkpointLabels(kind: QuoteCheckpointKind): {
  breadcrumbTail: string;
  title: string;
  description: string;
  calloutTitle: string;
  calloutBody: string;
} {
  if (kind === QuoteCheckpointKind.APPROVAL) {
    return {
      breadcrumbTail: `Acceptance #`,
      title: "Recorded acceptance",
      description:
        "Staff-only record of the commercial proposal the customer agreed to at this moment. Not a signed PDF vault and not job activation.",
      calloutTitle: "Commercial acceptance — internal record only",
      calloutBody:
        "This row stores what the customer-facing proposal contained when acceptance was recorded. It is not a runtime job plan and does not include internal execution tasks.",
    };
  }
  return {
    breadcrumbTail: `Send #`,
    title: "Recorded send",
    description:
      "Staff-only record of the commercial proposal as sent at this moment. Not email delivery, not a public link, and not customer approval by itself.",
    calloutTitle: "Commercial send — internal record only",
    calloutBody:
      "No email, SMS, or portal was implied by saving this row. Compare to the live working quote when you need to see what changed since capture.",
  };
}

export default async function QuoteCheckpointViewPage({
  params,
}: {
  params: Promise<{ quoteId: string; checkpointId: string }>;
}) {
  const { quoteId, checkpointId } = await params;
  const ctx = await getRequestContextOrThrow();

  const checkpoint = await db.quoteCheckpoint.findFirst({
    where: {
      id: checkpointId,
      quoteId,
      organizationId: ctx.organizationId,
      kind: { in: [QuoteCheckpointKind.SEND, QuoteCheckpointKind.APPROVAL] },
    },
    select: {
      id: true,
      kind: true,
      sequence: true,
      schemaVersion: true,
      snapshotJson: true,
      staffOnlyJson: true,
      createdAt: true,
    },
  });

  if (!checkpoint) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: "Quote", href: `/quotes/${quoteId}` },
            { label: "Not found" },
          ]}
        />
        <PageHeader
          eyebrow="Sales · internal only"
          title="Checkpoint"
          description="No checkpoint exists for this id in your organization, or it belongs to another quote."
          actions={
            <Link href={`/quotes/${quoteId}`} className={listLinkClass}>
              ← Back to quote
            </Link>
          }
        />
        <EmptyState
          icon={FileText}
          title="Checkpoint not found"
          description="Check the link or open the quote and pick a record from the commercial send & acceptance list."
        >
          <Link href={`/quotes/${quoteId}`} className={listLinkClass}>
            Back to quote
          </Link>
        </EmptyState>
      </div>
    );
  }

  const parsed = parseQuoteSendCheckpointSnapshot(checkpoint.schemaVersion, checkpoint.snapshotJson);
  const staff = parseQuoteCheckpointStaffOnly(checkpoint.staffOnlyJson);
  const capturedLabel = new Date(checkpoint.createdAt).toLocaleString();
  const labels = checkpointLabels(checkpoint.kind);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales", href: "/leads" },
          { label: "Quote", href: `/quotes/${quoteId}` },
          { label: `${labels.breadcrumbTail}${checkpoint.sequence}` },
        ]}
      />

      <PageHeader
        eyebrow="Sales · internal only"
        title={labels.title}
        description={labels.description}
        actions={
          <>
            <Link href={`/quotes/${quoteId}`} className={listLinkClass}>
              ← Back to quote
            </Link>
            <Link href="/leads" className={listLinkClass}>
              Sales pipeline
            </Link>
          </>
        }
      />

      <WorkspacePanel
        padding="compact"
        className="mb-6 border border-border border-l-[3px] border-l-accent bg-foreground/[0.02]"
      >
        <p className="text-sm font-medium text-foreground">{labels.calloutTitle}</p>
        <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
          Kind: {checkpoint.kind} · Sequence: {checkpoint.sequence} · Captured: {capturedLabel}. {labels.calloutBody}
        </p>
      </WorkspacePanel>

      {!parsed.ok ? (
        <WorkspacePanel padding="compact" className="mb-6 border border-border border-l-[3px] border-l-danger/60">
          <p className="text-sm font-medium text-foreground">Cannot display this checkpoint</p>
          <p className="mt-2 text-xs text-foreground-muted">{parsed.error}</p>
        </WorkspacePanel>
      ) : (
        <QuoteCheckpointRecordedBody
          document={parsed.document}
          showTitleFallbackWarning={staff.anyLineUsesInternalDescriptionForTitle}
        />
      )}
    </div>
  );
}
