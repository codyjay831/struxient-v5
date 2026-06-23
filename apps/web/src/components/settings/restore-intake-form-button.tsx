"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreIntakeFormAction } from "@/app/(workspace)/settings/intake/intake-form-actions";

const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function RestoreIntakeFormButton({ formId }: { formId: string; formName?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreIntakeFormAction(formId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button type="button" className={buttonClass} disabled={isPending} onClick={handleRestore}>
        {isPending ? "Restoring…" : "Restore"}
      </button>
      {error ? (
        <p className="text-[0.65rem] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
