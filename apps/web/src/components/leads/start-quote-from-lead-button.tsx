"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createQuoteFromLeadWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";

const primaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function StartQuoteFromLeadButton({
  leadId,
  label,
  variant,
}: {
  leadId: string;
  label: string;
  variant: "primary" | "secondary";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await createQuoteFromLeadWorkspaceAction(leadId);
      if (!result.success) {
        alert(result.error ?? "Could not start the quote.");
        return;
      }
      router.push(`/quotes/${result.quoteId}`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Start a quote draft for this opportunity using the canonical lead handoff."
      className={variant === "primary" ? primaryActionClass : secondaryActionClass}
    >
      {isPending ? "Starting quote…" : label}
    </button>
  );
}
