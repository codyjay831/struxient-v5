"use client";

import { JobsiteCard } from "@/components/site-details/jobsite-card";
import type { SiteDetailsPayload } from "@/lib/site-details/presentation";

export function JobJobsitePanel({
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  siteDetails,
}: {
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
  siteDetails: SiteDetailsPayload | null;
}) {
  return (
    <JobsiteCard
      jobsiteAddressLine={jobsiteAddressLine}
      customerId={customerId}
      leadEditHref={leadEditHref}
      siteDetails={siteDetails}
      missingDescription="Add the project address before scheduling or creating visits."
      container="panel"
      className="mb-6"
    />
  );
}
