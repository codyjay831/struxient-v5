"use client";

import { useState, useTransition } from "react";
import { JobPaymentRequirementStatus, type JobStage } from "@prisma/client";
import {
  createJobPaymentRequirementAction,
  markJobPaymentRequirementPaidAction,
  waiveJobPaymentRequirementAction,
  cancelJobPaymentRequirementAction,
} from "@/app/(workspace)/jobs/job-payment-actions";
import {
  formatJobPaymentStatus,
  jobPaymentStatusBadgeTone,
  formatCents,
} from "@/lib/job-payment-display";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { CreditCard, Plus, Check, Ban, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type PaymentRequirement = {
  id: string;
  title: string;
  amountCents: number | null;
  status: JobPaymentRequirementStatus;
  notes: string | null;
  requiredBeforeStageId: string | null;
  requiredBeforeStage?: { title: string } | null;
  paidAt: Date | null;
  waivedAt: Date | null;
  canceledAt: Date | null;
};

export function JobPaymentManager({
  jobId,
  initialRequirements,
  stages,
  effectivelyDueRequirementIds = [],
}: {
  jobId: string;
  initialRequirements: PaymentRequirement[];
  stages: Pick<JobStage, "id" | "title">[];
  effectivelyDueRequirementIds?: string[];
}) {
  const effectivelyDueSet = new Set(effectivelyDueRequirementIds);
  const [isPending] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [showHistorical, setShowHistorical] = useState(false);

  const activeRequirements = initialRequirements.filter(
    (r) => r.status === "DUE" || r.status === "PENDING",
  );
  const historicalRequirements = initialRequirements.filter(
    (r) => r.status === "PAID" || r.status === "WAIVED" || r.status === "CANCELED",
  );

  return (
    <section className="mb-8">
      <SectionHeading
        title="Payments & Gates"
        description="Track financial requirements and blockers for this job. These are internal staff records and do not yet reflect customer-facing invoices."
      />

      <div className="space-y-4">
        {activeRequirements.length === 0 && !showForm ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <CreditCard className="mx-auto size-8 text-foreground-subtle/50" />
            <p className="mt-2 text-sm font-medium text-foreground-subtle">No active payment requirements</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-xs font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Record your first requirement
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeRequirements.map((req) => (
              <RequirementCard
                key={req.id}
                requirement={req}
                isPending={isPending}
                isEffectivelyDue={effectivelyDueSet.has(req.id)}
              />
            ))}
          </div>
        )}

        {showForm ? (
          <CreateRequirementForm
            jobId={jobId}
            stages={stages}
            onCancel={() => setShowForm(false)}
            onSuccess={() => setShowForm(false)}
          />
        ) : activeRequirements.length > 0 ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add another requirement
          </button>
        ) : null}

        {historicalRequirements.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowHistorical(!showHistorical)}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
            >
              {showHistorical ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              {showHistorical ? "Hide" : "Show"} historical requirements ({historicalRequirements.length})
            </button>
            {showHistorical && (
              <div className="mt-3 space-y-2 opacity-70 transition-opacity hover:opacity-100">
                {historicalRequirements.map((req) => (
                  <RequirementCard key={req.id} requirement={req} isPending={isPending} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function RequirementCard({
  requirement,
  isPending,
  isEffectivelyDue = false,
}: {
  requirement: PaymentRequirement;
  isPending: boolean;
  isEffectivelyDue?: boolean;
}) {
  const [, startTransition] = useTransition();

  const onMarkPaid = () => {
    startTransition(async () => {
      await markJobPaymentRequirementPaidAction(requirement.id);
    });
  };

  const onWaive = () => {
    if (!confirm("Are you sure you want to waive this payment requirement?")) return;
    startTransition(async () => {
      await waiveJobPaymentRequirementAction(requirement.id);
    });
  };

  const onCancel = () => {
    if (!confirm("Are you sure you want to cancel this payment requirement?")) return;
    startTransition(async () => {
      await cancelJobPaymentRequirementAction(requirement.id);
    });
  };

  const isHistorical =
    requirement.status === "PAID" ||
    requirement.status === "WAIVED" ||
    requirement.status === "CANCELED";

  return (
    <div className="group relative rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{requirement.title}</h4>
            <StatusBadge
              label={formatJobPaymentStatus(requirement.status)}
              tone={jobPaymentStatusBadgeTone(requirement.status)}
            />
            {isEffectivelyDue && (
              <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                <Ban className="size-2.5" />
                {requirement.status === "PENDING" ? "Due (scheduled)" : "Blocking work"}
              </span>
            )}
          </div>
          {requirement.amountCents && (
            <p className="mt-1 text-xs font-medium text-foreground-subtle">
              {formatCents(requirement.amountCents)}
            </p>
          )}
          {requirement.requiredBeforeStage && (
            <p className="mt-1 text-xs text-foreground-muted">
              Required before <span className="font-medium text-foreground-subtle">{requirement.requiredBeforeStage.title}</span>
            </p>
          )}
          {requirement.notes && (
            <p className="mt-2 text-xs leading-relaxed text-foreground-muted italic">
              {requirement.notes}
            </p>
          )}
        </div>

        {!isHistorical && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={onMarkPaid}
              disabled={isPending}
              className="flex size-8 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors hover:border-success/40 hover:bg-success/5 hover:text-success disabled:opacity-50"
              title="Mark as paid"
            >
              <Check className="size-4" />
            </button>
            <button
              onClick={onWaive}
              disabled={isPending}
              className="flex size-8 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors hover:border-warning/40 hover:bg-warning/5 hover:text-warning disabled:opacity-50"
              title="Waive requirement"
            >
              <Ban className="size-4" />
            </button>
            <button
              onClick={onCancel}
              disabled={isPending}
              className="flex size-8 items-center justify-center rounded-md border border-border bg-surface text-foreground-muted transition-colors hover:border-danger/40 hover:bg-danger/5 hover:text-danger disabled:opacity-50"
              title="Cancel requirement"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateRequirementForm({
  jobId,
  stages,
  onCancel,
  onSuccess,
}: {
  jobId: string;
  stages: Pick<JobStage, "id" | "title">[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    title: "",
    amountCents: "",
    status: "DUE" as JobPaymentRequirementStatus,
    requiredBeforeStageId: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    startTransition(async () => {
      await createJobPaymentRequirementAction({
        jobId,
        title: formData.title,
        amountCents: formData.amountCents ? Math.round(parseFloat(formData.amountCents) * 100) : undefined,
        status: formData.status,
        requiredBeforeStageId: formData.requiredBeforeStageId || undefined,
        notes: formData.notes || undefined,
      });
      onSuccess();
    });
  };

  return (
    <WorkspacePanel className="border-border-strong bg-surface/50">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Title
            </label>
            <input
              type="text"
              id="title"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              placeholder="e.g. Deposit, Final Payment"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Amount (USD)
            </label>
            <input
              type="number"
              id="amount"
              step="0.01"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              placeholder="0.00"
              value={formData.amountCents}
              onChange={(e) => setFormData({ ...formData, amountCents: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="status" className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Initial Status
            </label>
            <select
              id="status"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as JobPaymentRequirementStatus })}
            >
              <option value="DUE">Due</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="stage" className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Required Before Stage (Gate)
            </label>
            <select
              id="stage"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              value={formData.requiredBeforeStageId}
              onChange={(e) => setFormData({ ...formData, requiredBeforeStageId: e.target.value })}
            >
              <option value="">No specific stage gate</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Notes
            </label>
            <textarea
              id="notes"
              rows={2}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
              placeholder="Optional notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !formData.title}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground-muted disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Save requirement"}
          </button>
        </div>
      </form>
    </WorkspacePanel>
  );
}
