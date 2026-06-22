"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import {
  confirmCustomerAppointmentAction,
  submitScheduleCustomerRequestAction,
} from "@/app/portal/portal-actions";

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CustomerPortalScheduleCard({
  accessId,
  schedule,
}: {
  accessId: string;
  schedule: CustomerProjectPortalDocument["schedule"];
}) {
  if (schedule.events.length === 0) {
    return <p className="text-sm text-foreground-muted">No appointment has been scheduled yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {schedule.events.map((event) => (
        <ScheduleEventRow key={event.id} accessId={accessId} event={event} />
      ))}
    </ul>
  );
}

function ScheduleEventRow({
  accessId,
  event,
}: {
  accessId: string;
  event: CustomerProjectPortalDocument["schedule"]["events"][number];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showAccessNote, setShowAccessNote] = useState(false);

  function submit(type: "REQUEST_RESCHEDULE" | "SUBMIT_AVAILABILITY" | "ADD_ACCESS_NOTE") {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("type", type);
      formData.set("scheduleEventId", event.id);
      formData.set("message", message);
      const result = await submitScheduleCustomerRequestAction(accessId, formData);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setFeedback("Your request was sent.");
      setMessage("");
      setShowReschedule(false);
      setShowAvailability(false);
      setShowAccessNote(false);
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await confirmCustomerAppointmentAction(accessId, event.id);
      setFeedback(result.error ?? "Appointment confirmed. Thank you!");
    });
  }

  return (
    <li className="rounded-lg border border-border px-3 py-3 text-sm">
      <p className="font-medium text-foreground">{event.title}</p>
      <p className="mt-1 text-foreground-muted">{formatDateTime(event.startAt)}</p>
      {event.windowLabel ? (
        <p className="mt-1 text-foreground-muted">{event.windowLabel}</p>
      ) : null}
      {event.customerConfirmed ? (
        <p className="mt-2 text-xs font-medium text-success">You confirmed this appointment</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {event.canConfirm ? (
          <Button type="button" variant="primary" disabled={pending} onClick={confirm}>
            Confirm appointment
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setShowReschedule((v) => !v)}
        >
          Request reschedule
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setShowAvailability((v) => !v)}
        >
          Submit availability
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setShowAccessNote((v) => !v)}
        >
          Access note
        </Button>
      </div>
      {showReschedule ? (
        <ScheduleMessageForm
          label="Tell us when works better"
          message={message}
          onMessageChange={setMessage}
          onSubmit={() => submit("REQUEST_RESCHEDULE")}
          pending={pending}
        />
      ) : null}
      {showAvailability ? (
        <ScheduleMessageForm
          label="Share your available days/times"
          message={message}
          onMessageChange={setMessage}
          onSubmit={() => submit("SUBMIT_AVAILABILITY")}
          pending={pending}
        />
      ) : null}
      {showAccessNote ? (
        <ScheduleMessageForm
          label="Gate code, pets, parking, etc."
          message={message}
          onMessageChange={setMessage}
          onSubmit={() => submit("ADD_ACCESS_NOTE")}
          pending={pending}
        />
      ) : null}
      {feedback ? (
        <p className="mt-2 text-xs text-foreground-muted" role="status">
          {feedback}
        </p>
      ) : null}
    </li>
  );
}

function ScheduleMessageForm({
  label,
  message,
  onMessageChange,
  onSubmit,
  pending,
}: {
  label: string;
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium text-foreground-muted">{label}</label>
      <textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <Button type="button" variant="primary" disabled={pending || message.trim().length < 5} onClick={onSubmit}>
        Send
      </Button>
    </div>
  );
}
