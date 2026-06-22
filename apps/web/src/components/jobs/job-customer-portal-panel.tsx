"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  CustomerPortalAccessLevel,
  CustomerPortalAccessStatus,
  CustomerRequestStatus,
  CustomerRequestType,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  inviteCustomerPortalAccessAction,
  revokeCustomerPortalAccessAction,
  resolveCustomerRequestAction,
  requestCustomerUploadAction,
  revokeCustomerVisibleResourceAction,
  shareAttachmentWithCustomerAction,
  sendPortalInvitationEmailAction,
  sendPortalQuoteLinkAction,
  sendPortalChangeOrderLinkAction,
  sendPortalPaymentRequestAction,
  createCustomerRequestFollowUpTaskAction,
  type JobPortalActionResult,
} from "@/app/(workspace)/jobs/job-portal-actions";
import { QuoteStatus } from "@prisma/client";

const ACCESS_LEVEL_OPTIONS: { value: CustomerPortalAccessLevel; label: string }[] = [
  { value: "VIEW_ONLY", label: "View only" },
  { value: "PROJECT_PARTICIPANT", label: "Project participant" },
  { value: "BILLING_CONTACT", label: "Billing contact" },
  { value: "DECISION_MAKER", label: "Decision maker" },
  { value: "PROPERTY_MANAGER", label: "Property manager" },
];

function statusLabel(status: CustomerPortalAccessStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PENDING_VERIFICATION":
      return "Pending verification";
    case "REVOKED":
      return "Revoked";
    case "EXPIRED":
      return "Expired";
    case "DISABLED":
      return "Disabled";
    default:
      return status;
  }
}

export type JobPortalPanelProps = {
  jobId: string;
  canManage: boolean;
  emailConfigured: boolean;
  customer: {
    displayName: string;
    email: string | null;
    phone: string | null;
  } | null;
  quote: { id: string; status: QuoteStatus } | null;
  changeOrders: Array<{ id: string; number: number; title: string; status: string }>;
  duePaymentRequirements: Array<{
    id: string;
    title: string;
    amountCents: number | null;
    paymentUrl: string | null;
    paymentUrlLabel: string | null;
  }>;
  taskOptions: Array<{ id: string; title: string; stageTitle: string; status: string }>;
  scheduleEventOptions: Array<{ id: string; title: string | null; startAt: Date; status: string }>;
  jobStages: Array<{ id: string; title: string }>;
  attachments: Array<{ id: string; fileName: string; createdAt: Date }>;
  auditEvents: Array<{
    id: string;
    label: string;
    eventType: string;
    createdAt: Date;
    contactName: string | null;
    metadataJson: unknown;
  }>;
  accesses: Array<{
    id: string;
    status: CustomerPortalAccessStatus;
    accessLevel: CustomerPortalAccessLevel;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    contactName: string | null;
    contactEmail: string | null;
    lastOpenedAt: Date | null;
  }>;
  openRequests: Array<{
    id: string;
    type: CustomerRequestType;
    title: string;
    message: string;
    status: CustomerRequestStatus;
    createdAt: Date;
  }>;
  visibleResources: Array<{
    id: string;
    title: string | null;
    resourceType: CustomerVisibleResourceType;
    visibility: CustomerVisibleResourceVisibility;
    createdAt: Date;
  }>;
};

