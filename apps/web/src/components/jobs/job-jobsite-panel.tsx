"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";

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
}: {
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const hasLine = Boolean(jobsiteAddressLine?.trim());

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
    </>
  );
}
