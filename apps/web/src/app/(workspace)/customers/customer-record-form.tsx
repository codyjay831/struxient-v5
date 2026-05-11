"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ServiceAddressCaptureField } from "@/components/forms/service-address-capture-field";
import { CUSTOMER_FIELD_LIMITS } from "./customer-field-limits";
import { createCustomerAction, type CustomerFormState } from "./customer-form-actions";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type CustomerRecordFormProps =
  | {
      mode: "create";
      cancelHref: string;
      googleMapsApiKey: string;
    }
  | {
      mode: "edit";
      cancelHref: string;
      /** Server-bound `updateCustomerAction.bind(null, customer.id)` — record id is not taken from editable form fields. */
      updateFormAction: (
        prevState: CustomerFormState,
        formData: FormData,
      ) => Promise<CustomerFormState>;
      initial: {
        displayName: string;
        companyName: string | null;
        email: string | null;
        phone: string | null;
        notes: string | null;
      };
    };

const initialActionState: CustomerFormState = {};

export function CustomerRecordForm(props: CustomerRecordFormProps) {
  const action =
    props.mode === "create" ? createCustomerAction : props.updateFormAction;
  const [state, formAction, isPending] = useActionState(action, initialActionState);

  const defaults =
    props.mode === "edit"
      ? props.initial
      : {
          displayName: "",
          companyName: null as string | null,
          email: null as string | null,
          phone: null as string | null,
          notes: null as string | null,
        };

  const displayNameLabel =
    props.mode === "edit" && props.initial.companyName?.trim()
      ? "Primary contact"
      : "Customer name";

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
          <span className={fieldLabelClass}>{displayNameLabel}</span>
          <input
            name="displayName"
            type="text"
            required
            maxLength={CUSTOMER_FIELD_LIMITS.displayName}
            autoComplete="organization"
            defaultValue={defaults.displayName}
            className={controlClass}
          />
        </label>
      </div>

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Company (optional)</span>
          <input
            name="companyName"
            type="text"
            maxLength={CUSTOMER_FIELD_LIMITS.companyName}
            autoComplete="organization"
            defaultValue={defaults.companyName ?? ""}
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
              maxLength={CUSTOMER_FIELD_LIMITS.email}
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
              maxLength={CUSTOMER_FIELD_LIMITS.phone}
              autoComplete="tel"
              defaultValue={defaults.phone ?? ""}
              className={controlClass}
            />
          </label>
        </div>
      </div>

      {props.mode === "create" ? (
        <ServiceAddressCaptureField
          googleMapsApiKey={props.googleMapsApiKey}
          fieldLabelClass={fieldLabelClass}
          controlClass={controlClass}
          required={false}
        />
      ) : null}

      <div>
        <label className="block">
          <span className={fieldLabelClass}>Notes</span>
          <textarea
            name="notes"
            rows={4}
            maxLength={CUSTOMER_FIELD_LIMITS.notes}
            defaultValue={defaults.notes ?? ""}
            className={`${controlClass} resize-y min-h-[6rem]`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? "Saving…" : props.mode === "create" ? "Create customer" : "Save changes"}
        </button>
        <Link href={props.cancelHref} className={mutedLinkClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
