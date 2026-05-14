"use client";

import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { Check } from "lucide-react";

type TradeStarter = (typeof TRADE_STARTERS)[number];

export function TradeTemplatePicker({ 
  selectedSlug, 
  onSelect 
}: { 
  selectedSlug?: string; 
  onSelect: (template: TradeStarter) => void 
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TRADE_STARTERS.map((template) => (
        <button
          key={template.slug}
          type="button"
          onClick={() => onSelect(template)}
          className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            selectedSlug === template.slug
              ? "border-accent bg-accent/5 ring-1 ring-accent"
              : "border-border bg-surface hover:border-accent/40"
          }`}
        >
          <div className="flex w-full items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-foreground">{template.name}</h3>
            {selectedSlug === template.slug && (
              <div className="rounded-full bg-accent p-1 text-accent-contrast">
                <Check className="size-3" />
              </div>
            )}
          </div>
          <p className="text-[0.65rem] text-foreground-muted uppercase font-bold tracking-wider">
            {template.schema.sections.length} Sections • {template.schema.sections.reduce((acc, s) => acc + s.fields.length, 0)} Fields
          </p>
          <div className="mt-4 flex flex-wrap gap-1">
            {template.schema.sections.slice(0, 2).map((s) => (
              <span key={s.key} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[0.6rem] font-medium text-foreground-subtle">
                {s.title}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
