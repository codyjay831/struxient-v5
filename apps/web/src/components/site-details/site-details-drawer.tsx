"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, RefreshCcw, Save, X } from "lucide-react";
import {
  clearUnreviewedAiSiteDetailsAction,
  confirmSiteDetailsApnAction,
  listElectricUtilityOptionsAction,
  listJurisdictionOptionsAction,
  markSiteDetailsReviewedAction,
  requestSiteDetailsResearchAction,
  saveSiteDetailsApnAction,
  saveSiteDetailsJurisdictionAction,
  saveSiteDetailsUtilityAction,
} from "@/app/(workspace)/site-details/site-details-actions";
import type { SiteDetailsRowData } from "@/lib/site-details/presentation";

const statusLabel: Record<SiteDetailsRowData["detailsStatus"], string> = {
  DATABASE_MATCH: "Database match",
  AI_FOUND: "AI candidate",
  USER_REVIEWED: "Reviewed",
  USER_CORRECTED: "Corrected",
  UNVERIFIED: "Unverified",
  CONFLICT: "Needs review",
  STALE: "Stale",
};

function DetailDisclosure({
  title,
  primary,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  primary: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="mt-0.5 size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
            {title}
          </p>
          <p className="truncate text-sm font-medium text-foreground">{primary}</p>
          {meta ? <p className="mt-0.5 text-xs text-foreground-muted">{meta}</p> : null}
        </div>
      </summary>
      <div className="mt-3 border-t border-border pt-3">{children}</div>
    </details>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

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
  const [savingPending, startSavingTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [apnEditorOpen, setApnEditorOpen] = useState(false);
  const [apnDraft, setApnDraft] = useState("");
  const [utilityEditorOpen, setUtilityEditorOpen] = useState(false);
  const [jurisdictionEditorOpen, setJurisdictionEditorOpen] = useState(false);
  const [utilityOptions, setUtilityOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [jurisdictionOptions, setJurisdictionOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [utilityDraftId, setUtilityDraftId] = useState("");
  const [jurisdictionDraftId, setJurisdictionDraftId] = useState("");
  const canResearch = Boolean(data.serviceLocationId) && data.missingScopes.length > 0;
  const hasApn = Boolean(data.apn?.trim());
  const hasConflict = Boolean(data.apnConflict?.value);
  const isReviewed = data.detailsStatus === "USER_REVIEWED";
  const isCorrected = data.detailsStatus === "USER_CORRECTED";
  const canConfirmApn = hasApn && !isReviewed && !isCorrected;
  const effectiveVerificationUrl = data.apnVerificationUrl ?? data.assessorSearchUrl ?? null;
  const apnDisclosureDefaultOpen = hasConflict || !hasApn || apnEditorOpen;

  const summary = useMemo(
    () => ({
      apn: data.apn || "Not set",
      utility: data.utilityName || "Not set",
      jurisdiction: data.jurisdictionName || "Not set",
    }),
    [data.apn, data.utilityName, data.jurisdictionName],
  );

  useEffect(() => {
    if (!open || !utilityEditorOpen) return;
    let cancelled = false;
    listElectricUtilityOptionsAction()
      .then((items) => {
        if (!cancelled) setUtilityOptions(items);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load electric utility options.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, utilityEditorOpen]);

  useEffect(() => {
    if (!open || !jurisdictionEditorOpen) return;
    let cancelled = false;
    listJurisdictionOptionsAction()
      .then((items) => {
        if (!cancelled) setJurisdictionOptions(items);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load jurisdiction options.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, jurisdictionEditorOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-0 sm:items-stretch sm:p-0">
      <div className="flex h-[92vh] min-h-0 w-full flex-col overflow-hidden border-l border-border bg-background sm:h-full sm:max-w-md">
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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <section className="rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-medium text-foreground">{data.line || "No service location linked."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-foreground-muted">
              <span className="rounded-full border border-border px-2 py-0.5">
                {statusLabel[data.detailsStatus]}
              </span>
              <span className="rounded-full border border-border px-2 py-0.5">
                {isCorrected ? "User corrected" : isReviewed ? "User reviewed" : "Not yet reviewed"}
              </span>
              {hasConflict ? (
                <span className="rounded-full border border-warning/40 bg-warning/[0.08] px-2 py-0.5 text-foreground">
                  APN conflict
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-foreground-subtle">APN</dt>
                <dd className="mt-0.5 break-words text-foreground">{summary.apn}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-foreground-subtle">Utility</dt>
                <dd className="mt-0.5 break-words text-foreground">{summary.utility}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-foreground-subtle">Jurisdiction</dt>
                <dd className="mt-0.5 break-words text-foreground">{summary.jurisdiction}</dd>
              </div>
            </dl>
          </section>

          <DetailDisclosure
            title="APN"
            primary={summary.apn}
            meta={
              hasApn
                ? data.apnSourceTitle
                  ? `AI candidate from ${data.apnSourceTitle}`
                  : "APN source not recorded"
                : "No APN stored yet"
            }
            defaultOpen={apnDisclosureDefaultOpen}
          >
            <div className="space-y-3">
              {hasConflict && data.apnConflict ? (
                <div className="rounded border border-warning/40 bg-warning/[0.08] px-2 py-2 text-xs text-foreground">
                  <p className="font-medium">APN needs review</p>
                  <p className="mt-1">Saved: {data.apn || "—"}</p>
                  <p>New research: {data.apnConflict.value}</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Verification
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.apnSourceUrl ? <LinkChip href={data.apnSourceUrl} label="Open source" /> : null}
                  {effectiveVerificationUrl ? (
                    <LinkChip href={effectiveVerificationUrl} label="Verify officially" />
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Decision
                </p>
                <div className="flex flex-wrap gap-2">
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
                  {hasApn ? (
                    <button
                      type="button"
                      disabled={apnPending}
                      onClick={() => {
                        if (!data.serviceLocationId) return;
                        setError(null);
                        const formData = new FormData();
                        formData.set("apn", "");
                        formData.set("reason", "manual_apn_clear");
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
                          router.refresh();
                        });
                      }}
                      className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                    >
                      {apnPending ? "Clearing..." : "Clear APN"}
                    </button>
                  ) : null}
                  {hasConflict && data.apnConflict?.value ? (
                    <>
                      <button
                        type="button"
                        disabled={apnPending}
                        onClick={() => {
                          if (!data.serviceLocationId || !data.apn) return;
                          setError(null);
                          const formData = new FormData();
                          formData.set("apn", data.apn);
                          formData.set("reason", "manual_keep_saved_apn");
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
                            router.refresh();
                          });
                        }}
                        className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                      >
                        Keep saved APN
                      </button>
                      <button
                        type="button"
                        disabled={apnPending}
                        onClick={() => {
                          if (!data.serviceLocationId) return;
                          setError(null);
                          const formData = new FormData();
                          formData.set("apn", data.apnConflict!.value);
                          formData.set("reason", "manual_accept_research_apn");
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
                            router.refresh();
                          });
                        }}
                        className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                      >
                        Accept research APN
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {!hasApn ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Recovery
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!data.serviceLocationId || pending}
                      onClick={() => {
                        if (!data.serviceLocationId) return;
                        setError(null);
                        startTransition(async () => {
                          const result = await requestSiteDetailsResearchAction(
                            data.serviceLocationId as string,
                            ["APN"],
                          );
                          if (result.error) setError(result.error);
                          router.refresh();
                        });
                      }}
                      className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                    >
                      {pending ? "Researching..." : "Research APN"}
                    </button>
                  </div>
                </div>
              ) : null}

              {apnEditorOpen ? (
                <form
                  className="space-y-2 border-t border-border pt-3"
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
            </div>
          </DetailDisclosure>

          <DetailDisclosure
            title="Electric utility"
            primary={data.utilityName || "Not set"}
            meta={statusLabel[data.detailsStatus]}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {data.utilityOfficialWebsite ? (
                  <LinkChip href={data.utilityOfficialWebsite} label="Official website" />
                ) : null}
                {data.utilityCoverageSourceUrl ? (
                  <LinkChip
                    href={data.utilityCoverageSourceUrl}
                    label={
                      data.utilityCoverageSourceTitle?.trim()
                        ? `Coverage source: ${data.utilityCoverageSourceTitle}`
                        : "Coverage source"
                    }
                  />
                ) : null}
                {data.utilityServiceUpgradeUrl ? (
                  <LinkChip href={data.utilityServiceUpgradeUrl} label="Service upgrade information" />
                ) : null}
                {!data.utilityOfficialWebsite &&
                !data.utilityCoverageSourceUrl &&
                !data.utilityServiceUpgradeUrl ? (
                  <p className="text-xs text-foreground-muted">No utility references recorded.</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUtilityEditorOpen((prev) => !prev)}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
                >
                  {data.utilityName ? "Edit electric utility" : "Set electric utility"}
                </button>
                {data.utilityName ? (
                  <button
                    type="button"
                    disabled={savingPending}
                    onClick={() => {
                      if (!data.serviceLocationId) return;
                      setError(null);
                      const formData = new FormData();
                      formData.set("utilityId", "");
                      formData.set("reason", "manual_utility_clear");
                      startSavingTransition(async () => {
                        const result = await saveSiteDetailsUtilityAction(
                          data.serviceLocationId as string,
                          {},
                          formData,
                        );
                        if (result.error) {
                          setError(result.error);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                  >
                    {savingPending ? "Clearing..." : "Clear electric utility"}
                  </button>
                ) : null}
              </div>
              {utilityEditorOpen ? (
                <form
                  className="space-y-2 border-t border-border pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!data.serviceLocationId || !utilityDraftId.trim()) return;
                    setError(null);
                    const formData = new FormData();
                    formData.set("utilityId", utilityDraftId);
                    formData.set("reason", "manual_utility_assignment");
                    startSavingTransition(async () => {
                      const result = await saveSiteDetailsUtilityAction(
                        data.serviceLocationId as string,
                        {},
                        formData,
                      );
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      setUtilityEditorOpen(false);
                      router.refresh();
                    });
                  }}
                >
                  <select
                    value={utilityDraftId}
                    onChange={(event) => setUtilityDraftId(event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  >
                    <option value="">Select electric utility</option>
                    {utilityOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={savingPending || !utilityDraftId.trim()}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                  >
                    {savingPending ? "Saving..." : "Save utility"}
                  </button>
                </form>
              ) : null}
            </div>
          </DetailDisclosure>

          <DetailDisclosure
            title="Building department"
            primary={data.jurisdictionBuildingDepartmentName || data.jurisdictionName || "Not found"}
            meta={statusLabel[data.detailsStatus]}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {data.jurisdictionOfficialWebsite ? (
                  <LinkChip href={data.jurisdictionOfficialWebsite} label="Official department" />
                ) : null}
                {data.jurisdictionBuildingDepartmentUrl ? (
                  <LinkChip href={data.jurisdictionBuildingDepartmentUrl} label="Department page" />
                ) : null}
                {data.jurisdictionPermitPortalUrl ? (
                  <LinkChip href={data.jurisdictionPermitPortalUrl} label="Permit portal" />
                ) : null}
                {data.jurisdictionFormsUrl ? <LinkChip href={data.jurisdictionFormsUrl} label="Forms" /> : null}
                {data.jurisdictionInspectionsUrl ? (
                  <LinkChip href={data.jurisdictionInspectionsUrl} label="Inspections" />
                ) : null}
                {!data.jurisdictionOfficialWebsite &&
                !data.jurisdictionBuildingDepartmentUrl &&
                !data.jurisdictionPermitPortalUrl &&
                !data.jurisdictionFormsUrl &&
                !data.jurisdictionInspectionsUrl ? (
                  <p className="text-xs text-foreground-muted">
                    No department references recorded.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setJurisdictionEditorOpen((prev) => !prev)}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
                >
                  {data.jurisdictionName ? "Edit jurisdiction" : "Set jurisdiction"}
                </button>
                {data.jurisdictionName ? (
                  <button
                    type="button"
                    disabled={savingPending}
                    onClick={() => {
                      if (!data.serviceLocationId) return;
                      setError(null);
                      const formData = new FormData();
                      formData.set("jurisdictionId", "");
                      formData.set("reason", "manual_jurisdiction_clear");
                      startSavingTransition(async () => {
                        const result = await saveSiteDetailsJurisdictionAction(
                          data.serviceLocationId as string,
                          {},
                          formData,
                        );
                        if (result.error) {
                          setError(result.error);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                  >
                    {savingPending ? "Clearing..." : "Clear jurisdiction"}
                  </button>
                ) : null}
              </div>
              {jurisdictionEditorOpen ? (
                <form
                  className="space-y-2 border-t border-border pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!data.serviceLocationId || !jurisdictionDraftId.trim()) return;
                    setError(null);
                    const formData = new FormData();
                    formData.set("jurisdictionId", jurisdictionDraftId);
                    formData.set("reason", "manual_jurisdiction_assignment");
                    startSavingTransition(async () => {
                      const result = await saveSiteDetailsJurisdictionAction(
                        data.serviceLocationId as string,
                        {},
                        formData,
                      );
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      setJurisdictionEditorOpen(false);
                      router.refresh();
                    });
                  }}
                >
                  <select
                    value={jurisdictionDraftId}
                    onChange={(event) => setJurisdictionDraftId(event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  >
                    <option value="">Select jurisdiction</option>
                    {jurisdictionOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={savingPending || !jurisdictionDraftId.trim()}
                    className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
                  >
                    {savingPending ? "Saving..." : "Save jurisdiction"}
                  </button>
                </form>
              ) : null}
            </div>
          </DetailDisclosure>

          <DetailDisclosure
            title="County assessor"
            primary={
              data.assessorCounty && data.assessorState
                ? `${data.assessorCounty} County, ${data.assessorState}`
                : data.assessorCounty || "Not found"
            }
            meta="Use official parcel search to verify APN details."
          >
            <div className="flex flex-wrap gap-2">
              {data.assessorSearchUrl ? (
                <LinkChip href={data.assessorSearchUrl} label="Open official APN lookup" />
              ) : null}
              {data.assessorParcelGisUrl ? (
                <LinkChip href={data.assessorParcelGisUrl} label="Open parcel GIS" />
              ) : null}
              {!data.assessorSearchUrl && !data.assessorParcelGisUrl ? (
                <p className="text-xs text-foreground-muted">No assessor links recorded.</p>
              ) : null}
            </div>
          </DetailDisclosure>

          {data.missingScopes.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface p-2.5 text-xs text-foreground-muted">
              Missing scopes: {data.missingScopes.join(", ")}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger/[0.08] px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!data.serviceLocationId || savingPending}
              onClick={() => {
                if (!data.serviceLocationId) return;
                setError(null);
                const formData = new FormData();
                formData.set("notes", "");
                startSavingTransition(async () => {
                  const result = await markSiteDetailsReviewedAction(
                    data.serviceLocationId as string,
                    {},
                    formData,
                  );
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
            >
              {savingPending ? "Saving..." : "Mark reviewed"}
            </button>
            <button
              type="button"
              disabled={!data.serviceLocationId || savingPending}
              onClick={() => {
                if (!data.serviceLocationId) return;
                setError(null);
                startSavingTransition(async () => {
                  const result = await clearUnreviewedAiSiteDetailsAction(
                    data.serviceLocationId as string,
                  );
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
              className="rounded border border-border px-2 py-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
            >
              {savingPending ? "Clearing..." : "Clear unreviewed AI results"}
            </button>
          </div>

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
