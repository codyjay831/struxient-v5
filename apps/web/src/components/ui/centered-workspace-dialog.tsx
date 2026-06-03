"use client";

import { useEffect, useRef, type ReactNode } from "react";

export const CENTERED_WORKSPACE_DIALOG_CLASS =
  "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25";

export type CenteredWorkspaceDialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabelledBy?: string;
};

export function CenteredWorkspaceDialog({
  open,
  onClose,
  children,
  ariaLabelledBy,
}: CenteredWorkspaceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel() {
      onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={CENTERED_WORKSPACE_DIALOG_CLASS}
      aria-labelledby={ariaLabelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
