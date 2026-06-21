"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createQuoteFromLeadWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";

const primaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function StartQuoteFromLeadButton({
  leadId,
  label,
  variant,
  onQuoteStarted,
  skipRouterRefresh = false,
}: {
  leadId: string;
  label: string;
  variant: "primary" | "secondary";
  onQuoteStarted?: (quoteId: string) => void;
  /** Drawer/embedded surfaces reload client-side; skip full-page refresh. */
  skipRouterRefresh?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteFromLeadWorkspaceAction(leadId);
      if (!result.success) {
        setError(result.error ?? "Could not start the quote.");
        return;
      }
      if (onQuoteStarted) {
        onQuoteStarted(result.quoteId);
        if (!skipRouterRefresh) {
          router.refresh();
        }
        return;
      }
      router.push(`/leads/${leadId}?tab=quote`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title="Start a quote draft for this request using the canonical lead handoff."
        className={variant === "primary" ? primaryActionClass : secondaryActionClass}
      >
        {isPending ? "Starting quote..." : label}
      </button>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
