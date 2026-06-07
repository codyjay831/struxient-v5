"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TagStatus, TagSource } from "@prisma/client";
import {
  createTagAction,
  updateTagAction,
  archiveTagAction,
  mergeTagsAction,
  suggestTagMergesAction,
} from "@/app/(workspace)/settings/scope-library/tag-actions";
import {
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Info, Sparkles, Loader2, Tag as TagIcon, Edit2, Merge, Archive } from "lucide-react";
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
const dangerButtonClass = workspaceFormDangerButtonClass;

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
  const router = useRouter();
  const [editingTag, setEditingId] = useState<TagWithCounts | null>(null);
  const [mergingTag, setMergingTag] = useState<TagWithCounts | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ sourceTagId: string; targetTagId: string; reason: string }[]>([]);

  const activeTags = initialTags.filter((t) => t.status === "ACTIVE");
  const archivedTags = initialTags.filter((t) => t.status === "ARCHIVED");

  const handleArchive = async (tagId: string) => {
    await archiveTagAction(tagId);
    router.refresh();
  };

  const handleFormDone = () => {
    router.refresh();
  };

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
        {activeTags.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title="No tags yet"
            description="Create your first tag to organize line items and tasks across your scope library."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {activeTags.map((tag) => (
              <li key={tag.id} className="px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: tag.color || "#3b82f6" }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{tag.name}</span>
                        {tag.source !== "USER_CREATED" ? (
                          <Badge variant="outline" className="text-[10px]">
                            {tag.source === "AI_SUGGESTED" ? "AI" : tag.source.toLowerCase()}
                          </Badge>
                        ) : null}
                      </div>
                      {tag.aliases.length > 0 ? (
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          Aliases: {tag.aliases.join(", ")}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-foreground-muted">
                        {tag._count.lineItemTemplates} line items · {tag._count.taskTemplates} tasks
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setEditingId(tag)}
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setMergingTag(tag)}
                      disabled={activeTags.length < 2}
                    >
                      <Merge className="mr-1.5 h-3.5 w-3.5" />
                      Merge
                    </button>
                    <button
                      type="button"
                      className={dangerButtonClass}
                      onClick={() => handleArchive(tag.id)}
                    >
                      <Archive className="mr-1.5 h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {archivedTags.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Archived tags
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface/50">
              {archivedTags.map((tag) => (
                <li key={tag.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border opacity-50"
                      style={{ backgroundColor: tag.color || "#3b82f6" }}
                      aria-hidden
                    />
                    <span className="text-sm text-foreground-muted">{tag.name}</span>
                  </div>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setEditingId(tag)}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {isCreating && (
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogContent>
            <CreateTagForm
              onDone={() => {
                // #region agent log
                fetch('http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62160e'},body:JSON.stringify({sessionId:'62160e',location:'tag-management-panel.tsx:onDone-create',message:'onDone called from CreateTagForm',data:{phase:'callback'},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
                // #endregion
                setIsCreating(false);
                handleFormDone();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {editingTag && (
        <Dialog open={!!editingTag} onOpenChange={() => setEditingId(null)}>
          <DialogContent>
            <EditTagForm tag={editingTag} onDone={() => { setEditingId(null); handleFormDone(); }} />
          </DialogContent>
        </Dialog>
      )}

      {mergingTag && (
        <Dialog open={!!mergingTag} onOpenChange={() => setMergingTag(null)}>
          <DialogContent>
            <MergeTagsForm
              sourceTag={mergingTag}
              availableTags={activeTags.filter((t) => t.id !== mergingTag.id)}
              onDone={() => { setMergingTag(null); handleFormDone(); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateTagForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(createTagAction, {});

  // #region agent log
  fetch('http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62160e'},body:JSON.stringify({sessionId:'62160e',location:'tag-management-panel.tsx:CreateTagForm-render',message:'CreateTagForm render',data:{success:!!state.success,error:state.error??null,isPending},timestamp:Date.now(),hypothesisId:'A,C',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  useEffect(() => {
    if (state.success) {
      // #region agent log
      fetch('http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62160e'},body:JSON.stringify({sessionId:'62160e',location:'tag-management-panel.tsx:CreateTagForm-onDone-in-effect',message:'calling onDone from useEffect',data:{success:true},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      onDone();
    }
  }, [state.success, onDone]);

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

  useEffect(() => {
    if (state.success) {
      onDone();
    }
  }, [state.success, onDone]);

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
