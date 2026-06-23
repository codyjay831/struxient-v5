"use client";

import { useActionState } from "react";
import { createIntakeFormAction } from "../../intake-form-actions";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageBackLink } from "@/components/ui/page-back-link";
import { INTAKE_SPECIALIZED_PATH } from "@/lib/intake-settings-hierarchy";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export default function NewSpecializedIntakeFormPage() {
  const [state, formAction, isPending] = useActionState(createIntakeFormAction, {});

  return (
    <>
      <PageHeader
        title="Create request link"
        description="Additional public link for a campaign, trade page, or service line."
        actions={
          <PageBackLink href={INTAKE_SPECIALIZED_PATH}>← Customer request links</PageBackLink>
        }
      />

      <form action={formAction} className="space-y-8">
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          {state.error ? (
            <p
              className="mb-6 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="col-span-full">
              <label className="block">
                <span className={fieldLabelClass}>Link name</span>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Roofing estimate"
                  className={controlClass}
                />
              </label>
            </div>

            <div className="col-span-full">
              <label className="block">
                <span className={fieldLabelClass}>Link slug</span>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-xs text-foreground-subtle">/request/your-company-slug/</span>
                  <input
                    name="slug"
                    type="text"
                    required
                    placeholder="roofing-estimate"
                    className={`${controlClass} mt-0 flex-1`}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <button type="submit" className={primaryButtonClass} disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Create & Continue
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
