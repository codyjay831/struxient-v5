"use client";

import { useRef } from "react";
import { X } from "lucide-react";

const triggerClass =
  "inline-flex items-center rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[0.65rem] font-medium text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function LeadScaffoldingDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" className={triggerClass} onClick={open}>
        Sales notes
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="lead-scaffolding-title"
        className="z-50 w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg outline-none ring-offset-background [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex max-h-[min(32rem,90vh)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <h2
              id="lead-scaffolding-title"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              Sales development notes
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
              Internal notes for development while the Sales area is being
              finalized.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground-muted">
              <li>
                Auth/tenant scoping still uses the development tenant until real auth/org
                context is connected.
              </li>
              <li>
                Public Request Link (`/request/[companySlug]`) creates opportunities with source{" "}
                <span className="font-mono text-[0.7rem]">PUBLIC_REQUEST_LINK</span>. Other
                channels (email, phone, SMS, imports) are still planned.
              </li>
              <li>
                Channel integrations are not connected; the Sales Sources modal&apos;s
                &quot;CSV import (soon)&quot; and future integrations intentionally do nothing in this
                build.
              </li>
              <li>
                Notes &amp; activity timelines are not wired yet—event logging will surface
                here when real history exists.
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
