"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  returnFocusRef,
  widthClass = "w-full sm:w-[500px] md:w-[600px] lg:w-[700px]",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  widthClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const returnTarget = returnFocusRef?.current;
    
    // Prevent scrolling on body
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    // Focus the close button or panel
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      if (returnTarget) {
        returnTarget.focus();
      } else {
        previousFocus?.focus();
      }
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-label="Close drawer"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Drawer"}
        className={`relative flex h-full flex-col border-l border-border bg-surface shadow-2xl transition-transform ${widthClass}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
