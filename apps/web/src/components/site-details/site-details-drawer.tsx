"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw, Save, X } from "lucide-react";
import {
  confirmSiteDetailsApnAction,
  requestSiteDetailsResearchAction,
  saveSiteDetailsApnAction,
} from "@/app/(workspace)/site-details/site-details-actions";
import type { SiteDetailsRowData } from "@/components/site-details/site-details-row";

export function SiteDetailsDrawer({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: SiteDetailsRowData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [apnPending, startApnTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [apnEditorOpen, setApnEditorOpen] = useState(false);
  const [apnDraft, setApnDraft] = useState("");
  const canResearch = Boolean(data.serviceLocationId) && data.missingScopes.length > 0;
  const hasApn = Boolean(data.apn?.trim());
  const hasConflict = Boolean(data.apnConflict?.value);
  const isReviewed = data.detailsStatus === "USER_REVIEWED";
  const isCorrected = data.detailsStatus === "USER_CORRECTED";
  const canConfirmApn = hasApn && !isReviewed && !isCorrected;
  const effectiveVerificationUrl = data.apnVerificationUrl ?? data.assessorSearchUrl ?? null;

  const summary = useMemo(
    () => ({
      apn: data.apn || "Not set",
      utility: data.utilityName || "Not set",
      jurisdiction: data.jurisdictionName || "Not set",
    }),
    [data.apn, data.utilityName, data.jurisdictionName],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-0 sm:items-stretch sm:p-0">
      <div className="h-[92vh] w-full border-l border-border bg-background sm:h-full sm:max-w-md">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Site details</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-foreground-subtle hover:bg-foreground/[0.06] hover:text-foreground"
            aria-label="Close site details"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div className="rounded-lg border border-border bg-surface p-3 text-sm text-foreground">
            <p className="font-medium">{data.line || "No service location linked."}</p>
            <p className="mt-1 text-xs text-foreground-muted">Status: {data.detailsStatus}</p>
          </div>

          <dl className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-foreground-muted">APN</dt>
              <dd className="font-medium text-foreground">{summary.apn}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-foreground-muted">Utility</dt>
              <dd className="font-medium text-foreground">{summary.utility}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-foreground-muted">Jurisdiction</dt>
              <dd className="font-medium text-foreground">{summary.jurisdiction}</dd>
            </div>
          </dl>

          <section className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Electric utility</h4>
            <p className="font-medium text-foreground">{data.utilityName || "Not found"}</p>
            <p className="text-xs text-foreground-muted">{data.detailsStatus.replaceAll("_", " ")}</p>
            <div className="flex flex-wrap gap-2">
              {data.utilityOfficialWebsite ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.utilityOfficialWebsite} target="_blank" rel="noreferrer">
                  Official website
                </a>
              ) : null}
              {data.utilityCoverageSourceUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.utilityCoverageSourceUrl} target="_blank" rel="noreferrer">
                  {data.utilityCoverageSourceTitle?.trim() ? `Coverage source: ${data.utilityCoverageSourceTitle}` : "Coverage source"}
                </a>
              ) : null}
              {data.utilityServiceUpgradeUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.utilityServiceUpgradeUrl} target="_blank" rel="noreferrer">
                  Service upgrade information
                </a>
              ) : null}
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Building department</h4>
            <p className="font-medium text-foreground">
              {data.jurisdictionBuildingDepartmentName || data.jurisdictionName || "Not found"}
            </p>
            <p className="text-xs text-foreground-muted">{data.detailsStatus.replaceAll("_", " ")}</p>
            <div className="flex flex-wrap gap-2">
              {data.jurisdictionOfficialWebsite ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.jurisdictionOfficialWebsite} target="_blank" rel="noreferrer">
                  Official department
                </a>
              ) : null}
              {data.jurisdictionBuildingDepartmentUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.jurisdictionBuildingDepartmentUrl} target="_blank" rel="noreferrer">
                  Department page
                </a>
              ) : null}
              {data.jurisdictionPermitPortalUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.jurisdictionPermitPortalUrl} target="_blank" rel="noreferrer">
                  Permit portal
                </a>
              ) : null}
              {data.jurisdictionFormsUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.jurisdictionFormsUrl} target="_blank" rel="noreferrer">
                  Forms
                </a>
              ) : null}
              {data.jurisdictionInspectionsUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.jurisdictionInspectionsUrl} target="_blank" rel="noreferrer">
                  Inspections
                </a>
              ) : null}
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">County assessor</h4>
            <p className="font-medium text-foreground">
              {data.assessorCounty && data.assessorState
                ? `${data.assessorCounty} County, ${data.assessorState}`
                : data.assessorCounty || "Not found"}
            </p>
            <p className="text-xs text-foreground-muted">Use official parcel search to verify APN details.</p>
            <div className="flex flex-wrap gap-2">
              {data.assessorSearchUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.assessorSearchUrl} target="_blank" rel="noreferrer">
                  Open official APN lookup
                </a>
              ) : null}
              {data.assessorParcelGisUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.assessorParcelGisUrl} target="_blank" rel="noreferrer">
                  Open parcel GIS
                </a>
              ) : null}
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">APN</h4>
            <p className="font-medium text-foreground">{summary.apn}</p>
            {hasApn ? (
              <p className="text-xs text-foreground-muted">
                {data.apnSourceTitle ? `AI found from ${data.apnSourceTitle}` : "APN source not recorded"}
              </p>
            ) : (
              <p className="text-xs text-foreground-muted">Not found</p>
            )}
            <p className="text-xs text-foreground-muted">
              {isCorrected ? "User corrected" : isReviewed ? "User reviewed" : "Not yet reviewed"}
            </p>
            {hasConflict && data.apnConflict ? (
              <div className="rounded border border-warning/40 bg-warning/[0.08] px-2 py-2 text-xs text-foreground">
                <p className="font-medium">APN needs review</p>
                <p className="mt-1">Saved: {data.apn || "—"}</p>
                <p>New research: {data.apnConflict.value}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {data.apnSourceUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={data.apnSourceUrl} target="_blank" rel="noreferrer">
                  Open source
                </a>
              ) : null}
              {effectiveVerificationUrl ? (
                <a className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground" href={effectiveVerificationUrl} target="_blank" rel="noreferrer">
                  Verify officially
                </a>
              ) : null}
              {canConfirmApn ? (
                <button
                  type="button"
                  disabled={apnPending}
                  onClick={() => {
                    if (!data.serviceLocationId) return;
                    setError(null);
                    startApnTransition(async () => {
                      const result = await confirmSiteDetailsApnAction(data.serviceLocationId as string);
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                >
                  {apnPending ? "Confirming..." : "Confirm APN"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setApnDraft(data.apn ?? "");
                  setApnEditorOpen((prev) => !prev);
                }}
                className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
              >
                {hasApn ? "Correct" : "Enter manually"}
              </button>
              {!hasApn ? (
                <button
                  type="button"
                  disabled={!data.serviceLocationId || pending}
                  onClick={() => {
                    if (!data.serviceLocationId) return;
                    setError(null);
                    startTransition(async () => {
                      const result = await requestSiteDetailsResearchAction(data.serviceLocationId as string, ["APN"]);
                      if (result.error) setError(result.error);
                      router.refresh();
                    });
                  }}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                >
                  {pending ? "Researching..." : "Research APN"}
                </button>
              ) : null}
            </div>
            {apnEditorOpen ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!data.serviceLocationId) return;
                  setError(null);
                  const formData = new FormData();
                  formData.set("apn", apnDraft.trim());
                  formData.set("reason", hasApn ? "manual_apn_correction" : "manual_apn_entry");
                  startApnTransition(async () => {
                    const result = await saveSiteDetailsApnAction(
                      data.serviceLocationId as string,
                      {},
                      formData,
                    );
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    setApnEditorOpen(false);
                    router.refresh();
                  });
                }}
              >
                <input
                  value={apnDraft}
                  onChange={(event) => setApnDraft(event.target.value)}
                  placeholder="Enter APN"
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />
                <button
                  type="submit"
                  disabled={apnPending}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                >
                  {apnPending ? "Saving..." : hasApn ? "Save correction" : "Save APN"}
                </button>
              </form>
            ) : null}
          </section>

          {data.missingScopes.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface p-3 text-xs text-foreground-muted">
              Missing scopes: {data.missingScopes.join(", ")}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger/[0.08] px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canResearch || pending}
              onClick={() => {
                if (!data.serviceLocationId) return;
                setError(null);
                startTransition(async () => {
                  const result = await requestSiteDetailsResearchAction(data.serviceLocationId as string);
                  if (result.error) setError(result.error);
                  router.refresh();
                });
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
              Research missing
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground"
            >
              <Save className="size-3.5" />
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
