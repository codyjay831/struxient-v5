"use client";

import { MapPin, Search, ShieldCheck } from "lucide-react";

export type SiteDetailsRowData = {
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
};

const statusLabel: Record<SiteDetailsRowData["detailsStatus"], string> = {
  DATABASE_MATCH: "Database match",
  AI_FOUND: "AI candidate",
  USER_REVIEWED: "Reviewed",
  USER_CORRECTED: "Corrected",
  UNVERIFIED: "Unverified",
  CONFLICT: "Needs conflict review",
  STALE: "Stale",
};

export function SiteDetailsRow({
  data,
  onOpen,
  showAddressLine = true,
}: {
  data: SiteDetailsRowData;
  onOpen: () => void;
  /** When false, omit the street line (already shown above in parent). */
  showAddressLine?: boolean;
}) {
  const hasAny = Boolean(data.apn || data.utilityName || data.jurisdictionName);
  const summaryLine = showAddressLine
    ? data.line?.trim() || "No service location linked yet"
    : hasAny
      ? null
      : "No details stored yet";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            <MapPin className="size-3.5" />
            Site details
          </div>
          {summaryLine ? (
            <p className="mt-1 truncate text-sm font-medium text-foreground">{summaryLine}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
            <span>{statusLabel[data.detailsStatus]}</span>
            {hasAny ? (
              <>
                {data.apn ? <span>APN: {data.apn}</span> : null}
                {data.utilityName ? <span>Utility: {data.utilityName}</span> : null}
                {data.jurisdictionName ? <span>Jurisdiction: {data.jurisdictionName}</span> : null}
              </>
            ) : (
              <span>No details stored yet</span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {data.missingScopes.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-foreground-muted">
              <Search className="size-3" />
              Missing {data.missingScopes.length}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-foreground-muted">
              <ShieldCheck className="size-3" />
              Ready
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
