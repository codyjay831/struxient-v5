import Link from "next/link";
import { Briefcase, CircleAlert, FileText } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  LEAD_COMMERCIAL_PROGRESS_STEPS,
  resolveLeadCommercialProgressActionHref,
  type LeadCommercialProgress,
  type LeadCommercialProgressAction,
} from "@/lib/lead-commercial-progress";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";

const primaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const secondaryActionClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const cardLinkClass =
  "block rounded-lg border border-border bg-foreground/[0.02] px-3 py-3 transition-colors hover:border-border-strong hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ActionLink({
  action,
  leadId,
  variant,
}: {
  action: LeadCommercialProgressAction;
  leadId: string;
  variant: "primary" | "secondary";
}) {
  const href = resolveLeadCommercialProgressActionHref(action, { leadId });
  return (
    <Link
      href={href}
      className={variant === "primary" ? primaryActionClass : secondaryActionClass}
    >
      {action.label}
    </Link>
  );
}

function StepIndicator({
  stepIndex,
  totalSteps,
  isTerminal,
}: {
  stepIndex: number;
  totalSteps: number;
  isTerminal: boolean;
}) {
  if (isTerminal) {
    return (
      <p className="text-xs text-foreground-subtle">
        This opportunity is closed; no further commercial steps.
      </p>
    );
  }

  const steps = LEAD_COMMERCIAL_PROGRESS_STEPS.slice(0, totalSteps);

  return (
    <ol
      className="flex items-stretch gap-2"
      aria-label="Commercial progress steps"
    >
      {steps.map((step, index) => {
        const isCompleted = index < stepIndex;
        const isCurrent = index === stepIndex;
        const segmentClass = isCompleted
          ? "bg-foreground"
          : isCurrent
            ? "bg-foreground/70"
            : "bg-foreground/15";
        const labelClass = isCurrent
          ? "text-foreground"
          : isCompleted
            ? "text-foreground-muted"
            : "text-foreground-subtle";
        return (
          <li
            key={step.key}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={`h-1.5 rounded-full transition-colors ${segmentClass}`}
              aria-hidden
            />
            <span
              className={`truncate text-[0.65rem] font-medium uppercase tracking-wide ${labelClass}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveQuoteCard({
  quote,
  showsRevisionDrift,
}: {
  quote: NonNullable<LeadCommercialProgress["activeQuote"]>;
  showsRevisionDrift: boolean;
}) {
  const updated = new Date(quote.updatedAt).toLocaleString();
  return (
    <Link href={`/quotes/${quote.id}`} className={cardLinkClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <FileText
            className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Active quote
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              {quote.title}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              {quote.lineItemCount}{" "}
              {quote.lineItemCount === 1 ? "line" : "lines"} ·{" "}
              {formatMoneyCents(quote.totalCents)} · Updated {updated}
            </p>
            {showsRevisionDrift ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-foreground/[0.04] px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
                <CircleAlert className="size-3" strokeWidth={1.75} aria-hidden />
                Edits since last send
              </p>
            ) : null}
          </div>
        </div>
        <StatusBadge
          label={formatQuoteStatus(quote.status)}
          tone={quoteStatusBadgeTone(quote.status)}
        />
      </div>
    </Link>
  );
}

function ActiveJobCard({
  job,
}: {
  job: NonNullable<LeadCommercialProgress["activeJob"]>;
}) {
  return (
    <Link href={`/jobs/${job.id}`} className={cardLinkClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Briefcase
            className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Active job
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
              Job {job.id}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Materialized from the approved quote.
            </p>
          </div>
        </div>
        <StatusBadge
          label={job.status === "ARCHIVED" ? "Archived" : "Active"}
          tone={job.status === "ARCHIVED" ? "neutral" : "approved"}
        />
      </div>
    </Link>
  );
}

export function LeadCommercialProgressPanel({
  progress,
  leadId,
}: {
  progress: LeadCommercialProgress;
  leadId: string;
}) {
  const hasCards = progress.activeQuote != null || progress.activeJob != null;

  return (
    <WorkspacePanel
      padding="comfortable"
      className="mb-5 border-border-strong shadow-md ring-1 ring-ring/30"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Lead progress
        </h2>
        <StatusBadge label={progress.label} tone={progress.badgeTone} />
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
        {progress.description}
      </p>

      <div className="mt-5">
        <StepIndicator
          stepIndex={progress.stepIndex}
          totalSteps={progress.totalSteps}
          isTerminal={progress.isTerminal}
        />
      </div>

      {hasCards ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {progress.activeQuote ? (
            <ActiveQuoteCard
              quote={progress.activeQuote}
              showsRevisionDrift={progress.showsRevisionDrift}
            />
          ) : null}
          {progress.activeJob ? <ActiveJobCard job={progress.activeJob} /> : null}
        </div>
      ) : null}

      {progress.primaryAction || progress.secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="mr-1 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            Next
          </span>
          {progress.primaryAction ? (
            <ActionLink
              action={progress.primaryAction}
              leadId={leadId}
              variant="primary"
            />
          ) : null}
          {progress.secondaryAction ? (
            <ActionLink
              action={progress.secondaryAction}
              leadId={leadId}
              variant="secondary"
            />
          ) : null}
        </div>
      ) : null}
    </WorkspacePanel>
  );
}
