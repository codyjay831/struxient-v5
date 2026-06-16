import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import type { LeadReviewViewModel } from "@/lib/lead-review-view-model";

export function LeadQuoteReadinessBar({
  requirements,
  allRequirementsMet,
  editHref,
}: {
  requirements: LeadReviewViewModel["requirements"];
  allRequirementsMet: boolean;
  editHref: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm"
      aria-label="Quote readiness"
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle shrink-0">
        Quote readiness
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {requirements.map((req) => (
          <span
            key={req.key}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs"
          >
            {req.satisfied ? (
              <CheckCircle2 className="size-3 text-success shrink-0" aria-hidden />
            ) : (
              <XCircle className="size-3 text-danger shrink-0" aria-hidden />
            )}
            <span className={req.satisfied ? "text-foreground-muted" : "font-medium text-foreground"}>
              {req.label}
            </span>
            {!req.satisfied ? (
              req.fixHref.startsWith("#") ? (
                <a href={req.fixHref} className="text-[10px] font-medium text-accent hover:underline">
                  Fix
                </a>
              ) : (
                <Link href={req.fixHref} className="text-[10px] font-medium text-accent hover:underline">
                  Fix
                </Link>
              )
            ) : null}
          </span>
        ))}
      </div>

      <span
        className={`text-xs shrink-0 ${allRequirementsMet ? "text-success font-medium" : "text-foreground-muted"}`}
      >
        {allRequirementsMet
          ? "All requirements met — you can build a quote now."
          : "Fix missing items before building a quote."}
      </span>

      <Link
        href={editHref}
        className="ml-auto text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground shrink-0"
      >
        Edit details
      </Link>
    </div>
  );
}
