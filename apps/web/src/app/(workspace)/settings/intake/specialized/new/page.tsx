"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createIntakeFormAction } from "../../intake-form-actions";
import Link from "next/link";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { TradeTemplatePicker } from "@/components/intake/trade-template-picker";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import {
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_PATH,
} from "@/lib/intake-settings-hierarchy";

type TradeStarter = (typeof TRADE_STARTERS)[number];

function resolveStarterTemplate(starterSlug: string | null): TradeStarter | null {
  if (!starterSlug) return null;
  return TRADE_STARTERS.find((s) => s.slug === starterSlug) ?? null;
}

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export default function NewSpecializedIntakeFormPage() {
  const searchParams = useSearchParams();
  const initialTemplate = resolveStarterTemplate(searchParams.get("starter"));
  const [state, formAction, isPending] = useActionState(createIntakeFormAction, {});
  const [selectedTemplate, setSelectedTemplate] = useState<TradeStarter | null>(initialTemplate);
  const [nameValue, setNameValue] = useState(initialTemplate?.name ?? "");
  const [slugValue, setSlugValue] = useState(initialTemplate?.slug ?? "");

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Specialized forms", href: INTAKE_SPECIALIZED_PATH },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="Create specialized customer form"
        description="Optional public link for campaigns, trade-specific pages, referral partners, or distinct service lines. Your default customer intake remains the main path."
        actions={
          <Link
            href={INTAKE_SPECIALIZED_PATH}
            className="inline-flex items-center text-xs font-bold text-foreground-subtle transition-colors hover:text-foreground"
          >
            <ChevronLeft className="mr-1 size-3" />
            Back to specialized forms
          </Link>
        }
      />

      <form action={formAction} className="max-w-3xl space-y-8">
        {state.error && (
          <p
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {state.error}
          </p>
        )}

        <div className="space-y-4">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Choose a Starter Template
            </h2>
          </div>
          <TradeTemplatePicker
            selectedSlug={selectedTemplate?.slug}
            onSelect={(t) => {
              setSelectedTemplate(t);
              setNameValue(t.name);
              setSlugValue(t.slug);
            }}
          />
          <input type="hidden" name="templateSlug" value={selectedTemplate?.slug || ""} />
        </div>

        <div className="grid gap-6 border-t border-border pt-8 sm:grid-cols-2">
          <div className="col-span-full">
            <label className="block">
              <span className={fieldLabelClass}>Form Name</span>
              <input
                name="name"
                type="text"
                required
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                placeholder="e.g. Roofing Estimate Form"
                className={controlClass}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className={fieldLabelClass}>URL Slug</span>
              <div className="mt-1 flex items-center">
                <span className="mr-1 text-xs text-foreground-subtle">
                  /request/your-company-slug/
                </span>
                <input
                  name="slug"
                  type="text"
                  required
                  value={slugValue}
                  onChange={(event) => setSlugValue(event.target.value)}
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

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create & Continue
          </button>
        </div>
      </form>
    </div>
  );
}
