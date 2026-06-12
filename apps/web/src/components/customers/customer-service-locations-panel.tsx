"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeadChannel, CustomerServiceLocationSource } from "@prisma/client";
import { MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";
import { SiteDetailsRow } from "@/components/site-details/site-details-row";
import { SiteDetailsDrawer } from "@/components/site-details/site-details-drawer";
import {
  setPrimaryCustomerServiceLocationAction,
  type CustomerServiceLocationFormState,
} from "@/app/(workspace)/customers/customer-service-location-actions";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground";

function serviceLocationProvenanceCaption(source: LeadChannel | null | undefined): string | null {
  if (!source) return null;
  if (source === "WEB_FORM") return "From public request";
  return "From linked lead";
}

function SetPrimaryServiceLocationButton({
  customerId,
  locationId,
  disabled,
}: {
  customerId: string;
  locationId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const action = setPrimaryCustomerServiceLocationAction.bind(null, customerId);
  const [state, formAction, pending] = useActionState(action, {} as CustomerServiceLocationFormState);
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="serviceLocationId" value={locationId} />
      <button type="submit" disabled={pending || disabled} className={secondaryBtnClass}>
        {pending ? "Saving…" : "Set as primary jobsite"}
      </button>
      {state.error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export type CustomerServiceLocationRow = {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  source: CustomerServiceLocationSource;
  isPrimary: boolean;
  createdFromLead: { id: string; title: string; channel: LeadChannel; source?: LeadChannel } | null;
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
};

export function CustomerServiceLocationsPanel({
  customerId,
  googleMapsApiKey,
  locations,
}: {
  customerId: string;
  googleMapsApiKey: string;
  locations: CustomerServiceLocationRow[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerServiceLocationRow | null>(null);
  const [siteDrawerData, setSiteDrawerData] = useState<{
    serviceLocationId: string | null;
    line: string | null;
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
  } | null>(null);

  return (
    <>
      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Service address needed"
          description="Add the project address before scheduling or creating a job."
        >
          <button type="button" onClick={() => setCreateOpen(true)} className={listLinkClass}>
            Add service address
          </button>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {locations.map((loc) => {
            const lead = loc.createdFromLead;
            const channelOrSource = lead?.channel ?? lead?.source ?? null;
            const sourceCaption =
              channelOrSource != null ? serviceLocationProvenanceCaption(channelOrSource) : null;
            return (
              <li key={loc.id} className="px-4 py-4">
                <div className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {loc.isPrimary ? (
                        <StatusBadge label="Primary jobsite" tone="draft" />
                      ) : null}
                      {sourceCaption ? (
                        <span className="text-xs text-foreground-muted">{sourceCaption}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {loc.formattedAddress.trim() || loc.addressLine1}
                    </p>
                    {(loc.addressLine2 ||
                      loc.city ||
                      loc.state ||
                      loc.postalCode ||
                      loc.country) && (
                      <p className="mt-1 text-xs text-foreground-muted">
                        {[
                          loc.addressLine2,
                          [loc.city, loc.state].filter(Boolean).join(", "),
                          loc.postalCode,
                          loc.country,
                        ]
                          .filter((x) => x && String(x).trim().length > 0)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTarget(loc)}
                        className={listLinkClass}
                      >
                        Edit service address
                      </button>
                      <div className="min-w-[220px] flex-1">
                        <SiteDetailsRow
                          data={{
                            serviceLocationId: loc.id,
                            line: loc.formattedAddress.trim() || loc.addressLine1 || null,
                            apn: loc.apn,
                            apnSourceTitle: loc.apnSourceTitle ?? null,
                            apnSourceUrl: loc.apnSourceUrl ?? null,
                            apnVerificationUrl: loc.apnVerificationUrl ?? null,
                            apnConflict: loc.apnConflict ?? null,
                            utilityName: loc.utilityName,
                            utilityOfficialWebsite: loc.utilityOfficialWebsite ?? null,
                            utilityServiceUpgradeUrl: loc.utilityServiceUpgradeUrl ?? null,
                            utilityCoverageSourceTitle: loc.utilityCoverageSourceTitle ?? null,
                            utilityCoverageSourceUrl: loc.utilityCoverageSourceUrl ?? null,
                            jurisdictionName: loc.jurisdictionName,
                            jurisdictionBuildingDepartmentName:
                              loc.jurisdictionBuildingDepartmentName ?? null,
                            jurisdictionOfficialWebsite: loc.jurisdictionOfficialWebsite ?? null,
                            jurisdictionBuildingDepartmentUrl:
                              loc.jurisdictionBuildingDepartmentUrl ?? null,
                            jurisdictionPermitPortalUrl: loc.jurisdictionPermitPortalUrl ?? null,
                            jurisdictionFormsUrl: loc.jurisdictionFormsUrl ?? null,
                            jurisdictionInspectionsUrl: loc.jurisdictionInspectionsUrl ?? null,
                            assessorCounty: loc.assessorCounty ?? null,
                            assessorState: loc.assessorState ?? null,
                            assessorSearchUrl: loc.assessorSearchUrl ?? null,
                            assessorParcelGisUrl: loc.assessorParcelGisUrl ?? null,
                            detailsStatus: loc.detailsStatus,
                            missingScopes: [
                              ...(loc.apn?.trim() ? [] : ["APN"]),
                              ...(loc.utilityName ? [] : ["UTILITY"]),
                              ...(loc.jurisdictionName ? [] : ["JURISDICTION"]),
                              ...(loc.assessorSearchUrl || loc.assessorParcelGisUrl
                                ? []
                                : ["ASSESSOR_RESOURCE"]),
                            ],
                          }}
                          onOpen={() =>
                            setSiteDrawerData({
                              serviceLocationId: loc.id,
                              line: loc.formattedAddress.trim() || loc.addressLine1 || null,
                              apn: loc.apn,
                              apnSourceTitle: loc.apnSourceTitle ?? null,
                              apnSourceUrl: loc.apnSourceUrl ?? null,
                              apnVerificationUrl: loc.apnVerificationUrl ?? null,
                              apnConflict: loc.apnConflict ?? null,
                              utilityName: loc.utilityName,
                              utilityOfficialWebsite: loc.utilityOfficialWebsite ?? null,
                              utilityServiceUpgradeUrl: loc.utilityServiceUpgradeUrl ?? null,
                              utilityCoverageSourceTitle: loc.utilityCoverageSourceTitle ?? null,
                              utilityCoverageSourceUrl: loc.utilityCoverageSourceUrl ?? null,
                              jurisdictionName: loc.jurisdictionName,
                              jurisdictionBuildingDepartmentName:
                                loc.jurisdictionBuildingDepartmentName ?? null,
                              jurisdictionOfficialWebsite: loc.jurisdictionOfficialWebsite ?? null,
                              jurisdictionBuildingDepartmentUrl:
                                loc.jurisdictionBuildingDepartmentUrl ?? null,
                              jurisdictionPermitPortalUrl: loc.jurisdictionPermitPortalUrl ?? null,
                              jurisdictionFormsUrl: loc.jurisdictionFormsUrl ?? null,
                              jurisdictionInspectionsUrl: loc.jurisdictionInspectionsUrl ?? null,
                              assessorCounty: loc.assessorCounty ?? null,
                              assessorState: loc.assessorState ?? null,
                              assessorSearchUrl: loc.assessorSearchUrl ?? null,
                              assessorParcelGisUrl: loc.assessorParcelGisUrl ?? null,
                              detailsStatus: loc.detailsStatus,
                              missingScopes: [
                                ...(loc.apn?.trim() ? [] : ["APN"]),
                                ...(loc.utilityName ? [] : ["UTILITY"]),
                                ...(loc.jurisdictionName ? [] : ["JURISDICTION"]),
                                ...(loc.assessorSearchUrl || loc.assessorParcelGisUrl
                                  ? []
                                  : ["ASSESSOR_RESOURCE"]),
                              ],
                            })
                          }
                        />
                      </div>
                      {!loc.isPrimary ? (
                        <SetPrimaryServiceLocationButton
                          customerId={customerId}
                          locationId={loc.id}
                          disabled={false}
                        />
                      ) : null}
                    </div>
                    {lead ? (
                      <p className="mt-2 text-xs text-foreground-subtle">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          View linked lead
                        </Link>
                        <span className="text-foreground-muted"> · {lead.title}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {locations.length > 0 ? (
        <div className="mt-4">
          <button type="button" onClick={() => setCreateOpen(true)} className={listLinkClass}>
            Add service address
          </button>
        </div>
      ) : null}

      <AddOrEditServiceLocationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        googleMapsApiKey={googleMapsApiKey}
        customerId={customerId}
        mode="create"
        onSaved={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
      {editTarget ? (
        <AddOrEditServiceLocationDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          googleMapsApiKey={googleMapsApiKey}
          customerId={customerId}
          mode="edit"
          existingLocation={editTarget}
          onSaved={() => {
            setEditTarget(null);
            router.refresh();
          }}
        />
      ) : null}
      {siteDrawerData ? (
        <SiteDetailsDrawer
          open
          onClose={() => setSiteDrawerData(null)}
          data={siteDrawerData}
        />
      ) : null}
    </>
  );
}
