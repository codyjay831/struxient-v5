"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { handoffMutedLinkClass } from "@/components/ui/handoff-panel";

const LeadChannelsCtx = createContext<{ open: () => void } | null>(null);

function useLeadChannelsOpen() {
  const ctx = useContext(LeadChannelsCtx);
  if (!ctx) {
    throw new Error("Lead Sources controls require LeadChannelsProvider.");
  }
  return ctx.open;
}

const secondaryToolbarButtonClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const dialogFooterButtonClass =
  "inline-flex items-center rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[0.65rem] font-medium text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function LeadChannelsProvider({
  children,
  sourcesPanel,
}: {
  children: ReactNode;
  /** Server-rendered panels (public link, channels, etc.). */
  sourcesPanel: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = useCallback(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  return (
    <LeadChannelsCtx.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="lead-channels-title"
        className="z-50 w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg outline-none ring-offset-background [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex max-h-[min(42rem,90vh)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2
                id="lead-channels-title"
                className="text-sm font-semibold tracking-tight text-foreground"
              >
                Lead Sources
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                Lead sources — set up how leads come into Struxient.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-md p-1 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close Lead Sources"
            >
              <X className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            {sourcesPanel}
          </div>
          <div className="border-t border-border px-5 py-3">
            <button type="button" className={dialogFooterButtonClass} onClick={close}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </LeadChannelsCtx.Provider>
  );
}

export function LeadChannelsToolbarButton() {
  const open = useLeadChannelsOpen();
  return (
    <button type="button" className={secondaryToolbarButtonClass} onClick={open}>
      Intake Sources
    </button>
  );
}

export function LeadChannelsManageButton({
  label = "Manage sources",
  className,
}: {
  label?: string;
  /** Merged after base classes (e.g. shrink-0). */
  className?: string;
}) {
  const open = useLeadChannelsOpen();
  return (
    <button
      type="button"
      onClick={open}
      className={[handoffMutedLinkClass, className].filter(Boolean).join(" ")}
    >
      {label}
    </button>
  );
}
