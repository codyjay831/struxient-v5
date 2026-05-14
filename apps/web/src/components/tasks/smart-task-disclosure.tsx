"use client";

import { useState } from "react";
import { Zap, Sparkles, Trash2, Wrench, ListChecks, Camera, Paperclip, FileText } from "lucide-react";
import { 
  workspaceFormControlClass, 
  workspaceFormFieldLabelClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { suggestSignalsForTask } from "@/lib/ai/signal-suggester";
import type { TaskCompletionRequirements, ChecklistItem } from "@/lib/task-readiness";
import type { TaskResourceRequirement, TaskResource } from "@/lib/task-resource";
import { toast } from "sonner";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;

export function SmartTaskDisclosure({ 
  providesSignals: initialProvides, 
  requiresSignals: initialRequires, 
  hardSignal,
  requirementsJson,
  partsRequiredJson,
  title,
  category,
}: { 
  providesSignals?: string[], 
  requiresSignals?: string[], 
  hardSignal?: boolean,
  requirementsJson?: unknown,
  partsRequiredJson?: unknown,
  title?: string,
  category?: string,
}) {
  const [provides, setProvides] = useState(initialProvides?.join(", ") || "");
  const [requires, setRequires] = useState(initialRequires?.join(", ") || "");
  
  const reqs = (requirementsJson ?? {}) as TaskCompletionRequirements;
  const parts = (partsRequiredJson ?? { resources: [] }) as TaskResourceRequirement;

  const [checklist, setChecklist] = useState<ChecklistItem[]>(reqs.checklist || []);
  const [resources, setResources] = useState<TaskResource[]>(parts.resources || []);

  const handleSuggest = () => {
    if (!title) {
      toast.error("Enter a task title first to get suggestions.");
      return;
    }
    const suggestions = suggestSignalsForTask(title, category || "GENERAL");
    
    if (suggestions.provides.length > 0 || suggestions.requires.length > 0) {
      const newProvides = Array.from(new Set([...(provides ? provides.split(",").map(s => s.trim()) : []), ...suggestions.provides])).join(", ");
      const newRequires = Array.from(new Set([...(requires ? requires.split(",").map(s => s.trim()) : []), ...suggestions.requires])).join(", ");
      
      setProvides(newProvides);
      setRequires(newRequires);
      toast.success("AI Secretary suggested signals.");
    } else {
      toast.info("No obvious signals found for this title.");
    }
  };

  const addChecklistItem = () => {
    setChecklist([...checklist, { id: crypto.randomUUID(), label: "" }]);
  };

  const updateChecklistItem = (id: string, label: string) => {
    setChecklist(checklist.map(item => item.id === id ? { ...item, label } : item));
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(checklist.filter(item => item.id !== id));
  };

  const addResource = () => {
    setResources([...resources, { id: crypto.randomUUID(), name: "", quantity: 1, isEquipment: true }]);
  };

  const updateResource = (id: string, updates: Partial<TaskResource>) => {
    setResources(resources.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const removeResource = (id: string) => {
    setResources(resources.filter(item => item.id !== id));
  };

  return (
    <div className="mt-4 space-y-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-primary">
          <Zap className="h-3 w-3" />
          Smart Task Configuration
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        >
          <Sparkles className="size-3" />
          Suggest Signals
        </button>
      </div>
      
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Signals & Dependencies */}
        <div className="space-y-4">
          <p className={fieldLabelClass}>Signals & Dependencies</p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-medium text-foreground-muted">Provides signals</span>
              <input
                name="providesSignals"
                type="text"
                className={controlClass}
                value={provides}
                onChange={(e) => setProvides(e.target.value)}
                placeholder="e.g. roof-sealed, permit-ready"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-medium text-foreground-muted">Requires signals</span>
              <input
                name="requiresSignals"
                type="text"
                className={controlClass}
                value={requires}
                onChange={(e) => setRequires(e.target.value)}
                placeholder="e.g. materials-on-site"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                name="hardSignal"
                type="checkbox"
                defaultChecked={hardSignal}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs font-medium text-foreground">Hard dependency (blocks activation)</span>
            </label>
          </div>
        </div>

        {/* Completion Proof */}
        <div className="space-y-4">
          <p className={fieldLabelClass}>Completion Proof</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                name="noteRequired"
                type="checkbox"
                defaultChecked={reqs.noteRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex items-center gap-1.5">
                <FileText className="size-3 text-foreground-subtle" />
                <span className="text-xs text-foreground">Note required</span>
              </div>
            </label>
            <label className="flex items-center gap-2">
              <input
                name="photoRequired"
                type="checkbox"
                defaultChecked={reqs.photoRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex items-center gap-1.5">
                <Camera className="size-3 text-foreground-subtle" />
                <span className="text-xs text-foreground">Photo required</span>
              </div>
            </label>
            <label className="flex items-center gap-2">
              <input
                name="attachmentRequired"
                type="checkbox"
                defaultChecked={reqs.attachmentRequired}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="flex items-center gap-1.5">
                <Paperclip className="size-3 text-foreground-subtle" />
                <span className="text-xs text-foreground">File attachment required</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t border-primary/10">
        {/* Checklist Builder */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ListChecks className="size-3 text-primary" />
              <p className={fieldLabelClass}>Checklist</p>
            </div>
            <button
              type="button"
              onClick={addChecklistItem}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Add Item
            </button>
          </div>
          
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  className={`${controlClass} !mt-0 flex-1 py-1 text-xs`}
                  value={item.label}
                  onChange={(e) => updateChecklistItem(item.id, e.target.value)}
                  placeholder={`Step ${idx + 1}...`}
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(item.id)}
                  className="text-foreground-subtle hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {checklist.length === 0 && (
              <p className="text-[10px] italic text-foreground-muted">No checklist items defined.</p>
            )}
          </div>
          <input type="hidden" name="checklistJson" value={JSON.stringify(checklist)} />
        </div>

        {/* Equipment & Tools */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wrench className="size-3 text-primary" />
              <p className={fieldLabelClass}>Equipment & Tools</p>
            </div>
            <button
              type="button"
              onClick={addResource}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Add Resource
            </button>
          </div>

          <div className="space-y-2">
            {resources.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  className={`${controlClass} !mt-0 flex-1 py-1 text-xs`}
                  value={item.name}
                  onChange={(e) => updateResource(item.id, { name: e.target.value })}
                  placeholder="Equipment name..."
                />
                <input
                  type="number"
                  className={`${controlClass} !mt-0 w-12 py-1 text-xs`}
                  value={item.quantity}
                  min={1}
                  onChange={(e) => updateResource(item.id, { quantity: parseInt(e.target.value) || 1 })}
                />
                <button
                  type="button"
                  onClick={() => removeResource(item.id)}
                  className="text-foreground-subtle hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {resources.length === 0 && (
              <p className="text-[10px] italic text-foreground-muted">No equipment or tools specified.</p>
            )}
          </div>
          <input type="hidden" name="partsRequiredJson" value={JSON.stringify({ resources })} />
        </div>
      </div>
    </div>
  );
}
