"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Percent
} from "lucide-react";
import { PaymentScheduleAnchorType } from "@prisma/client";
import { 
  addPaymentScheduleItemWorkspaceAction,
  deletePaymentScheduleItemWorkspaceAction,
  updatePaymentScheduleItemWorkspaceAction,
  reorderPaymentScheduleItemsWorkspaceAction,
  type QuoteWorkspaceActionState
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import { 
  formatCentsAsDollarInput, 
  formatMoneyCents,
  formatPaymentAnchorLabel,
  type PaymentScheduleItemPayload 
} from "@/lib/quote-display";
import { 
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS } from "@/app/(workspace)/quotes/quote-field-limits";

const initialState: QuoteWorkspaceActionState = {};
const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

type StageOption = {
  id: string;
  name: string;
};

type PaymentScheduleEditorProps = {
  quoteId: string;
  quoteTotalCents: number;
  items: PaymentScheduleItemPayload[];
  stages: StageOption[];
  mode?: "standard" | "compact";
};

export function QuotePaymentScheduleEditor({
  quoteId,
  quoteTotalCents,
  items,
  stages,
  mode = "standard",
}: PaymentScheduleEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Calculate total scheduled
  const scheduledCents = items.reduce((sum, item) => {
    if (item.anchorType === "FINAL_BALANCE") return sum;
    return sum + (item.amountCents ?? 0);
  }, 0);

  const remainderCents = Math.max(0, quoteTotalCents - scheduledCents);
  const hasFinalBalance = items.some(item => item.anchorType === "FINAL_BALANCE");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
          Payment Schedule
        </h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-accent hover:text-accent-hover transition-colors"
          >
            <Plus className="size-3" />
            Add Milestone
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id}>
            {editingItemId === item.id ? (
              <EditItemForm
                quoteId={quoteId}
                item={item}
                stages={stages}
                quoteTotalCents={quoteTotalCents}
                onSuccess={() => setEditingItemId(null)}
                onCancel={() => setEditingItemId(null)}
              />
            ) : (
              <div 
                className="group flex items-center justify-between p-3 rounded-xl border border-border bg-surface hover:border-border-strong transition-all"
                onClick={() => setEditingItemId(item.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-foreground/[0.03] flex items-center justify-center text-foreground-subtle">
                    <DollarSign className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
                    <p className="text-[0.7rem] text-foreground-muted">
                      {formatPaymentAnchorLabel(item.anchorType, stages.find(s => s.id === item.anchorStageId)?.name ?? null)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-foreground">
                    {item.anchorType === "FINAL_BALANCE" 
                      ? formatMoneyCents(remainderCents)
                      : formatMoneyCents(item.amountCents ?? 0)}
                  </div>
                  {item.percentage && (
                    <p className="text-[0.7rem] text-foreground-muted">
                      {item.percentage}% of total
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isAdding && (
          <AddItemForm
            quoteId={quoteId}
            stages={stages}
            quoteTotalCents={quoteTotalCents}
            onSuccess={() => setIsAdding(false)}
            onCancel={() => setIsAdding(false)}
          />
        )}

        {items.length === 0 && !isAdding && (
          <div className="p-8 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center">
            <DollarSign className="size-8 text-foreground-subtle mb-2" />
            <p className="text-sm text-foreground-muted">No payment milestones defined.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="mt-3 text-xs font-bold text-accent hover:underline"
            >
              Create a deposit or milestone
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="p-3 rounded-xl bg-foreground/[0.02] border border-border flex items-center justify-between">
          <span className="text-[0.7rem] font-medium text-foreground-muted">Total Scheduled</span>
          <div className="text-right">
            <span className={`text-sm font-bold ${scheduledCents + (hasFinalBalance ? remainderCents : 0) !== quoteTotalCents ? 'text-warning' : 'text-foreground'}`}>
              {formatMoneyCents(scheduledCents + (hasFinalBalance ? remainderCents : 0))}
            </span>
            {scheduledCents + (hasFinalBalance ? remainderCents : 0) !== quoteTotalCents && (
              <p className="text-[0.6rem] text-warning flex items-center gap-1 justify-end">
                <AlertCircle className="size-2.5" />
                Does not match quote total ({formatMoneyCents(quoteTotalCents)})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddItemForm({
  quoteId,
  stages,
  quoteTotalCents,
  onSuccess,
  onCancel,
}: {
  quoteId: string;
  stages: StageOption[];
  quoteTotalCents: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    addPaymentScheduleItemWorkspaceAction.bind(null, quoteId),
    initialState,
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="p-4 rounded-xl border border-accent/30 bg-accent/[0.01] space-y-4">
      <ItemFormFields stages={stages} quoteTotalCents={quoteTotalCents} />
      {state.error && <FormError message={state.error} />}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={secondaryButtonClass}
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={isPending}
        >
          {isPending ? "Adding..." : "Add Milestone"}
        </button>
      </div>
    </form>
  );
}

function EditItemForm({
  quoteId,
  item,
  stages,
  quoteTotalCents,
  onSuccess,
  onCancel,
}: {
  quoteId: string;
  item: PaymentScheduleItemPayload;
  stages: StageOption[];
  quoteTotalCents: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updatePaymentScheduleItemWorkspaceAction.bind(null, quoteId, item.id),
    initialState,
  );

  const [deleteState, deleteAction, isDeleting] = useActionState(
    deletePaymentScheduleItemWorkspaceAction.bind(null, quoteId, item.id),
    initialState,
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  useEffect(() => {
    if (deleteState.success) onSuccess();
  }, [deleteState.success, onSuccess]);

  return (
    <div className="p-4 rounded-xl border border-border-strong bg-surface shadow-sm space-y-4">
      <form action={formAction} className="space-y-4">
        <ItemFormFields item={item} stages={stages} quoteTotalCents={quoteTotalCents} />
        {state.error && <FormError message={state.error} />}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (confirm("Remove this payment milestone?")) {
                const formData = new FormData();
                deleteAction(formData);
              }
            }}
            className={dangerButtonClass}
            disabled={isPending || isDeleting}
          >
            <Trash2 className="size-3.5 mr-1" />
            Remove
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={secondaryButtonClass}
              disabled={isPending || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={isPending || isDeleting}
            >
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ItemFormFields({
  item,
  stages,
  quoteTotalCents,
}: {
  item?: PaymentScheduleItemPayload;
  stages: StageOption[];
  quoteTotalCents: number;
}) {
  const [anchorType, setAnchorType] = useState<PaymentScheduleAnchorType>(item?.anchorType ?? "UPON_APPROVAL");
  const [amountMode, setAmountMode] = useState<"dollars" | "percent" | "remainder">(
    item?.anchorType === "FINAL_BALANCE" ? "remainder" : (item?.percentage ? "percent" : "dollars")
  );

  return (
    <div className="space-y-3">
      <div>
        <label className={fieldLabelClass}>Milestone Title</label>
        <input
          name="title"
          defaultValue={item?.title}
          placeholder="e.g. Deposit, Progress Payment"
          className={controlClass}
          required
          maxLength={QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS.title}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabelClass}>Trigger / Anchor</label>
          <select
            name="anchorType"
            value={anchorType}
            onChange={(e) => {
              const val = e.target.value as PaymentScheduleAnchorType;
              setAnchorType(val);
              if (val === "FINAL_BALANCE") setAmountMode("remainder");
              else if (amountMode === "remainder") setAmountMode("dollars");
            }}
            className={controlClass}
          >
            <option value="UPON_APPROVAL">Upon Approval (Deposit)</option>
            <option value="BEFORE_STAGE">Before Stage</option>
            <option value="AFTER_STAGE">After Stage</option>
            <option value="FINAL_BALANCE">Final Balance</option>
          </select>
        </div>
        <div>
          <label className={fieldLabelClass}>Stage (Optional)</label>
          <select
            name="anchorStageId"
            defaultValue={item?.anchorStageId ?? ""}
            className={controlClass}
            disabled={anchorType === "UPON_APPROVAL" || anchorType === "FINAL_BALANCE"}
          >
            <option value="">No specific stage</option>
            {stages.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={fieldLabelClass}>Amount</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {amountMode === "dollars" && (
              <>
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
                <input
                  name="amountDollars"
                  defaultValue={item?.amountCents ? formatCentsAsDollarInput(item.amountCents) : ""}
                  placeholder="0.00"
                  className={`${controlClass} pl-8`}
                  required={amountMode === "dollars"}
                />
              </>
            )}
            {amountMode === "percent" && (
              <>
                <input
                  name="percentage"
                  defaultValue={item?.percentage ?? ""}
                  placeholder="0"
                  className={`${controlClass} pr-8`}
                  required={amountMode === "percent"}
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-foreground-subtle" />
              </>
            )}
            {amountMode === "remainder" && (
              <div className={`${controlClass} bg-foreground/[0.03] flex items-center justify-between`}>
                <span className="text-foreground-muted italic">Remaining balance</span>
                <span className="font-bold text-foreground">Calculated</span>
              </div>
            )}
          </div>
          <div className="flex rounded-lg border border-border p-1 bg-background">
            <button
              type="button"
              onClick={() => setAmountMode("dollars")}
              className={`px-2 py-1 rounded-md text-[0.65rem] font-bold transition-all ${amountMode === "dollars" ? 'bg-accent text-accent-contrast shadow-sm' : 'text-foreground-subtle hover:text-foreground'}`}
              disabled={anchorType === "FINAL_BALANCE"}
            >
              $
            </button>
            <button
              type="button"
              onClick={() => setAmountMode("percent")}
              className={`px-2 py-1 rounded-md text-[0.65rem] font-bold transition-all ${amountMode === "percent" ? 'bg-accent text-accent-contrast shadow-sm' : 'text-foreground-subtle hover:text-foreground'}`}
              disabled={anchorType === "FINAL_BALANCE"}
            >
              %
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger flex items-center gap-2">
      <AlertCircle className="size-3.5" />
      {message}
    </p>
  );
}
