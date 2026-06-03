"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addJobTaskAction } from "@/app/(workspace)/jobs/job-task-actions";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type JobTaskAddButtonProps = {
  jobId: string;
  jobStageId: string;
  stageTitle: string;
  variant?: "stage" | "empty";
};

export function JobTaskAddButton({
  jobId,
  jobStageId,
  stageTitle,
  variant = "stage",
}: JobTaskAddButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");

  const resetForm = () => {
    setTitle("");
    setInstructions("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    startTransition(async () => {
      const result = await addJobTaskAction({
        jobId,
        jobStageId,
        title,
        instructions: instructions || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task added to the work plan.");
      setOpen(false);
      resetForm();
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant={variant === "empty" ? "primary" : "ghost"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        {variant === "empty" ? "Add first task" : "Add task"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add task to {stageTitle}</DialogTitle>
          <DialogDescription>
            Add this to the internal work plan. It does not change the quote, price, or
            customer-approved scope.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogContent>
            <div className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs leading-relaxed text-foreground-muted">
              Use{" "}
              <span className="font-medium text-foreground">Record field event</span> for a
              lightweight hold, or{" "}
              <span className="font-medium text-foreground">Issue / Recovery</span> when work
              is blocked by a problem.
            </div>

            <div>
              <label htmlFor={`task-title-${jobStageId}`} className="text-xs font-medium text-foreground">
                Task title
              </label>
              <input
                id={`task-title-${jobStageId}`}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={TASK_TEMPLATE_FIELD_LIMITS.title}
                placeholder="e.g. Pick up permits, Site walk, Final punch list"
                className={controlClass}
                disabled={isPending}
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor={`task-instructions-${jobStageId}`}
                className="text-xs font-medium text-foreground"
              >
                Instructions <span className="font-normal text-foreground-muted">(optional)</span>
              </label>
              <textarea
                id={`task-instructions-${jobStageId}`}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={TASK_TEMPLATE_FIELD_LIMITS.instructions}
                rows={3}
                placeholder="Field notes or context for the crew..."
                className={controlClass}
                disabled={isPending}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add task"
                )}
              </Button>
            </div>
          </DialogContent>
        </form>
      </Dialog>
    </>
  );
}
