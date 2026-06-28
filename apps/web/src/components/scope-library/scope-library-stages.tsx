"use client";

import { useActionState, useState } from "react";
import {
  createStageAction,
  updateStageAction,
  archiveStageAction,
  moveStageAction,
  type StageFormState,
} from "@/app/(workspace)/settings/scope-library/stage-actions";
import {
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Layers } from "lucide-react";

const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const initialActionState: StageFormState = {};

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function CreateStageForm() {
  const [state, formAction, isPending] = useActionState(
    createStageAction,
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="mb-8 space-y-3 rounded-lg border border-border bg-surface px-4 py-4"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        New execution stage
      </p>
      {state.error ? <FormError message={state.error} /> : null}
      <div className="grid gap-2 sm:flex">
        <input
          name="name"
          type="text"
          required
          className={controlClass}
          placeholder="e.g. Pre-Construction"
        />
        <button
          type="submit"
          className={`${primaryButtonClass} w-full sm:w-auto`}
          disabled={isPending}
        >
          {isPending ? "Adding…" : "Add stage"}
        </button>
      </div>
    </form>
  );
}

export function ScopeLibraryStagesPanel({
  stages,
}: {
  stages: { id: string, name: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <SectionHeading
        title="Execution stages"
        description="Phases used to group tasks. These are shared across all line items and jobs."
      />
      <CreateStageForm />
      {stages.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No stages yet"
          description="Add your first execution stage above."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {stages.map((s, idx) => (
            <li key={s.id} className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {editingId === s.id ? (
                  <EditStageForm stage={s} onDone={() => setEditingId(null)} />
                ) : (
                  <>
                    <span className="break-words text-sm font-medium text-foreground">{s.name}</span>
                    <div className="grid gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        className={`${secondaryButtonClass} w-full sm:w-auto`}
                        onClick={() => setEditingId(s.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${secondaryButtonClass} w-full sm:w-auto`}
                        onClick={() => moveStageAction(s.id, "up")}
                        disabled={idx === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={`${secondaryButtonClass} w-full sm:w-auto`}
                        onClick={() => moveStageAction(s.id, "down")}
                        disabled={idx === stages.length - 1}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className={`${dangerButtonClass} w-full sm:w-auto`}
                        onClick={() => archiveStageAction(s.id)}
                      >
                        Hide
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EditStageForm({ stage, onDone }: { stage: { id: string, name: string }, onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(
    updateStageAction.bind(null, stage.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="grid w-full gap-2 sm:flex">
      <div className="flex-1">
        {state.error ? <FormError message={state.error} /> : null}
        <input
          name="name"
          type="text"
          required
          defaultValue={stage.name}
          className={controlClass}
        />
      </div>
      <button
        type="submit"
        className={`${primaryButtonClass} w-full sm:w-auto`}
        disabled={isPending}
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className={`${secondaryButtonClass} w-full sm:w-auto`}
        onClick={onDone}
      >
        Cancel
      </button>
    </form>
  );
}
