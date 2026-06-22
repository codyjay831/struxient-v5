"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveIntakeFormAction } from "@/app/(workspace)/settings/intake/intake-form-actions";

const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-danger/40 hover:bg-danger/[0.05] hover:text-danger disabled:cursor-not-allowed disabled:opacity-50";

export function ArchiveIntakeFormButton({ formId, formName }: { formId: string; formName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    const confirmed = window.confirm(
      `Archive "${formName}"? Its public link will stop working. You can create a new form with the same slug later if needed.`,
    );
    if (!confirmed) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await archiveIntakeFormAction(formId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button type="button" className={buttonClass} disabled={isPending} onClick={handleArchive}>
        {isPending ? "Archiving…" : "Archive"}
      </button>
      {error ? (
        <p className="text-[0.65rem] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
