"use client";

import { ChangeOrderLineOperation } from "@prisma/client";
import { MinusCircle, PencilLine, PlusCircle } from "lucide-react";
import type { ChangeOrderIntent } from "@/lib/change-order-flow";
import { createLineFromIntent } from "@/lib/change-order-flow";

const INTENT_OPTIONS: Array<{
  intent: ChangeOrderIntent;
  label: string;
  description: string;
  icon: typeof PlusCircle;
}> = [
  {
    intent: "add",
    label: "Add new work or cost",
    description: "Customer approved additional scope or pricing.",
    icon: PlusCircle,
  },
  {
    intent: "modify",
    label: "Modify existing scope",
    description: "Change quantity, description, pricing, or execution relevance.",
    icon: PencilLine,
  },
  {
    intent: "remove",
    label: "Remove existing scope",
    description: "Customer no longer wants part of the sold scope.",
    icon: MinusCircle,
  },
];

export function ChangeOrderIntentPicker({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (intent: ChangeOrderIntent) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">What changed?</p>
      <div className="grid gap-3 md:grid-cols-3">
        {INTENT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.intent}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option.intent)}
              className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-foreground/[0.02] disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-accent" />
                {option.label}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function createDraftLineFromIntent(intent: ChangeOrderIntent) {
  return createLineFromIntent(intent);
}

export { ChangeOrderLineOperation };
