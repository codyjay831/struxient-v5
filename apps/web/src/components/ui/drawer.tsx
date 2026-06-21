"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Drawer({
  open,
  onClose,
  title,
  ariaLabel,
  children,
  returnFocusRef,
  placement = "end",
  widthClass = "w-full sm:w-[500px] md:w-[600px] lg:w-[700px]",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  placement?: "end" | "center";
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
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    } else {
      panelRef.current?.focus();
    }

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
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "textarea:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(","),
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isCentered = placement === "center";
  const shellClass = isCentered
    ? "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    : "fixed inset-0 z-50 flex justify-end";
  const panelClass = isCentered
    ? `relative flex max-h-[90vh] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl focus:outline-none ${widthClass}`
    : `relative flex h-full flex-col border-l border-border bg-surface shadow-2xl transition-transform ${widthClass} focus:outline-none`;

  return (
    <div className={shellClass}>
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
        aria-label={ariaLabel ?? title ?? "Details"}
        tabIndex={-1}
        className={panelClass}
      >
        {title ? (
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
        ) : null}
        <div
          className={
            isCentered
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
