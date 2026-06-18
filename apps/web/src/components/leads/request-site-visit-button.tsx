"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { LeadVisitRequestStatus } from "@prisma/client";
import { requestSiteVisitForLeadWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";

const quickActionClass =
  "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

function findOpenVisit(visits: LeadVisitRequestPayload[]) {
  return (
    visits.find(
      (visit) =>
        visit.status === LeadVisitRequestStatus.PENDING ||
        visit.status === LeadVisitRequestStatus.CONFIRMED,
    ) ?? null
  );
}

export function RequestSiteVisitButton({
  leadId,
  visits,
  disabled = false,
  onSuccess,
}: {
  leadId: string;
  visits: LeadVisitRequestPayload[];
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const openVisit = findOpenVisit(visits);

  if (openVisit?.status === LeadVisitRequestStatus.CONFIRMED) {
    return (
      <Link href="/schedule" className={quickActionClass} title="Open schedule to complete this site visit.">
        <CalendarDays className="size-3" />
        Complete visit
      </Link>
    );
  }

  if (openVisit?.status === LeadVisitRequestStatus.PENDING) {
    return (
      <Link href="/schedule" className={quickActionClass} title="Open schedule to confirm this site visit.">
        <CalendarDays className="size-3" />
        Schedule site visit
      </Link>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await requestSiteVisitForLeadWorkspaceAction(leadId);
            if (!result.ok) {
              setError(result.error ?? "Could not request a site visit.");
              return;
            }
            onSuccess?.();
            router.push("/schedule");
            router.refresh();
          });
        }}
        title="Request a site visit for this lead."
        className={quickActionClass}
      >
        <CalendarDays className="size-3" />
        {isPending ? "Requesting..." : "Request site visit"}
      </button>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
