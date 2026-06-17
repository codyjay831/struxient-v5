"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

export function MobileNavDrawer({
  open,
  onOpenChange,
  title = "Navigation",
  children,
  footer,
  returnFocusRef,
  hideFrom = "lg",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
  /** Tailwind breakpoint at which the drawer is hidden in favor of desktop nav. */
  hideFrom?: "md" | "lg";
}) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const returnTarget = returnFocusRef?.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = "";
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
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  const hideClass = hideFrom === "md" ? "md:hidden" : "lg:hidden";

  return (
    <div className={`fixed inset-0 z-50 ${hideClass}`}>
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={close}
        aria-label="Close menu"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 left-0 flex w-[min(100%,280px)] flex-col border-r border-border bg-sidebar shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="rounded-md p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-border px-4 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
