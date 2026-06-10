"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";
import { SiteDetailsRow } from "@/components/site-details/site-details-row";
import { SiteDetailsDrawer } from "@/components/site-details/site-details-drawer";

const sectionLabelClass =
  "text-xs font-semibold uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground";

export function JobJobsitePanel({
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  siteDetails,
}: {
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
  siteDetails: {
    serviceLocationId: string | null;
    apn: string | null;
    apnSourceTitle?: string | null;
    apnSourceUrl?: string | null;
    apnVerificationUrl?: string | null;
    apnConflict?: {
      value: string;
      sourceTitle: string | null;
      sourceUrl: string | null;
    } | null;
    utilityName: string | null;
    utilityOfficialWebsite?: string | null;
    utilityServiceUpgradeUrl?: string | null;
    utilityCoverageSourceTitle?: string | null;
    utilityCoverageSourceUrl?: string | null;
    jurisdictionName: string | null;
    jurisdictionBuildingDepartmentName?: string | null;
    jurisdictionOfficialWebsite?: string | null;
    jurisdictionBuildingDepartmentUrl?: string | null;
    jurisdictionPermitPortalUrl?: string | null;
    jurisdictionFormsUrl?: string | null;
    jurisdictionInspectionsUrl?: string | null;
    assessorCounty?: string | null;
    assessorState?: string | null;
    assessorSearchUrl?: string | null;
    assessorParcelGisUrl?: string | null;
    detailsStatus:
      | "DATABASE_MATCH"
      | "AI_FOUND"
      | "USER_REVIEWED"
      | "USER_CORRECTED"
      | "UNVERIFIED"
      | "CONFLICT"
      | "STALE";
    missingScopes: string[];
  } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const hasLine = Boolean(jobsiteAddressLine?.trim());
  const siteData = {
    serviceLocationId: siteDetails?.serviceLocationId ?? null,
    line: jobsiteAddressLine,
    apn: siteDetails?.apn ?? null,
    apnSourceTitle: siteDetails?.apnSourceTitle ?? null,
    apnSourceUrl: siteDetails?.apnSourceUrl ?? null,
    apnVerificationUrl: siteDetails?.apnVerificationUrl ?? null,
    apnConflict: siteDetails?.apnConflict ?? null,
    utilityName: siteDetails?.utilityName ?? null,
    utilityOfficialWebsite: siteDetails?.utilityOfficialWebsite ?? null,
    utilityServiceUpgradeUrl: siteDetails?.utilityServiceUpgradeUrl ?? null,
    utilityCoverageSourceTitle: siteDetails?.utilityCoverageSourceTitle ?? null,
    utilityCoverageSourceUrl: siteDetails?.utilityCoverageSourceUrl ?? null,
    jurisdictionName: siteDetails?.jurisdictionName ?? null,
    jurisdictionBuildingDepartmentName: siteDetails?.jurisdictionBuildingDepartmentName ?? null,
    jurisdictionOfficialWebsite: siteDetails?.jurisdictionOfficialWebsite ?? null,
    jurisdictionBuildingDepartmentUrl: siteDetails?.jurisdictionBuildingDepartmentUrl ?? null,
    jurisdictionPermitPortalUrl: siteDetails?.jurisdictionPermitPortalUrl ?? null,
    jurisdictionFormsUrl: siteDetails?.jurisdictionFormsUrl ?? null,
    jurisdictionInspectionsUrl: siteDetails?.jurisdictionInspectionsUrl ?? null,
    assessorCounty: siteDetails?.assessorCounty ?? null,
    assessorState: siteDetails?.assessorState ?? null,
    assessorSearchUrl: siteDetails?.assessorSearchUrl ?? null,
    assessorParcelGisUrl: siteDetails?.assessorParcelGisUrl ?? null,
    detailsStatus: siteDetails?.detailsStatus ?? "UNVERIFIED",
    missingScopes: siteDetails?.missingScopes ?? ["APN", "UTILITY", "JURISDICTION"],
  } as const;

  return (
    <>
      <WorkspacePanel padding="compact" className="mb-6">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={sectionLabelClass}>
              {hasLine ? "Jobsite address" : "Jobsite address needed"}
            </p>
            {hasLine ? (
              <p className="mt-1 text-sm leading-relaxed text-foreground">{jobsiteAddressLine}</p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
                  Add the project address before scheduling or creating visits.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {customerId ? (
                    <button type="button" onClick={() => setOpen(true)} className={primaryBtnClass}>
                      Add jobsite address
                    </button>
                  ) : null}
                  {!customerId && leadEditHref ? (
                    <Link href={leadEditHref} className={primaryBtnClass}>
                      Add on request
                    </Link>
                  ) : null}
                  {customerId && leadEditHref ? (
                    <Link href={leadEditHref} className={secondaryBtnClass}>
                      Edit request record
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-3">
          <SiteDetailsRow data={siteData} onOpen={() => setSiteOpen(true)} />
        </div>
      </WorkspacePanel>
      {customerId ? (
        <AddOrEditServiceLocationDialog
          open={open}
          onOpenChange={setOpen}
          googleMapsApiKey={apiKey}
          customerId={customerId}
          mode="create"
          onSaved={() => {
            router.refresh();
          }}
        />
      ) : null}
      <SiteDetailsDrawer open={siteOpen} onClose={() => setSiteOpen(false)} data={siteData} />
    </>
  );
}
