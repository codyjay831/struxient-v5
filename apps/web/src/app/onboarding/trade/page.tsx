"use client";

import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { seedTradeStartersAction } from "./onboarding-actions";
import { useState, useTransition } from "react";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";

export default function TradeOnboardingPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleContinue = () => {
    if (!selected) return;
    startTransition(async () => {
      await seedTradeStartersAction(selected);
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-accent/10 text-accent mb-6">
            <Sparkles className="size-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-3">Welcome to Struxient</h1>
          <p className="text-foreground-muted">
            Let&apos;s get your account set up. What is your primary trade?
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          {TRADE_STARTERS.map((trade) => (
            <button
              key={trade.slug}
              onClick={() => setSelected(trade.slug)}
              className={`flex flex-col items-start p-6 rounded-2xl border-2 transition-all text-left ${
                selected === trade.slug
                  ? "border-accent bg-accent/5 ring-1 ring-accent"
                  : "border-border bg-surface hover:border-accent/40"
              }`}
            >
              <h3 className="font-bold text-foreground mb-1">{trade.name}</h3>
              <p className="text-xs text-foreground-muted">
                Includes {trade.schema.sections.length} sections and recommended fields.
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-4 text-sm font-bold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="size-5 animate-spin" /> : (
            <>
              Finish Setup
              <ArrowRight className="size-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
