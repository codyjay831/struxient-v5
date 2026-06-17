import type { QuoteStatus, JobStatus, SiteDetailsStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

export type QuoteChangeRequestSummary = {
  id: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  requiresVisit: boolean;
  resultingQuoteId: string | null;
};

/**
 * Serializable payload consumed by `QuoteWorkSurface`.
 *
 * Lives in `lib/` (server-safe — no React, no "use client") so server route
 * loaders and client surfaces can share the type without crossing the
 * client-boundary in either direction.
 */
export type QuoteWorkSurfaceData = {
  id: string;
  /** Internal quote title (e.g. "Q-2026-001"). */
  title: string;
  /** Display identity title — lead title → customer name → quote title. */
  primaryTitle: string;
  /** Secondary identity (rendered as "Quote: …") when distinct from primaryTitle. */
  subtitle: string | null;
  status: QuoteStatus;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  leadId: string | null;
  leadTitle: string | null;
  leadHref: string | null;
  totalCents: number;
  subtotalCents: number;
  lineItemCount: number;
  /** Optional display labels (server-formatted in fixed locale for hydration). */
  createdAtLabel?: string;
  updatedAtLabel?: string;
  activatedJobId: string | null;
  activatedJobStatus: JobStatus | null;
  /** Canonical full-record URLs. */
  quoteHref: string;
  proposalPreviewHref: string;
  executionReviewHref: string;
  /** Jobsite / project address: customer profile first, else linked lead. */
  jobsiteAddressLine: string | null;
  serviceLocationId: string | null;
  siteDetails: {
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
    detailsStatus: SiteDetailsStatus;
    missingScopes: string[];
  } | null;
  /** True when no resolved jobsite line exists for this quote. */
  jobsiteMissing: boolean;
  /** Customer exists — staff can add a saved service address on the customer profile. */
  canAddServiceAddress: boolean;
  customerEmail: string | null;
  customerPhone: string | null;
  /** US-friendly display string when {@link customerPhone} is present; otherwise null. */
  customerFormattedPhone: string | null;
  /** Share token for public proposal link (Phase F). */
  shareToken?: string | null;
  /** Optional display label for last sent email (Phase F). */
  lastSentEmailAtLabel?: string | null;
  /** Token expiration date */
  shareTokenExpiresAt?: Date | null;
  /** Token revocation date */
  shareTokenRevokedAt?: Date | null;
  organizationDisplayName: string;
  openChangeRequests: QuoteChangeRequestSummary[];
};
