import { ArrowRight } from "lucide-react";

const steps = [
  {
    title: "Customer or staff submits",
    detail: "Public request page or /leads/new",
  },
  {
    title: "Structured lead created",
    detail: "Contact, jobsite, scope, timing, files",
  },
  {
    title: "Lead Review",
    detail: "Staff triage, missing info, next action",
  },
  {
    title: "Customer & service location",
    detail: "Linked when quote starts",
  },
  {
    title: "Quote & execution",
    detail: "Commercial handoff into delivery",
  },
] as const;

export function IntakeFlowMap() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        How intake works
      </p>
      <p className="mt-1 text-sm text-foreground-muted">
        Every intake path creates the same structured lead truth. Settings control what people
        answer — not where the data goes.
      </p>
      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        {steps.map((step, index) => (
          <li key={step.title} className="flex min-w-0 flex-1 items-start gap-2 sm:min-w-[9rem]">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[0.65rem] font-bold text-accent">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{step.detail}</p>
            </div>
            {index < steps.length - 1 ? (
              <ArrowRight
                aria-hidden
                className="mt-1 hidden size-4 shrink-0 text-foreground-subtle sm:ml-auto sm:block lg:hidden xl:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
