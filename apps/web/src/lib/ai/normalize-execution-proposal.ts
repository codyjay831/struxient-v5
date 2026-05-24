import { TaskTemplateCategory } from "@prisma/client";
import type { AILibraryProposedTask } from "./library-proposal-schema";
import { inferAssigneeRoleForTask } from "./ai-role-inference";

type NormalizeResult = {
  tasks: AILibraryProposedTask[];
  cleanupNotes: string[];
};

const NEVER_HOIST_TITLE_PATTERN =
  /\b(permit|inspection schedule|schedule inspection|attend inspection|utility|disconnect|reconnect|energiz|payment|invoice|deposit|billing|collect|material|order material|delivery|customer access|site access|safety)\b/i;
const PROOF_DETAIL_PATTERN =
  /\b(upload|attach|photo|signature|record|document|confirm|note)\b/i;
const INSPECTION_DOC_PATTERN =
  /\b(confirm|finalize|document|upload|record|photo|capture)\b/i;
const FINALIZATION_CLUSTER_PATTERN =
  /\b(finaliz\w*|close[\s-]?out|wrap[\s-]?up|project\s+review|project\s+close)\b/i;
const INSPECTION_SCHEDULE_PATTERN =
  /\b(request|schedule|book|coordinate)\b.*\binspection\b|\binspection\b.*\b(request|schedule|book|coordinate)\b/i;
const INSPECTION_ATTEND_PATTERN =
  /\b(attend|present|on[\s-]?site|onsite|meet inspector)\b.*\binspection\b|\binspection\b.*\b(attend|present|on[\s-]?site|onsite|meet inspector)\b/i;
const ATTACHMENT_PROOF_PATTERN = /\b(upload|attach|document|file|pdf)\b/i;
const PHOTO_PROOF_PATTERN = /\b(photo|picture|image|before\/after|before after)\b/i;
const NOTE_PROOF_PATTERN = /\b(record|note|confirm|verification|verify)\b/i;

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function dedupeChecklist(
  checklist: AILibraryProposedTask["checklist"],
): AILibraryProposedTask["checklist"] {
  const labels = new Set<string>();
  const deduped: AILibraryProposedTask["checklist"] = [];
  for (const item of checklist) {
    const key = item.label.trim().toLowerCase();
    if (!key || labels.has(key)) continue;
    labels.add(key);
    deduped.push({ label: item.label.trim() });
  }
  return deduped;
}

function taskMergeKey(task: AILibraryProposedTask): string {
  return `${task.stageId ?? "none"}::${task.category}::${canonicalizeExecutionTaskTitle(task.title)}`;
}

function shouldPreserveAsStandaloneTask(task: AILibraryProposedTask): boolean {
  if (task.hardSignal || task.providesSignals.length > 0) return true;
  if (
    task.category === TaskTemplateCategory.PERMIT ||
    task.category === TaskTemplateCategory.PAYMENT ||
    task.category === TaskTemplateCategory.MATERIAL ||
    task.category === TaskTemplateCategory.SCHEDULING
  ) {
    return true;
  }
  return NEVER_HOIST_TITLE_PATTERN.test(task.title);
}

function mergeTasks(
  keep: AILibraryProposedTask,
  drop: AILibraryProposedTask,
): AILibraryProposedTask {
  return {
    ...keep,
    instructions: keep.instructions || drop.instructions,
    providesSignals: dedupeStrings([...keep.providesSignals, ...drop.providesSignals]),
    requiresSignals: dedupeStrings([...keep.requiresSignals, ...drop.requiresSignals]),
    hardSignal: keep.hardSignal || drop.hardSignal,
    noteRequired: Boolean(keep.noteRequired || drop.noteRequired),
    photoRequired: Boolean(keep.photoRequired || drop.photoRequired),
    attachmentRequired: Boolean(keep.attachmentRequired || drop.attachmentRequired),
    checklist: dedupeChecklist([...keep.checklist, ...drop.checklist]),
    resources: [...keep.resources, ...drop.resources],
  };
}

function applyProofFlagsFromText(task: AILibraryProposedTask, text: string) {
  if (ATTACHMENT_PROOF_PATTERN.test(text)) {
    task.attachmentRequired = true;
  }
  if (PHOTO_PROOF_PATTERN.test(text)) {
    task.photoRequired = true;
  }
  if (NOTE_PROOF_PATTERN.test(text)) {
    task.noteRequired = true;
  }
}

export function canonicalizeExecutionTaskTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(finaliz\w*|close[\s-]?out|wrap[\s-]?up|project\s+close)\b/g, "closeout")
    .replace(/\b(confirm|record|document|upload)\b/g, "confirm")
    .replace(/\b(schedule|book|request)\b/g, "schedule")
    .replace(/\b(attend|present|onsite|on site)\b/g, "attend")
    .replace(/\binspector\b/g, "inspection")
    .replace(/\s+/g, " ")
    .trim();
}

