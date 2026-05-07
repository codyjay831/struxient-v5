import type { QuoteStatus, JobStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

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
};