export function JobCustomerPortalPanel(props: JobPortalPanelProps) {
  const [inviteState, inviteAction, invitePending] = useActionState<
    JobPortalActionResult,
    FormData
  >(
    (_prev, formData) => inviteCustomerPortalAccessAction(props.jobId, formData),
    { ok: false },
  );

  const [uploadState, uploadAction, uploadPending] = useActionState<
    JobPortalActionResult,
    FormData
  >(
    (_prev, formData) => requestCustomerUploadAction(props.jobId, formData),
    { ok: false },
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Customer Project Portal</h3>
        <p className="mt-1 text-sm text-foreground-muted">
          Invite homeowners or property contacts to a scoped project hub. This is not staff login.
        </p>
      </div>

      {!props.customer ? (
        <p className="text-sm text-foreground-muted">Link a customer to this job before enabling portal access.</p>
      ) : null}

      {props.canManage && props.customer ? (
        <form action={inviteAction} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Invite contact</p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input
              name="contactName"
              required
              defaultValue={props.customer.displayName}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={props.customer.email ?? ""}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Phone</span>
            <input
              name="contactPhone"
              defaultValue={props.customer.phone ?? ""}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Access level</span>
            <select
              name="accessLevel"
              defaultValue="PROJECT_PARTICIPANT"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {props.emailConfigured ? (
            <label className="flex items-center gap-2 text-sm text-foreground-muted">
              <input type="checkbox" name="sendEmail" defaultChecked className="rounded border-border" />
              Send invitation email
            </label>
          ) : (
            <input type="hidden" name="sendEmail" value="off" />
          )}
          {inviteState.error ? (
            <p className="text-sm text-danger" role="alert">
              {inviteState.error}
            </p>
          ) : null}
          {inviteState.ok && inviteState.portalUrl ? (
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-3 py-2 text-sm">
              <p className="font-medium text-foreground">Portal link created</p>
              <p className="mt-1 break-all text-foreground-muted">{inviteState.portalUrl}</p>
            </div>
          ) : null}
          <Button type="submit" variant="primary" disabled={invitePending}>
            {invitePending ? "Creating link…" : "Create portal link"}
          </Button>
        </form>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Access list</p>
        {props.accesses.length === 0 ? (
          <p className="text-sm text-foreground-muted">No portal access has been granted yet.</p>
        ) : (
          <ul className="space-y-2">
            {props.accesses.map((access) => (
              <li
                key={access.id}
                className="rounded-lg border border-border bg-surface px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">
                      {access.contactName ?? "Customer contact"}
                    </p>
                    <p className="text-foreground-muted">{access.contactEmail ?? "No email on file"}</p>
                    <p className="mt-1 text-xs text-foreground-subtle">
                      {statusLabel(access.status)} · {access.accessLevel.replaceAll("_", " ").toLowerCase()}
                    </p>
                    {access.lastOpenedAt ? (
                      <p className="mt-1 text-xs text-foreground-subtle">
                        Last opened {access.lastOpenedAt.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {props.canManage &&
                  (access.status === "ACTIVE" || access.status === "PENDING_VERIFICATION") ? (
                    <div className="flex flex-wrap gap-2">
                      {access.status === "ACTIVE" ? (
                        <Link
                          href={`/jobs/${props.jobId}/portal-preview/${access.id}`}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          Preview portal
                        </Link>
                      ) : null}
                      {access.contactEmail && props.emailConfigured ? (
                        <ResendPortalLinkButton accessId={access.id} jobId={props.jobId} />
                      ) : null}
                      <RevokeAccessButton accessId={access.id} jobId={props.jobId} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.canManage && props.emailConfigured ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Email customer links
          </p>
          {props.quote?.status === QuoteStatus.SENT ? (
            <SimplePortalEmailButton
              label="Email quote link"
              action={() => sendPortalQuoteLinkAction(props.jobId)}
            />
          ) : null}
          {props.changeOrders.map((co) => (
            <SimplePortalEmailButton
              key={co.id}
              label={`Email change order #${co.number}`}
              action={() => sendPortalChangeOrderLinkAction(props.jobId, co.id)}
            />
          ))}
          {props.duePaymentRequirements
            .filter((req) => req.paymentUrl)
            .map((req) => (
              <SimplePortalEmailButton
                key={req.id}
                label={`Email payment request — ${req.title}`}
                action={() => sendPortalPaymentRequestAction(props.jobId, req.id)}
              />
            ))}
        </div>
      ) : null}

      {props.openRequests.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Pending customer requests
          </p>
          <ul className="space-y-2">
            {props.openRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-lg border border-border bg-surface px-3 py-3 text-sm"
              >
                <p className="font-medium text-foreground">{request.title}</p>
                <p className="mt-1 text-foreground-muted">{request.message}</p>
                <p className="mt-1 text-xs text-foreground-subtle">
                  {request.type.replaceAll("_", " ").toLowerCase()} · {request.createdAt.toLocaleString()}
                </p>
                {props.canManage ? (
                  <CustomerRequestResolutionForm
                    request={request}
                    jobId={props.jobId}
                    taskOptions={props.taskOptions}
                    scheduleEventOptions={props.scheduleEventOptions}
                    jobStages={props.jobStages}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {props.canManage && props.attachments.length > 0 ? (
        <ShareAttachmentForm jobId={props.jobId} attachments={props.attachments} />
      ) : null}

      {props.canManage ? (
        <form action={uploadAction} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Request customer upload
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Title</span>
            <input
              name="title"
              required
              placeholder="e.g. Homeowner insurance certificate"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Type</span>
            <select
              name="resourceType"
              defaultValue="DOCUMENT"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="DOCUMENT">Document</option>
              <option value="PHOTO">Photo</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Instructions (optional)</span>
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          {uploadState.error ? (
            <p className="text-sm text-danger" role="alert">
              {uploadState.error}
            </p>
          ) : null}
          {uploadState.ok ? (
            <p className="text-sm text-success" role="status">
              Upload request is visible in the customer portal.
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={uploadPending}>
            {uploadPending ? "Saving…" : "Request upload"}
          </Button>
        </form>
      ) : null}

      {props.visibleResources.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Customer-visible resources
          </p>
          <ul className="space-y-2">
            {props.visibleResources.map((resource) => (
              <li
                key={resource.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{resource.title ?? resource.resourceType}</p>
                  <p className="text-xs text-foreground-subtle">
                    {resource.visibility.replaceAll("_", " ").toLowerCase()} ·{" "}
                    {resource.resourceType.toLowerCase()}
                  </p>
                </div>
                {props.canManage ? (
                  <RevokeVisibleResourceButton resourceId={resource.id} jobId={props.jobId} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {props.auditEvents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
            Portal activity (staff)
          </p>
          <ul className="space-y-2">
            {props.auditEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <p className="font-medium text-foreground">{event.label}</p>
                <p className="text-xs text-foreground-subtle">
                  {event.createdAt.toLocaleString()}
                  {event.contactName ? ` · ${event.contactName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RevokeVisibleResourceButton({
  resourceId,
  jobId,
}: {
  resourceId: string;
  jobId: string;
}) {
  const [state, action, pending] = useActionState<JobPortalActionResult, FormData>(
    (_prev, _formData) => revokeCustomerVisibleResourceAction(resourceId, jobId),
    { ok: false },
  );

  return (
    <form action={action}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

function RevokeAccessButton({ accessId, jobId }: { accessId: string; jobId: string }) {
  const [state, action, pending] = useActionState<JobPortalActionResult, FormData>(
    (_prev, _formData) => revokeCustomerPortalAccessAction(accessId, jobId),
    { ok: false },
  );

  return (
    <form action={action}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

function ResendPortalLinkButton({ accessId, jobId }: { accessId: string; jobId: string }) {
  const [state, action, pending] = useActionState<JobPortalActionResult, FormData>(
    (_prev, _formData) => sendPortalInvitationEmailAction(accessId, jobId),
    { ok: false },
  );

  return (
    <form action={action}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : "Email portal link"}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
      {state.ok ? <p className="mt-1 text-xs text-success">Email sent.</p> : null}
    </form>
  );
}

function SimplePortalEmailButton({
  label,
  action,
}: {
  label: string;
  action: () => Promise<JobPortalActionResult>;
}) {
  const [state, formAction, pending] = useActionState<JobPortalActionResult, FormData>(
    async () => action(),
    { ok: false },
  );

  return (
    <form action={formAction}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : label}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
      {state.ok ? <p className="mt-1 text-xs text-success">Email sent.</p> : null}
    </form>
  );
}

function ShareAttachmentForm({
  jobId,
  attachments,
}: {
  jobId: string;
  attachments: Array<{ id: string; fileName: string }>;
}) {
  const [state, action, pending] = useActionState<JobPortalActionResult, FormData>(
    async (_prev, formData) => {
      const attachmentId = String(formData.get("attachmentId") ?? "");
      const title = String(formData.get("title") ?? "");
      return shareAttachmentWithCustomerAction(jobId, attachmentId, title);
    },
    { ok: false },
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        Share existing attachment
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Attachment</span>
        <select
          name="attachmentId"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select file…</option>
          {attachments.map((attachment) => (
            <option key={attachment.id} value={attachment.id}>
              {attachment.fileName}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Customer-facing title</span>
        <input
          name="title"
          placeholder="Optional display title"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      {state.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-success" role="status">
          Attachment is visible in the customer portal.
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sharing…" : "Share with customer"}
      </Button>
    </form>
  );
}

function CustomerRequestResolutionForm({
  request,
  jobId,
  taskOptions,
  scheduleEventOptions,
  jobStages,
}: {
  request: JobPortalPanelProps["openRequests"][number];
  jobId: string;
  taskOptions: JobPortalPanelProps["taskOptions"];
  scheduleEventOptions: JobPortalPanelProps["scheduleEventOptions"];
  jobStages: JobPortalPanelProps["jobStages"];
}) {
  const [resolveState, resolveAction, resolvePending] = useActionState<
    JobPortalActionResult,
    FormData
  >((_prev, formData) => resolveCustomerRequestAction(request.id, jobId, formData), {
    ok: false,
  });

  const [followUpState, followUpAction, followUpPending] = useActionState<
    JobPortalActionResult,
    FormData
  >((_prev, formData) => createCustomerRequestFollowUpTaskAction(request.id, jobId, formData), {
    ok: false,
  });

  const [, declineAction, declinePending] = useActionState<JobPortalActionResult, FormData>(
    (_prev, formData) => {
      formData.set("status", "DECLINED");
      return resolveCustomerRequestAction(request.id, jobId, formData);
    },
    { ok: false },
  );

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <form action={resolveAction} className="space-y-2">
        <input type="hidden" name="status" value="RESOLVED" />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-subtle">Link to task</span>
          <select
            name="linkedTaskId"
            defaultValue=""
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">None</option>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>
                {task.stageTitle}: {task.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-subtle">
            Link to schedule event
          </span>
          <select
            name="linkedScheduleEventId"
            defaultValue=""
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">None</option>
            {scheduleEventOptions.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title ?? "Scheduled visit"} · {event.startAt.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-subtle">
            Resolution note (internal)
          </span>
          <textarea
            name="resolutionNote"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={resolvePending}>
            {resolvePending ? "Saving…" : "Resolve"}
          </Button>
        </div>
        {resolveState.error ? <p className="text-xs text-danger">{resolveState.error}</p> : null}
      </form>

      <form action={declineAction}>
        <Button type="submit" variant="secondary" disabled={declinePending || resolvePending}>
          {declinePending ? "Saving…" : "Decline"}
        </Button>
      </form>

      <form action={followUpAction} className="space-y-2 rounded-md border border-border bg-surface-elevated/30 p-3">
        <p className="text-xs font-medium text-foreground-subtle">Create follow-up task</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-subtle">Stage</span>
          <select
            name="jobStageId"
            required
            defaultValue={jobStages[0]?.id ?? ""}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {jobStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground-subtle">Task title</span>
          <input
            name="title"
            required
            defaultValue={`Follow up: ${request.title}`}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={followUpPending}>
          {followUpPending ? "Creating…" : "Create follow-up task"}
        </Button>
        {followUpState.error ? <p className="text-xs text-danger">{followUpState.error}</p> : null}
        {followUpState.ok ? <p className="text-xs text-success">Follow-up task created.</p> : null}
      </form>
    </div>
  );
}
