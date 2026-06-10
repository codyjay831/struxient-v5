"use client";

/**
 * LeadServiceAddressBlock — Lead workspace Customer Info / Contact-tab block
 * that owns the Service address UX inside the Lead workspace.
 *
 * The component picks the correct UX for the lead's current state:
 *
 *   - Linked customer  → reuses CustomerServiceLocationsPanel (writes go to
 *                         CustomerServiceLocation via the existing org-scoped
 *                         service-location actions; dedupe + primary toggling
 *                         are preserved).
 *   - Unlinked lead → small inline editor that posts to
 *                         updateLeadServiceAddressWorkspaceAction (writes go
 *                         to Lead.publicIntakeServiceLocation using the same
 *                         parsing path the staff lead form uses).
 *
 * The block is fully optional — if no `context` and no `loadContext` is
 * provided, it shows a plain read-only line + a footer link to the full
 * lead record so existing compact callers don't break.
 *
 * Copy follows the locked product copy ("Service address", "Service address
 * needed", "Add the project address before scheduling or creating a job.",
 * "Add service address", "Edit service address"). It never explains schema,
 * snapshots, or downstream plumbing in the primary surface.
 */

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, MapPin } from "lucide-react";
import {
  CustomerServiceLocationsPanel,
  type CustomerServiceLocationRow,
} from "@/components/customers/customer-service-locations-panel";
import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";
import {
  updateLeadServiceAddressWorkspaceAction,
  type LeadServiceAddressContext,
  type LeadServiceLocationRowPayload,
  type LoadLeadServiceAddressContextResult,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/lead-workspace-actions";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const fieldLabelClass = sectionLabelClass;
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const primaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground";

const mutedFooterLinkClass =
  "inline-flex items-center gap-1 text-xs text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground";

/* ─── Types ────────────────────────────────────────────────────────────── */

export type { LeadServiceAddressContext, LeadServiceLocationRowPayload };

export type LeadServiceAddressBlockHandle = {
  /** Scrolls the block into view and emphasizes it (used by Quote tab nudge). */
  focus: () => void;
};

export type LeadServiceAddressBlockProps = {
  leadId: string;
  /** /leads/[id]/edit — used by the read-only footer link. */
  leadEditHref: string;
  /** Pre-loaded context (Lead full page + Workstation drawer pass this). */
  context?: LeadServiceAddressContext;
  /** Lazy loader (Leads list popup passes this — leaves `context` undefined). */
  loadContext?: () => Promise<LoadLeadServiceAddressContextResult>;
  /** Header-line read-only fallback when context isn't available yet. */
  fallbackAddressLine?: string | null;
  /** Whether a linked customer exists (drives copy when context is loading). */
  hasLinkedCustomer: boolean;
  /** Called after a successful inline mutation so the parent can `router.refresh()`. */
  onMutated?: () => void;
};

/* ─── Inline editor for unlinked leads (writes to Lead.publicIntakeServiceLocation) ── */

function LeadServiceAddressInlineEditor({
  leadId,
  defaultDisplayAddress,
  initialStructuredJson,
  onSuccess,
  onCancel,
  isInitialEntry,
}: {
  leadId: string;
  defaultDisplayAddress: string;
  initialStructuredJson: string;
  onSuccess: () => void;
  onCancel: () => void;
  isInitialEntry: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  /* Stable per-lead key — the whole editor unmounts when its parent toggles
   * `isEditingIntake`, so we don't need a per-mount nonce here. */
  const formKey = `lead-svc-${leadId}`;
  const boundAction = updateLeadServiceAddressWorkspaceAction.bind(null, leadId);
  const [state, dispatch, isPending] = useActionState<WorkspaceFormState, FormData>(
    boundAction,
    {},
  );
  const succeededRef = useRef(false);

  useEffect(() => {
    if (state.success && !succeededRef.current) {
      succeededRef.current = true;
      onSuccess();
    }
  }, [state.success, onSuccess]);

  return (
    <form key={formKey} action={dispatch} className="space-y-3">
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <ServiceAddressCaptureField
        googleMapsApiKey={apiKey}
        fieldLabelClass={fieldLabelClass}
        controlClass={controlClass}
        required
        defaultDisplayAddress={defaultDisplayAddress}
        initialStructuredJson={initialStructuredJson}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" disabled={isPending} className={primaryBtnClass}>
          {isPending ? "Saving…" : isInitialEntry ? "Add service address" : "Save service address"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtnClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─── Main block ───────────────────────────────────────────────────────── */

function ReadOnlyAddressLine({ value }: { value: string }) {
  return (
    <div className="flex gap-3">
      <MapPin
        className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function MissingAddressEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <MapPin
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
          strokeWidth={1.5}
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-foreground">Service address needed</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
            Add the project address before scheduling or creating a job.
          </p>
        </div>
      </div>
      <button type="button" onClick={onAdd} className={primaryBtnClass}>
        Add service address
      </button>
    </div>
  );
}

export const LeadServiceAddressBlock = forwardRef<
  LeadServiceAddressBlockHandle,
  LeadServiceAddressBlockProps
>(function LeadServiceAddressBlock(
  {
    leadId,
    leadEditHref,
    context: passedContext,
    loadContext,
    fallbackAddressLine,
    hasLinkedCustomer,
    onMutated,
  },
  ref,
) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  /* Lazy-load state for popup container (Leads list dialog) — preloaded
   * containers (Lead full page, Workstation drawer) pass `context` directly
   * and skip the loader entirely. */
  const [lazyContext, setLazyContext] = useState<LeadServiceAddressContext | null>(null);
  const [lazyError, setLazyError] = useState<string | null>(null);
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const loadIdRef = useRef(0);
  const [emphasized, setEmphasized] = useState(false);

  const effectiveContext: LeadServiceAddressContext | null =
    passedContext ?? lazyContext;

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setEmphasized(true);
        window.setTimeout(() => setEmphasized(false), 1800);
      },
    }),
    [],
  );

  const runLoad = useCallback(() => {
    if (passedContext != null) return;
    if (!loadContext) return;
    loadIdRef.current += 1;
    const myId = loadIdRef.current;
    setIsLazyLoading(true);
    setLazyError(null);
    void loadContext()
      .then((res) => {
        if (myId !== loadIdRef.current) return;
        if (res.ok) {
          setLazyContext(res.context);
        } else {
          setLazyError(res.error);
        }
      })
      .catch((err: unknown) => {
        if (myId !== loadIdRef.current) return;
        const message =
          err instanceof Error
            ? err.message
            : "Couldn't load the service address right now. Open the full lead record to manage it.";
        setLazyError(message);
      })
      .finally(() => {
        if (myId === loadIdRef.current) {
          setIsLazyLoading(false);
        }
      });
  }, [passedContext, loadContext]);

  /* Kick off the lazy load on first mount when no context was preloaded.
   * Defer to a microtask so the setState calls inside runLoad don't
   * trigger a cascading-render lint warning. */
  useEffect(() => {
    if (passedContext != null) return;
    if (!loadContext) return;
    if (lazyContext != null || isLazyLoading) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      runLoad();
    });
    return () => {
      cancelled = true;
    };
  }, [passedContext, loadContext, lazyContext, isLazyLoading, runLoad]);

  /* Local state for the unlinked-lead inline editor. */
  const [isEditingIntake, setIsEditingIntake] = useState(false);

  function handleMutated() {
    onMutated?.();
    router.refresh();
    /* Re-load context so any propagated customer-side changes show
     * immediately when this block was lazy-loaded (popup case). */
    if (passedContext == null) {
      runLoad();
    }
  }

  const containerClass = [
    "rounded-xl border border-border bg-surface p-4 transition-colors",
    emphasized
      ? "border-border-strong bg-foreground/[0.02] ring-2 ring-accent/30 ring-offset-2 ring-offset-background"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  /* ── Loading / error states ─────────────────────────────────────────── */
  if (effectiveContext == null) {
    if (lazyError) {
      return (
        <div ref={containerRef} className={containerClass} aria-labelledby={headingId}>
          <p id={headingId} className={`${sectionLabelClass} mb-2`}>
            Service address
          </p>
          <p className="text-xs text-foreground-muted">
            {lazyError}{" "}
            <Link href={leadEditHref} className="underline underline-offset-2">
              Open the full lead record
            </Link>{" "}
            to manage the address.
          </p>
        </div>
      );
    }
    if (isLazyLoading) {
      return (
        <div ref={containerRef} className={containerClass} aria-labelledby={headingId}>
          <p id={headingId} className={`${sectionLabelClass} mb-2`}>
            Service address
          </p>
          <p className="text-xs text-foreground-muted" role="status" aria-live="polite">
            Loading service address…
          </p>
        </div>
      );
    }
    /* No loader provided and no preloaded context: show a read-only line
     * (when known) plus a link out to the full lead record. */
    return (
      <div ref={containerRef} className={containerClass} aria-labelledby={headingId}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p id={headingId} className={sectionLabelClass}>
            Service address
          </p>
        </div>
        {fallbackAddressLine ? (
          <ReadOnlyAddressLine value={fallbackAddressLine} />
        ) : (
          <p className="text-sm text-foreground-muted">
            {hasLinkedCustomer
              ? "No service address on the linked customer yet."
              : "No service address on this request yet."}
          </p>
        )}
        <div className="mt-3">
          <Link href={leadEditHref} className={mutedFooterLinkClass}>
            Manage in the full lead record
            <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    );
  }

  /* ── Linked customer: reuse the CustomerServiceLocationsPanel ───────── */
  if (effectiveContext.customer) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
    const customerRows: CustomerServiceLocationRow[] =
      effectiveContext.customer.serviceLocations.map((loc) => ({
        id: loc.id,
        formattedAddress: loc.formattedAddress,
        addressLine1: loc.addressLine1,
        addressLine2: loc.addressLine2,
        city: loc.city,
        state: loc.state,
        postalCode: loc.postalCode,
        country: loc.country,
        googlePlaceId: loc.googlePlaceId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        source: loc.source,
        isPrimary: loc.isPrimary,
        apn: loc.apn ?? null,
        apnSourceTitle: loc.apnSourceTitle ?? null,
        apnSourceUrl: loc.apnSourceUrl ?? null,
        apnVerificationUrl: loc.apnVerificationUrl ?? null,
        apnConflict: loc.apnConflict ?? null,
        utilityName: loc.utilityName ?? null,
        utilityOfficialWebsite: loc.utilityOfficialWebsite ?? null,
        utilityServiceUpgradeUrl: loc.utilityServiceUpgradeUrl ?? null,
        utilityCoverageSourceTitle: loc.utilityCoverageSourceTitle ?? null,
        utilityCoverageSourceUrl: loc.utilityCoverageSourceUrl ?? null,
        jurisdictionName: loc.jurisdictionName ?? null,
        jurisdictionBuildingDepartmentName: loc.jurisdictionBuildingDepartmentName ?? null,
        jurisdictionOfficialWebsite: loc.jurisdictionOfficialWebsite ?? null,
        jurisdictionBuildingDepartmentUrl: loc.jurisdictionBuildingDepartmentUrl ?? null,
        jurisdictionPermitPortalUrl: loc.jurisdictionPermitPortalUrl ?? null,
        jurisdictionFormsUrl: loc.jurisdictionFormsUrl ?? null,
        jurisdictionInspectionsUrl: loc.jurisdictionInspectionsUrl ?? null,
        assessorCounty: loc.assessorCounty ?? null,
        assessorState: loc.assessorState ?? null,
        assessorSearchUrl: loc.assessorSearchUrl ?? null,
        assessorParcelGisUrl: loc.assessorParcelGisUrl ?? null,
        detailsStatus: loc.detailsStatus ?? "UNVERIFIED",
        createdFromLead: loc.createdFromLead,
      }));

    return (
      <div ref={containerRef} className={containerClass} aria-labelledby={headingId}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p id={headingId} className={sectionLabelClass}>
            Service address
          </p>
        </div>
        <CustomerServiceLocationsPanel
          customerId={effectiveContext.customer.customerId}
          googleMapsApiKey={apiKey}
          locations={customerRows}
        />
      </div>
    );
  }

  /* ── Unlinked lead: inline editor against Lead.publicIntakeServiceLocation ── */
  const intakeDisplay = effectiveContext.intake.defaultDisplayAddress.trim();
  const hasIntake = intakeDisplay.length > 0;

  return (
    <div ref={containerRef} className={containerClass} aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p id={headingId} className={sectionLabelClass}>
          Service address
        </p>
      </div>

      {isEditingIntake ? (
        <LeadServiceAddressInlineEditor
          leadId={leadId}
          defaultDisplayAddress={effectiveContext.intake.defaultDisplayAddress}
          initialStructuredJson={effectiveContext.intake.structuredJson}
          isInitialEntry={!hasIntake}
          onSuccess={() => {
            setIsEditingIntake(false);
            handleMutated();
          }}
          onCancel={() => setIsEditingIntake(false)}
        />
      ) : hasIntake ? (
        <div className="space-y-3">
          <ReadOnlyAddressLine value={intakeDisplay} />
          <button
            type="button"
            onClick={() => setIsEditingIntake(true)}
            className={secondaryBtnClass}
          >
            Edit service address
          </button>
        </div>
      ) : (
        <MissingAddressEmptyState onAdd={() => setIsEditingIntake(true)} />
      )}
    </div>
  );
});
