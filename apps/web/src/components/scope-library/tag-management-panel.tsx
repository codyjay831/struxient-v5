"use client";

import { useState, useActionState } from "react";
import { TagStatus, TagSource } from "@prisma/client";
import {
  createTagAction,
  updateTagAction,
  mergeTagsAction,
  suggestTagMergesAction,
} from "@/app/(workspace)/settings/scope-library/tag-actions";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { SectionHeading } from "@/components/ui/section-heading";
import { Plus, Info, Sparkles, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

type TagWithCounts = {
  id: string;
  name: string;
  color: string | null;
  source: TagSource;
  status: TagStatus;
  aliases: string[];
  _count: {
    lineItemTemplates: number;
    taskTemplates: number;
  };
};

export function TagManagementPanel({ initialTags }: { initialTags: TagWithCounts[] }) {
  const [editingTag, setEditingId] = useState<TagWithCounts | null>(null);
  const [mergingTag, setMergingTag] = useState<TagWithCounts | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ sourceTagId: string; targetTagId: string; reason: string }[]>([]);

  const activeTags = initialTags.filter((t) => t.status === "ACTIVE");

  const handleSuggestMerges = async () => {
    setIsSuggesting(true);
    try {
      const res = await suggestTagMergesAction();
      setSuggestions(res.suggestions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeading
          title="Organization Tags"
          description="Manage tags used across your scope and task libraries."
        />
        <div className="flex gap-2">
          <button
            onClick={handleSuggestMerges}
            disabled={isSuggesting || activeTags.length < 2}
            className={secondaryButtonClass}
          >
            {isSuggesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Suggest Merges
          </button>
          <button onClick={() => setIsCreating(true)} className={primaryButtonClass}>
            <Plus className="mr-2 h-4 w-4" />
            Create Tag
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-primary">AI Cleanup Suggestions</h3>
            </div>
            <button 
              onClick={() => setSuggestions([])}
              className="text-xs text-foreground-muted hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-2">
            {suggestions.map((s, idx) => {
              const source = activeTags.find(t => t.id === s.sourceTagId);
              const target = activeTags.find(t => t.id === s.targetTagId);
              if (!source || !target) return null;
              return (
                <div key={idx} className="flex items-center justify-between gap-4 bg-surface p-3 rounded-md border border-border">
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      Merge <Badge variant="outline">{source.name}</Badge> into <Badge variant="default">{target.name}</Badge>
                    </p>
                    <p className="text-[10px] text-foreground-muted mt-1">{s.reason}</p>
                  </div>
                  <button
                    onClick={() => setMergingTag(source)}
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                  >
                    Review Merge
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* ... table content ... */}
      </div>

      {isCreating && (
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogContent>
            <CreateTagForm onDone={() => setIsCreating(false)} />
          </DialogContent>
        </Dialog>
      )}

      {editingTag && (
        <Dialog open={!!editingTag} onOpenChange={() => setEditingId(null)}>
          <DialogContent>
            <EditTagForm tag={editingTag} onDone={() => setEditingId(null)} />
          </DialogContent>
        </Dialog>
      )}

      {mergingTag && (
        <Dialog open={!!mergingTag} onOpenChange={() => setMergingTag(null)}>
          <DialogContent>
            <MergeTagsForm
              sourceTag={mergingTag}
              availableTags={activeTags.filter((t) => t.id !== mergingTag.id)}
              onDone={() => setMergingTag(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateTagForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(createTagAction, {});

  if (state.success) {
    onDone();
  }

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Create New Tag</DialogTitle>
        <DialogDescription>
          Add a new canonical tag to your organization&apos;s library.
        </DialogDescription>
      </DialogHeader>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabelClass}>Tag Name</span>
          <input
            name="name"
            type="text"
            required
            className={controlClass}
            placeholder="e.g. Solar"
            autoFocus
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Color (Hex)</span>
          <input
            name="color"
            type="color"
            className="h-10 w-full rounded-md border border-border bg-background px-1 py-1"
            defaultValue="#3b82f6"
          />
        </label>
      </div>
      <DialogFooter>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Creating..." : "Create Tag"}
        </button>
      </DialogFooter>
    </form>
  );
}

function EditTagForm({ tag, onDone }: { tag: TagWithCounts; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(
    updateTagAction.bind(null, tag.id),
    {},
  );

  if (state.success) onDone();

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Edit Tag: {tag.name}</DialogTitle>
      </DialogHeader>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabelClass}>Tag Name</span>
          <input
            name="name"
            type="text"
            required
            className={controlClass}
            defaultValue={tag.name}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Color</span>
          <input
            name="color"
            type="color"
            className="h-10 w-full rounded-md border border-border bg-background px-1 py-1"
            defaultValue={tag.color || "#3b82f6"}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Status</span>
          <select name="status" className={controlClass} defaultValue={tag.status}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
      </div>
      <DialogFooter>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </button>
      </DialogFooter>
    </form>
  );
}

function MergeTagsForm({
  sourceTag,
  availableTags,
  onDone,
}: {
  sourceTag: TagWithCounts;
  availableTags: TagWithCounts[];
  onDone: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = async () => {
    if (!targetId) return;
    setIsPending(true);
    setError(null);
    const result = await mergeTagsAction(sourceTag.id, targetId);
    if (result.error) {
      setError(result.error);
      setIsPending(false);
    } else {
      onDone();
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Merge Tag: &quot;{sourceTag.name}&quot;</DialogTitle>
        <DialogDescription>
          Consolidate this tag into another canonical tag. All associated line items and tasks
          will be updated. &quot;{sourceTag.name}&quot; will become an alias of the target tag.
        </DialogDescription>
      </DialogHeader>
      {error && <p className="text-sm text-danger">{error}</p>}
      
      <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg flex gap-3">
        <Info className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-warning-strong leading-relaxed">
          This action is permanent. The source tag will be marked as merged and hidden from the library.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className={fieldLabelClass}>Merge into:</span>
          <select
            className={controlClass}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            required
          >
            <option value="">Select target tag...</option>
            {availableTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t._count.lineItemTemplates + t._count.taskTemplates} uses)
              </option>
            ))}
          </select>
        </label>
      </div>
      <DialogFooter>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleMerge}
          className={primaryButtonClass}
          disabled={isPending || !targetId}
        >
          {isPending ? "Merging..." : "Merge Tags"}
        </button>
      </DialogFooter>
    </div>
  );
}
