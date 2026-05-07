"use client";

import { QuoteStatus } from "@prisma/client";
import { FileText, Send, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

export type WorkstationQuotePanelProps = {
  quoteId: string;
  initialStatus: QuoteStatus;
  totalCents: number;
  readinessLabel: string;
};

export function WorkstationQuotePanel({
  quoteId,
  initialStatus,
  totalCents,
  readinessLabel,
}: WorkstationQuotePanelProps) {
  const totalDollars = (totalCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.015] p-3">
          <FileText className="size-5 text-foreground-subtle" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Commercial Total
            </p>
            <p className="text-sm font-bold text-foreground">{totalDollars}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.015] p-3">
          <div className="flex flex-col">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Readiness
            </p>
            <p className="text-sm font-bold text-foreground">{readinessLabel}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {initialStatus === QuoteStatus.DRAFT && (
          <Link
            href={`/quotes/${quoteId}#commercial-send-acceptance`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
          >
            <Send className="size-4" />
            Review and send
          </Link>
        )}

        {initialStatus === QuoteStatus.SENT && (
          <Link
            href={`/quotes/${quoteId}#commercial-send-acceptance`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
          >
            <CheckCircle2 className="size-4" />
            Record approval
          </Link>
        )}

        {initialStatus === QuoteStatus.APPROVED && (
          <Link
            href={`/quotes/${quoteId}/execution-review`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
          >
            <ArrowRight className="size-4" />
            Review execution & activate
          </Link>
        )}
      </div>
    </div>
  );
}
