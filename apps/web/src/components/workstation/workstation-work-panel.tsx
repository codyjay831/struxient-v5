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
          <div className="flex items-start justify-between border-b border-border p-8">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground-subtle">
                  {item.kind.replace("-", " ")}
                </span>
                {item.status && (
                  <StatusBadge label={item.status} tone="neutral" />
                )}
              </div>
              <h2 id="panel-title" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {item.title}
              </h2>
              {item.subtitle && (
                <p className="mt-1 text-sm font-medium text-foreground-muted">{item.subtitle}</p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="ml-4 rounded-full p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="space-y-10">
              {!children ? (
                <div className="grid gap-8 sm:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                      Reason for review
                    </h4>
                    <p className="text-base italic leading-relaxed text-foreground-muted">
                      {item.reason}
                    </p>
                    {item.workflow ? (
                      <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                        Current Status: {item.workflow.statusLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                      Recommended action
                    </h4>
                    <p className="text-lg font-bold leading-snug text-foreground">
                      {item.nextStep}
                    </p>
                  </div>
                </div>
              ) : null}

              {children ? <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">{children}</div> : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-foreground/[0.01] p-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              {item.href && (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {item.kind === "quote" ? "Open quote record" : item.kind === "lead" ? "Open lead workspace" : "Open full record"}
                  <ArrowRight className="size-4" />
                </Link>
              )}
              <button
                onClick={handleClose}
                className="text-sm font-bold text-foreground-subtle transition-colors hover:text-foreground"
              >
                Close panel
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
