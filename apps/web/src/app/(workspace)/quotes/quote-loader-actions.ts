"use server";

/**
 * Read-only loaders for the Quote work surface.
 *
 * These deliberately live in their own `"use server"` file (separate from
 * `quote-form-actions.ts`, which is mutation-only) so the lazy loader path
 * can be audited independently:
 *
 *   - org-scoped via `getRequestContextOrThrow`
 *   - re-validated by `loadQuoteWorkSurface` (which also checks org scope on
 *     the customer/lead/job relations before exposing them)
 *   - no `redirect`, no `revalidatePath`, no mutations
 *   - never trusts a client-supplied org id
 */

import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  loadQuoteWorkSurface,
  type QuoteWorkSurfaceLoaderResult,
} from "@/lib/quote-work-surface-loader";

export type LoadQuoteWorkSurfaceResult =
  | { ok: true; payload: QuoteWorkSurfaceLoaderResult }
  | { ok: false; error: string };

/**
 * Lazily fetches the QuoteWorkSurface payload for a single quote. Used by the
 * Quotes list popup so the leads/quotes list queries do not have to preload
 * activation readiness + checkpoint data per row.
 */
export async function loadQuoteWorkSurfaceAction(
  quoteId: string,
): Promise<LoadQuoteWorkSurfaceResult> {
  const id = quoteId.trim();
  if (!id) return { ok: false, error: "Missing quote id." };

  const ctx = await getRequestContextOrThrow();
  const result = await loadQuoteWorkSurface(id, ctx.organizationId);
  if (!result) {
    return { ok: false, error: "Quote not found in your organization." };
  }
  return { ok: true, payload: result };
}
