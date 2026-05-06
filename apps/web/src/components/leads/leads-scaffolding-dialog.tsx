"use client";

import { useRef } from "react";
import { X } from "lucide-react";

const triggerClass =
  "inline-flex items-center rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[0.65rem] font-medium text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function LeadsScaffoldingDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" className={triggerClass} onClick={open}>
        Scaffolding
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="leads-scaffolding-title"
        className="z-50 w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg outline-none ring-offset-background [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex max-h-[min(32rem,90vh)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <h2
              id="leads-scaffolding-title"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Scaffolding needed
            </h2>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close scaffolding notes"
            >
              <X className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">
            <p className="text-sm leading-relaxed text-foreground-muted">
              Development-only notes for unfinished lead intake wiring. These are not
              customer-facing UI.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground-muted">
              <li>
                Auth/tenant scoping is still using the development tenant until real auth/org
                context is connected.
              </li>
              <li>
                Lead channels are planned for website, email, phone, text, and manual entry.
              </li>
              <li>
                Customer matching is planned so leads can attach to existing customers or
                create new ones.
              </li>
              <li>Sales handoff actions still need real workflow wiring.</li>
              <li>
                Persistence/model wiring should stay verified, but should not be explained in the
                main UI.
              </li>
              <li>
                On each lead&apos;s detail page, warn-only possible matches appear when the lead
                has an email or phone—same organization, exact normalized match, never auto-link
                or merge. The list view stays lightweight.
              </li>
            </ul>
          </div>
          <div className="border-t border-border px-5 py-3">
            <button type="button" className={triggerClass} onClick={close}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
