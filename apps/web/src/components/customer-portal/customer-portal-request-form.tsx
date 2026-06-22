"use client";

import { useActionState } from "react";
import { CustomerRequestType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  submitCustomerPortalRequestAction,
  type PortalRequestFormState,
} from "@/app/portal/portal-actions";

const REQUEST_TYPES: { value: CustomerRequestType; label: string }[] = [
  { value: "ASK_QUESTION", label: "Ask a question" },
  { value: "REQUEST_RESCHEDULE", label: "Request reschedule" },
  { value: "SUBMIT_AVAILABILITY", label: "Submit availability" },
  { value: "ADD_ACCESS_NOTE", label: "Add access note" },
  { value: "REPORT_ISSUE", label: "Report an issue" },
  { value: "BILLING_QUESTION", label: "Billing question" },
  { value: "REQUEST_SCOPE_CHANGE", label: "Scope / change question" },
];

export function CustomerPortalRequestForm({ accessId }: { accessId: string }) {
  const [state, action, pending] = useActionState<PortalRequestFormState, FormData>(
    submitCustomerPortalRequestAction.bind(null, accessId),
    {},
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-foreground">Send a request</h3>
      <p className="mt-1 text-sm text-foreground-muted">
        Structured requests go to the contractor office — not internal chat.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Request type</span>
          <select
            name="type"
            defaultValue="ASK_QUESTION"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {REQUEST_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input
            name="title"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Message</span>
          <textarea
            name="message"
            required
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-success" role="status">
            Your request was sent. The contractor will review it.
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </form>
    </section>
  );
}
