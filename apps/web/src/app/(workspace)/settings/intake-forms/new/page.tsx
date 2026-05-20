"use client";

import { useActionState, useState } from "react";
import { createIntakeFormAction } from "../intake-form-actions";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { TradeTemplatePicker } from "@/components/intake/trade-template-picker";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";

type TradeStarter = (typeof TRADE_STARTERS)[number];

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";

export default function NewIntakeFormPage() {
  const [state, formAction, isPending] = useActionState(createIntakeFormAction, {});
  const [selectedTemplate, setSelectedTemplate] = useState<TradeStarter | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: "/settings/intake" },
          { label: "Public intake forms", href: "/settings/intake-forms" },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="Create Advanced Public Form"
        description="Create an additional public form/slug for advanced scenarios. Your default public form remains the primary customer path."
        actions={
          <Link
            href="/settings/intake-forms"
            className="inline-flex items-center text-xs font-bold text-foreground-subtle hover:text-foreground transition-colors"
          >
            <ChevronLeft className="mr-1 size-3" />
            Back to Forms
          </Link>
        }
      />

      <form action={formAction} className="space-y-8 max-w-3xl">
        {state.error && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="size-4 text-accent" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Choose a Starter Template</h2>
          </div>
          <TradeTemplatePicker 
            selectedSlug={selectedTemplate?.slug} 
            onSelect={(t) => setSelectedTemplate(t)} 
          />
          <input type="hidden" name="templateSlug" value={selectedTemplate?.slug || ""} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 pt-8 border-t border-border">
          <div className="col-span-full">
            <label className="block">
              <span className={fieldLabelClass}>Form Name</span>
              <input
                name="name"
                type="text"
                required
                defaultValue={selectedTemplate?.name || ""}
                placeholder="e.g. Roofing Estimate Form"
                className={controlClass}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className={fieldLabelClass}>URL Slug</span>
              <div className="flex items-center mt-1">
                <span className="text-xs text-foreground-subtle mr-1">/request/your-company-slug/</span>
                <input
                  name="slug"
                  type="text"
                  required
                  defaultValue={selectedTemplate?.slug || ""}
                  placeholder="roofing-estimate"
                  className={controlClass}
                />
              </div>
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className="block">
              <span className={fieldLabelClass}>Channel</span>
              <input
                type="text"
                disabled
                value="Public web form (fixed)"
                className={`${controlClass} opacity-70`}
              />
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-border flex justify-end">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create & Continue
          </button>
        </div>
      </form>
    </div>
  );
}
