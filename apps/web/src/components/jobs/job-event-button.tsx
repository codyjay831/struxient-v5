"use client";

import { useState } from "react";
import { Zap, X, AlertTriangle, Loader2 } from "lucide-react";
import { addJobEventAction } from "@/app/(workspace)/jobs/job-event-actions";
import { toast } from "sonner";

export function JobEventButton({ 
  jobId, 
  tasks 
}: { 
  jobId: string; 
  tasks: { id: string; title: string; stageTitle: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (selectedTaskIds.length === 0) {
      toast.error("Please select at least one task to block.");
      return;
    }

    setIsPending(true);
    const result = await addJobEventAction(jobId, title, description, selectedTaskIds);
    setIsPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Event created and work blocked.");
      setIsOpen(false);
      setTitle("");
      setDescription("");
      setSelectedTaskIds([]);
    }
  };

  const toggleTask = (id: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent hover:bg-accent/10 transition-colors"
      >
        <Zap className="size-3" />
        Record Event
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Zap className="size-3.5" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Record Field Event</h3>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-foreground-subtle hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Event Title
            </label>
            <input
              autoFocus
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Hidden dry rot found, Failed inspection"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Description / Recovery Plan
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened and what needs to be done to recover?"
              className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              <AlertTriangle className="size-3 text-danger" />
              Tasks to Block
            </label>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background/50 divide-y divide-border">
              {tasks.map(task => (
                <label key={task.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-foreground/[0.02]">
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.includes(task.id)}
                    onChange={() => toggleTask(task.id)}
                    className="size-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-[10px] text-foreground-subtle">{task.stageTitle}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-foreground-muted italic">
              Selected tasks will be blocked until this event task is completed.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-foreground-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || selectedTaskIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent-contrast hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
              Create event & hold work
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
