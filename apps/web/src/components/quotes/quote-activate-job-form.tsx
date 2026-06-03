"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activateQuoteJobAction,
  type QuoteJobActivationFormState,
} from "@/app/(workspace)/quotes/quote-job-activation-actions";
import {
  applyQuoteCrossLineWiringSuggestionAction,
  reviewQuoteCrossLineWiringAction,
} from "@/app/(workspace)/quotes/quote-execution-secretary-actions";
import type { CrossLineWiringSuggestion } from "@/lib/ai/signal-suggester";
import { Sparkles, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const initialState: QuoteJobActivationFormState = {};

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function suggestionCountLabel(count: number): string {
  if (count === 1) {
    return "1 potential dependency";
  }
  return `${count} potential dependencies`;
}

/**
 * Activates an APPROVED quote into an active job (one job per quote).
 * Server validates org scope, status, and execution readiness inside the transaction.
 */
export function QuoteActivateJobForm({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAIReview, setShowAIReview] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CrossLineWiringSuggestion[]>([]);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    activateQuoteJobAction.bind(null, quoteId),
    initialState,
  );

  const startAIReview = async () => {
    setIsReviewing(true);
    setReviewError(null);
    try {
      const result = await reviewQuoteCrossLineWiringAction(quoteId);
      if (!result.ok) {
        setReviewError(result.error);
        toast.error(result.error);
        return;
      }
      setSuggestions(result.suggestions);
      setShowAIReview(true);
    } catch {
      const message = "Could not run AI Secretary review. Try again.";
      setReviewError(message);
      toast.error(message);
    } finally {
      setIsReviewing(false);
    }
  };

  const applySuggestion = async (suggestion: CrossLineWiringSuggestion) => {
    setApplyingKey(suggestion.suggestionKey);
    try {
      const result = await applyQuoteCrossLineWiringSuggestionAction(
        quoteId,
        suggestion.suggestionKey,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSuggestions((prev) =>
        prev.filter((s) => s.suggestionKey !== suggestion.suggestionKey),
      );
      toast.success("Dependency wired on the quote work plan.");
      router.refresh();
    } catch {
      toast.error("Could not apply suggestion. Try again.");
    } finally {
      setApplyingKey(null);
    }
  };

  if (showAIReview) {
    const count = suggestions.length;
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-accent" />
          <h3 className="text-lg font-semibold text-foreground">AI Secretary Review</h3>
        </div>

        {reviewError ? (
          <div className="mb-4">
            <FormError message={reviewError} />
          </div>
        ) : null}

        <p className="mb-6 text-sm leading-relaxed text-foreground-muted">
          {count > 0 ? (
            <>
              I&apos;ve analyzed your execution plan. I found{" "}
              <strong>{suggestionCountLabel(count)}</strong> that{" "}
              {count === 1 ? "isn't" : "aren't"} wired yet. Apply any suggestions before
              activating, or continue when you are ready.
            </>
          ) : (
            <>
              I&apos;ve analyzed your execution plan. No cross-line dependency gaps need
              wiring right now. You can continue to job creation.
            </>
          )}
        </p>

        {count > 0 ? (
          <div className="mb-8 space-y-3">
            {suggestions.map((s) => (
              <div
                key={s.suggestionKey}
                className="flex items-start gap-3 rounded-lg border border-accent/20 bg-surface p-3"
              >
                <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Zap className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground">Suggested dependency</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Make{" "}
                    <span className="font-semibold text-foreground">
                      &ldquo;{s.consumerTaskTitle}&rdquo;
                    </span>{" "}
                    wait for the
                    <span className="mx-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[10px] font-bold text-accent">
                      {s.signal}
                    </span>
                    prerequisite from{" "}
                    <span className="font-semibold text-foreground">
                      &ldquo;{s.providerTaskTitle}&rdquo;
                    </span>{" "}
                    on the {s.providerLineDescription} line.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applySuggestion(s)}
                  disabled={applyingKey === s.suggestionKey}
                  className="rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-contrast disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {applyingKey === s.suggestionKey ? (
                    <Loader2 className="size-3 animate-spin" aria-label="Applying" />
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAIReview(false);
              setShowConfirm(true);
            }}
            className={primaryButtonClass}
          >
            Continue to job creation
          </button>
          <button
            type="button"
            onClick={() => setShowAIReview(false)}
            className="text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <h3 className="text-lg font-semibold text-foreground">Create job from this approved quote?</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This will create an active job using the approved quote and reviewed work plan.
          Planned tasks, payment requirements, and readiness checks will be copied into the job so your team can begin managing the work.
          After activation, future changes should be handled from the job through tasks, issues, activity, and approved changes.
        </p>
        <form action={formAction} className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? "Creating…" : "Create Job"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="text-sm font-medium text-foreground-subtle transition-colors hover:text-foreground"
            disabled={isPending}
          >
            Cancel
          </button>
        </form>
        {state.error ? (
          <div className="mt-4">
            <FormError message={state.error} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowConfirm(true)} className={primaryButtonClass}>
          Create job
        </button>
        <button
          type="button"
          onClick={startAIReview}
          disabled={isReviewing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-surface px-4 py-2 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
        >
          {isReviewing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Review with AI Secretary
        </button>
      </div>
      <p className="text-[0.7rem] leading-relaxed text-foreground-subtle">
        Create one active job from this approved quote using the reviewed work plan and readiness checks.
        Later quote changes do not automatically update tasks already on the job.
      </p>
    </div>
  );
}
