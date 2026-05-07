"use client";

import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { type WorkstationWorkItem } from "@/lib/workstation-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode } from "react";

export type WorkstationWorkPanelProps = {
  item: WorkstationWorkItem | null;
  children?: ReactNode;
  onClose?: () => void;
};

export function WorkstationWorkPanel({
  item,
  children,
  onClose,
}: WorkstationWorkPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!item) return null;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("selectedId");
      params.delete("selectedKind");
      router.push(`?${params.toString()}`, { scroll: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm transition-all animate-in fade-in duration-200">
      <div 
        className="relative h-full w-full max-w-lg border-l border-border-strong bg-surface shadow-2xl animate-in slide-in-from-right duration-300 sm:ring-1 sm:ring-ring/20"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border p-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                  {item.kind}
                </span>
                {item.status && (
                  <StatusBadge label={item.status} tone="neutral" />
                )}
              </div>
              <h2 id="panel-title" className="mt-1 text-xl font-bold text-foreground">{item.title}</h2>
              {item.subtitle && (
                <p className="mt-0.5 text-sm text-foreground-muted">{item.subtitle}</p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="rounded-md p-2 text-foreground-subtle hover:bg-foreground/[0.05] hover:text-foreground transition-colors"
              aria-label="Close panel"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-8">
              {!children ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                      Why it matters
                    </h4>
                    <p className="mt-1.5 text-sm italic leading-relaxed text-foreground-muted">
                      {item.reason}
                    </p>
                    {item.workflow ? (
                      <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        {item.workflow.statusLabel}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                      Next step
                    </h4>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                      {item.nextStep}
                    </p>
                  </div>
                </div>
              ) : null}

              {children ? <div>{children}</div> : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-foreground/[0.01] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {item.href && (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                >
                  {item.kind === "quote" ? "Open quote record" : item.kind === "lead" ? "Open lead workspace" : "Open full record"}
                  <ArrowRight className="size-4" />
                </Link>
              )}
              <button
                onClick={handleClose}
                className="text-sm font-medium text-foreground-subtle hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Click outside to close */}
      <div className="absolute inset-0 -z-10" onClick={handleClose} />
    </div>
  );
}
