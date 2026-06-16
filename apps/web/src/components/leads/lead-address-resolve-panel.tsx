"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import {
  applyLeadServiceAddressCandidateAction,
  resolveLeadServiceAddressAction,
  type ResolveLeadServiceAddressResult,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { LeadServiceAddressBlock } from "@/components/leads/lead-service-address-block";
import type { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";

const primaryBtnClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-accent/40 hover:bg-accent/[0.02] disabled:opacity-50";

export function LeadAddressResolvePanel({
  leadId,
  leadEditHref,
  jobsiteAddressLine,
  serviceAddressContext,
  onResolved,
}: {
  leadId: string;
  leadEditHref: string;
  jobsiteAddressLine: string;
  serviceAddressContext?: LeadServiceAddressContext;
  onResolved: () => void;
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<
    "loading" | "resolved" | "suggest" | "failed" | "error"
  >("loading");
  const [candidates, setCandidates] = useState<
    Array<{ placeId: string; formattedAddress: string }>
  >([]);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyResolveResult(result: ResolveLeadServiceAddressResult) {
    if (!result.ok) {
      setPhase("error");
      setErrorMessage(result.error);
      return;
    }

    if (result.status === "already_verified" || result.status === "resolved") {
      if (result.status === "resolved") {
        setResolvedAddress(result.formattedAddress);
      }
      setPhase("resolved");
      onResolved();
      router.refresh();
      return;
    }

    if (result.status === "suggest") {
      setCandidates(result.candidates);
      setPhase("suggest");
      return;
    }

    setPhase("failed");
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void resolveLeadServiceAddressAction(leadId).then((result) => {
      applyResolveResult(result);
    });
  }, [leadId]);

  function handleSelectCandidate(placeId: string) {
    startTransition(async () => {
      const result = await applyLeadServiceAddressCandidateAction(leadId, placeId);
      if (!result.ok) {
        setPhase("error");
        setErrorMessage(result.error);
        return;
      }
      setResolvedAddress(result.formattedAddress);
      setPhase("resolved");
      onResolved();
      router.refresh();
    });
  }

  if (phase === "loading") {
    return (
      <div
        id="address-verify"
        className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-sm"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
          Checking service address…
        </div>
      </div>
    );
  }

  if (phase === "resolved") {
    if (!resolvedAddress) return null;
    return (
      <div
        id="address-verify"
        className="scroll-mt-24 rounded-xl border border-success/30 bg-success/[0.03] p-4 shadow-sm"
      >
        <div className="flex items-start gap-2 text-sm text-foreground-muted">
          <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Service address verified</p>
            <p className="mt-1">{resolvedAddress}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="address-verify"
      className="scroll-mt-24 rounded-xl border border-warning/30 bg-warning/[0.03] p-4 shadow-sm space-y-4"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Address needs review</p>
          <p className="mt-1 text-sm text-foreground-muted">
            {jobsiteAddressLine.trim()
              ? `We couldn't confidently match "${jobsiteAddressLine.trim()}". Pick the correct service address below.`
              : "Pick the correct service address before building a quote."}
          </p>
        </div>
      </div>

      {phase === "suggest" && candidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
            Suggested matches
          </p>
          <div className="grid gap-2">
            {candidates.map((candidate) => (
              <button
                key={candidate.placeId}
                type="button"
                disabled={isPending}
                onClick={() => handleSelectCandidate(candidate.placeId)}
                className={secondaryBtnClass}
              >
                <span className="flex items-start gap-2">
                  <MapPin className="size-4 shrink-0 mt-0.5 text-foreground-subtle" aria-hidden />
                  <span>{candidate.formattedAddress}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === "error" && errorMessage ? (
        <p className="text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {serviceAddressContext ? (
        <LeadServiceAddressBlock
          leadId={leadId}
          leadEditHref={leadEditHref}
          context={serviceAddressContext}
          hasLinkedCustomer={false}
          onMutated={onResolved}
        />
      ) : (
        <a href={leadEditHref} className={primaryBtnClass}>
          Edit service address
        </a>
      )}
    </div>
  );
}
