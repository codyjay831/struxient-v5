"use client";

import { useActionState, useState } from "react";
import {
  activateQuoteJobAction,
  type QuoteJobActivationFormState,
} from "@/app/(workspace)/quotes/quote-job-activation-actions";
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

/**
 * Activates an APPROVED quote into a runtime job (one job per quote).
 * Server validates org scope, status, and execution readiness inside the transaction.
 */
export function QuoteActivateJobForm({ quoteId }: { quoteId: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAIReview, setShowAIReview] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [suggestions, setSuggestions] = useState<{ taskId: string, taskTitle: string, signal: string }[]>([]);

  const [state, formAction, isPending] = useActionState(
    activateQuoteJobAction.bind(null, quoteId),
    initialState,
  );

  const startAIReview = async () => {
    setIsReviewing(true);
    // Simulate AI analysis delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // In a real app, this would call a server action that uses suggestCrossLineWiring
    // For this demo, we'll just simulate finding one suggestion
    setSuggestions([
      { taskId: "fake-id", taskTitle: "Install Skylights", signal: "roof-prepped" }
    ]);
    
    setIsReviewing(false);
    setShowAIReview(true);
  };

  if (showAIReview) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="size-5 text-accent" />
          <h3 className="text-lg font-semibold text-foreground">AI Secretary Review</h3>
        </div>
        
        <p className="text-sm leading-relaxed text-foreground-muted mb-6">
          I&apos;ve analyzed your execution plan. I found <strong>1 potential dependency</strong> that isn&apos;t wired yet. 
          Would you like to apply this suggestion before activating?
        </p>

        <div className="space-y-3 mb-8">
          {suggestions.map((s, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-lg border border-accent/20 bg-surface p-3">
              <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Zap className="size-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground">Suggested Handshake</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Make <span className="font-semibold text-foreground">“{s.taskTitle}”</span> wait for the 
                  <span className="mx-1 rounded bg-accent/10 px-1 py-0.5 font-mono text-[10px] font-bold text-accent">{s.signal}</span> 
                  signal from the Roofing line.
                </p>
              </div>
              <button 
                type="button"
                onClick={() => {
                  toast.success("Suggestion applied to activation draft.");
                  setSuggestions(prev => prev.filter((_, i) => i !== idx));
                }}
                className="rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-contrast"
              >
                Apply
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            type="button"
            onClick={() => {
              setShowAIReview(false);
              setShowConfirm(true);
            }}
            className={primaryButtonClass}
          >
            Continue to Activation
          </button>
          <button
            type="button"
            onClick={() => setShowAIReview(false)}
            className="text-sm font-medium text-foreground-subtle hover:text-foreground transition-colors"
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
        <h3 className="text-lg font-semibold text-foreground">Activate this job?</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This will create a runtime job and copy all execution tasks and signals from the current quote draft. 
          <strong> Soft orphans</strong> will be automatically satisfied in the job Signal Bus. 
          This action cannot be undone.
        </p>
        <form action={formAction} className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? "Activating…" : "Yes, activate job"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="text-sm font-medium text-foreground-subtle hover:text-foreground transition-colors"
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
          Activate job
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
        Creates one job from this approved quote. All tasks and signals will be copied into the job Signal Bus. 
        Later quote edits do not change tasks already on the job.
      </p>
    </div>
  );
}
