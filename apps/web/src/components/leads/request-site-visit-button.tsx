"use client";

import { useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { LeadVisitRequestStatus } from "@prisma/client";
import { requestSiteVisitForLeadWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import { LeadSiteVisitSchedulerDialog } from "@/components/leads/lead-site-visit-scheduler-dialog";

import { leadReviewQuickActionClass } from "@/components/leads/lead-review-quick-action-class";

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [requestedVisitId, setRequestedVisitId] = useState<string | null>(null);
  const openVisit = findOpenVisit(visits);
  const schedulerVisitId = openVisit?.id ?? requestedVisitId;
  const schedulerInitialDate = openVisit?.confirmedDate ?? openVisit?.requestedDate ?? null;
  const schedulerMode = openVisit?.status === LeadVisitRequestStatus.CONFIRMED ? "reschedule" : "confirm";

  if (openVisit?.status === LeadVisitRequestStatus.CONFIRMED) {
    return (
      <>
        <button
          type="button"
          className={leadReviewQuickActionClass}
          title="Adjust the scheduled site visit time."
          onClick={() => setSchedulerOpen(true)}
        >
          <CalendarDays className="size-3" />
          Reschedule visit
        </button>
        <LeadSiteVisitSchedulerDialog
          open={schedulerOpen}
          onOpenChange={setSchedulerOpen}
          requestId={schedulerVisitId}
          mode={schedulerMode}
          initialDate={schedulerInitialDate}
          requestedWindow={openVisit.requestedWindow}
          onScheduled={onSuccess}
        />
      </>
    );
  }

  if (openVisit?.status === LeadVisitRequestStatus.PENDING) {
    return (
      <>
        <button
          type="button"
          className={leadReviewQuickActionClass}
          title="Pick a time and confirm this site visit."
          onClick={() => setSchedulerOpen(true)}
        >
          <CalendarDays className="size-3" />
          Schedule visit
        </button>
        <LeadSiteVisitSchedulerDialog
          open={schedulerOpen}
          onOpenChange={setSchedulerOpen}
          requestId={schedulerVisitId}
          mode="confirm"
          initialDate={schedulerInitialDate}
          requestedWindow={openVisit.requestedWindow}
          onScheduled={onSuccess}
        />
      </>
    );
  }

  if (requestedVisitId) {
    return (
      <>
        <button
          type="button"
          className={leadReviewQuickActionClass}
          title="Pick a time and confirm this site visit."
          onClick={() => setSchedulerOpen(true)}
        >
          <CalendarDays className="size-3" />
          Schedule visit
        </button>
        <LeadSiteVisitSchedulerDialog
          open={schedulerOpen}
          onOpenChange={setSchedulerOpen}
          requestId={requestedVisitId}
          mode="confirm"
          initialDate={null}
          requestedWindow={null}
          onScheduled={onSuccess}
        />
      </>
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
            setRequestedVisitId(result.visitRequestId);
            setSchedulerOpen(true);
          });
        }}
        title="Request a site visit for this lead."
        className={leadReviewQuickActionClass}
      >
        <CalendarDays className="size-3" />
        {isPending ? "Requesting..." : "Request site visit"}
      </button>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <LeadSiteVisitSchedulerDialog
        open={schedulerOpen}
        onOpenChange={setSchedulerOpen}
        requestId={schedulerVisitId}
        mode="confirm"
        initialDate={schedulerInitialDate}
        requestedWindow={openVisit?.requestedWindow}
        onScheduled={onSuccess}
      />
    </div>
  );
}
