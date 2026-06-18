"use client";

import { Mail, Phone } from "lucide-react";
import { RequestSiteVisitButton } from "@/components/leads/request-site-visit-button";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";

import { leadReviewQuickActionClass } from "@/components/leads/lead-review-quick-action-class";

export function LeadReviewQuickActions({
  phone,
  email,
  leadId,
  visits,
  siteVisitDisabled = false,
  onSuccess,
}: {
  phone: string;
  email: string;
  leadId: string;
  visits: LeadVisitRequestPayload[];
  siteVisitDisabled?: boolean;
  onSuccess?: () => void;
}) {
  const callablePhone = phone.trim();
  const emailableAddress = email.trim();

  if (!callablePhone && !emailableAddress && siteVisitDisabled) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {callablePhone ? (
        <a href={`tel:${callablePhone}`} className={leadReviewQuickActionClass}>
          <Phone className="size-3.5" />
          Call
        </a>
      ) : null}
      {emailableAddress ? (
        <a href={`mailto:${emailableAddress}`} className={leadReviewQuickActionClass}>
          <Mail className="size-3.5" />
          Email
        </a>
      ) : null}
      {!siteVisitDisabled ? (
        <RequestSiteVisitButton leadId={leadId} visits={visits} onSuccess={onSuccess} />
      ) : null}
    </div>
  );
}
