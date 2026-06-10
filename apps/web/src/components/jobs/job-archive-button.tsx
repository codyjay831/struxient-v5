"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveJobAction } from "@/app/(workspace)/jobs/job-lifecycle-actions";
import { Loader2 } from "lucide-react";

export function JobArchiveButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleArchive = () => {
    setError(null);
    startTransition(async () => {
      const result = await archiveJobAction(jobId, reason.trim() || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowConfirm(false);
      router.refresh();
    });
  };

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        Archive job
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-2 rounded-lg border border-border bg-surface p-3 text-left">
      <p className="text-xs font-semibold text-foreground">Archive this job?</p>
      <p className="text-xs text-foreground-muted">
        The job archives immediately. Future schedule events stay in place until you complete the
        cleanup review.
      </p>
      <input
        type="text"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        placeholder="Optional reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={isPending}
      />
      {error ? <p className="text-xs text-danger-strong">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="rounded-md border border-border px-2 py-1 text-xs text-foreground-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleArchive}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-xs font-semibold text-background disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          Confirm archive
        </button>
      </div>
    </div>
  );
}
