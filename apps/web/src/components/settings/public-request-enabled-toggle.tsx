"use client";

import { useState, useTransition } from "react";
import { updatePublicRequestEnabledAction } from "@/app/(workspace)/settings/intake/public/public-request-settings-actions";

export function PublicRequestEnabledToggle({
  initialEnabled,
  compact = false,
}: {
  initialEnabled: boolean;
  /** Smaller label for PageHeader toolbar placement. */
  compact?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePublicRequestEnabledAction(next);
      if (!result.success) {
        setEnabled(previous);
        setError(result.error ?? "Could not update request status.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label
        className={[
          "inline-flex cursor-pointer items-center gap-2.5",
          pending ? "opacity-70" : "",
        ].join(" ")}
      >
        <span className={compact ? "text-xs font-medium text-foreground-muted" : "text-sm text-foreground-muted"}>
          {enabled ? "Accepting requests" : "Paused"}
        </span>
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(event) => onChange(event.target.checked)}
            aria-label={enabled ? "Pause customer requests" : "Accept customer requests"}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-accent peer-disabled:opacity-50" />
          <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-5 peer-disabled:opacity-60" />
        </span>
      </label>
      {error ? (
        <p className="max-w-[14rem] text-right text-[0.65rem] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