function foldInspectionDocumentTasks(
  tasks: AILibraryProposedTask[],
  cleanupNotes: string[],
): AILibraryProposedTask[] {
  const keep = [...tasks];
  const removableIds = new Set<string>();

  for (const task of keep) {
    if (task.category !== TaskTemplateCategory.INSPECTION) continue;
    if (!INSPECTION_DOC_PATTERN.test(task.title)) continue;
    if (shouldPreserveAsStandaloneTask(task)) continue;

    const parent = keep.find(
      (candidate) =>
        candidate.tempId !== task.tempId &&
        candidate.category === TaskTemplateCategory.INSPECTION &&
        candidate.stageId === task.stageId &&
        INSPECTION_ATTEND_PATTERN.test(candidate.title),
    );

    if (!parent) continue;

    const fallbackChecklistLabel = task.title.trim();
    const checklistToMove =
      task.checklist.length > 0 ? task.checklist : [{ label: fallbackChecklistLabel }];
    parent.checklist = dedupeChecklist([...parent.checklist, ...checklistToMove]);
    applyProofFlagsFromText(parent, task.title);
    for (const item of checklistToMove) {
      applyProofFlagsFromText(parent, item.label);
    }
    removableIds.add(task.tempId);
    cleanupNotes.push(
      `Moved "${task.title}" into "${parent.title}" as checklist details.`,
    );
  }

  return keep.filter((t) => !removableIds.has(t.tempId));
}

function consolidateFinalizationCluster(
  tasks: AILibraryProposedTask[],
  cleanupNotes: string[],
): AILibraryProposedTask[] {
  const candidates = tasks.filter(
    (task) =>
      !shouldPreserveAsStandaloneTask(task) &&
      (task.category === TaskTemplateCategory.GENERAL ||
        task.category === TaskTemplateCategory.CUSTOMER_COMMUNICATION) &&
      FINALIZATION_CLUSTER_PATTERN.test(task.title),
  );

  if (candidates.length < 2) return tasks;

  const preferred =
    candidates.find((t) => /\bcloseout\b/i.test(t.stageName ?? "")) ?? candidates[0];
  let merged = { ...preferred };
  for (const candidate of candidates) {
    if (candidate.tempId === preferred.tempId) continue;
    merged = mergeTasks(merged, candidate);
  }
  merged.title = "Final Project Closeout";

  cleanupNotes.push(
    `Merged ${candidates.length} duplicate finalization tasks into "${merged.title}".`,
  );

  return [
    ...tasks.filter((t) => !candidates.some((c) => c.tempId === t.tempId)),
    merged,
  ];
}

export function normalizeExecutionProposalTasks(
  inputTasks: AILibraryProposedTask[],
): NormalizeResult {
  const cleanupNotes: string[] = [];
  let tasks = inputTasks.map((task) => ({
    ...task,
    checklist: [...task.checklist],
    resources: [...task.resources],
    providesSignals: [...task.providesSignals],
    requiresSignals: [...task.requiresSignals],
  }));

  // Keep real-world schedule/attend inspection events distinct.
  const hasSeparateInspectionScheduleAttend = tasks.some(
    (task) =>
      task.category === TaskTemplateCategory.INSPECTION &&
      INSPECTION_SCHEDULE_PATTERN.test(task.title),
  ) &&
    tasks.some(
      (task) =>
        task.category === TaskTemplateCategory.INSPECTION &&
        INSPECTION_ATTEND_PATTERN.test(task.title),
    );
  if (hasSeparateInspectionScheduleAttend) {
    cleanupNotes.push(
      "Kept inspection scheduling and attendance as separate execution tasks.",
    );
  }

  tasks = foldInspectionDocumentTasks(tasks, cleanupNotes);
  tasks = consolidateFinalizationCluster(tasks, cleanupNotes);

  const byKey = new Map<string, AILibraryProposedTask>();
  const duplicateCounts = new Map<string, number>();
  for (const task of tasks) {
    const key = taskMergeKey(task);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, task);
      continue;
    }
    if (shouldPreserveAsStandaloneTask(task) || shouldPreserveAsStandaloneTask(existing)) {
      byKey.set(`${key}::${task.tempId}`, task);
      continue;
    }
    byKey.set(key, mergeTasks(existing, task));
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 1) + 1);
  }

  for (const [key, count] of duplicateCounts) {
    const task = byKey.get(key);
    if (!task) continue;
    cleanupNotes.push(`Merged ${count} near-duplicate tasks into "${task.title}".`);
  }

  // Prefer task safety when uncertain; only soft hint for proof detail titles.
  for (const task of byKey.values()) {
    if (shouldPreserveAsStandaloneTask(task)) continue;
    if (!PROOF_DETAIL_PATTERN.test(task.title)) continue;
    if (task.checklist.length === 0) {
      task.checklist.push({ label: task.title });
      cleanupNotes.push(`Added checklist detail to "${task.title}" for proof tracking.`);
    }
    applyProofFlagsFromText(task, task.title);
    for (const checklistItem of task.checklist) {
      applyProofFlagsFromText(task, checklistItem.label);
    }
    task.assigneeRole = inferAssigneeRoleForTask(task);
  }

  for (const task of byKey.values()) {
    task.assigneeRole = inferAssigneeRoleForTask(task);
  }

  return { tasks: [...byKey.values()], cleanupNotes: dedupeStrings(cleanupNotes) };
}
