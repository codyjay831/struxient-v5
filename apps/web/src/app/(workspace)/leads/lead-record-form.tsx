"use client";

import { LeadSource } from "@prisma/client";
import Link from "next/link";
import { useActionState } from "react";
import { LEAD_SOURCE_FORM_OPTIONS } from "@/lib/lead-display";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";
import { createLeadAction, type LeadFormState } from "./lead-form-actions";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type LeadRecordFormProps =
  | {
      mode: "create";
      cancelHref: string;
    }
  | {
      mode: "edit";
      cancelHref: string;
      /** Server-bound `updateLeadAction.bind(null, lead.id)` — record id is not taken from editable form fields. */
      updateFormAction: (
        prevState: LeadFormState,
        formData: FormData,
      ) => Promise<LeadFormState>;
      initial: {
        title: string;
        contactName: string | null;
        email: string | null;
        phone: string | null;
        source: LeadSource;
        sourceDetail: string | null;
        notes: string | null;
      };
    };

const initialActionState: LeadFormState = {};

export function LeadRecordForm(props: LeadRecordFormProps) {
  const action =
    props.mode === "create" ? createLeadAction : props.updateFormAction;
  const [state, formAction, isPending] = useActionState(action, initialActionState);

  const defaults =
    props.mode === "edit"
      ? props.initial
      : {
          title: "",
          contactName: null as string | null,
          email: null as string | null,
          phone: null as string | null,
          source: LeadSource.MANUAL,
          sourceDetail: null as string | null,
          notes: null as string | null,
        };

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Title</span>
          <input
            name="title"
            type="text"
            required
            maxLength={LEAD_FIELD_LIMITS.title}
            autoComplete="off"
            defaultValue={defaults.title}
            className={controlClass}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Contact name</span>
          <input
            name="contactName"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.contactName}
            autoComplete="name"
            defaultValue={defaults.contactName ?? ""}
            className={controlClass}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Email</span>
            <input
              name="email"
              type="email"
              maxLength={LEAD_FIELD_LIMITS.email}
              autoComplete="email"
              defaultValue={defaults.email ?? ""}
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Phone</span>
            <input
              name="phone"
              type="tel"
              maxLength={LEAD_FIELD_LIMITS.phone}
              autoComplete="tel"
              defaultValue={defaults.phone ?? ""}
              className={controlClass}
            />
          </label>
        </div>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Source</span>
          <select name="source" defaultValue={defaults.source} className={controlClass}>
            {LEAD_SOURCE_FORM_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Source detail</span>
          <input
            name="sourceDetail"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.sourceDetail}
            autoComplete="off"
            placeholder="Optional — e.g. referrer or campaign"
            defaultValue={defaults.sourceDetail ?? ""}
            className={controlClass}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Notes</span>
          <textarea
            name="notes"
            rows={4}
            maxLength={LEAD_FIELD_LIMITS.notes}
            defaultValue={defaults.notes ?? ""}
            className={`${controlClass} resize-y min-h-[6rem]`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending
            ? "Saving…"
            : props.mode === "create"
              ? "Create lead"
              : "Save changes"}
        </button>
        <Link href={props.cancelHref} className={mutedLinkClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
