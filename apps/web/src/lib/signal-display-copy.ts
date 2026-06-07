import { normalizeSignalKey } from "@/lib/signal-key";

const SIGNAL_LABELS: Record<string, string> = {
  weatheroktoproceed: "weather is okay to proceed",
  permitsubmitted: "permit application has been submitted",
  permitapproved: "permit has been approved",
  materialready: "materials are ready",
  installcompleted: "installation is complete",
  photospreinstallcomplete: "pre-install photos are complete",
  photospostinstallcomplete: "post-install photos are complete",
  inspectionfinalscheduled: "final inspection is scheduled",
  inspectionfinalpassed: "final inspection has passed",
  sitedetailsconfirmed: "site details have been confirmed",
  sitecleanupcomplete: "site cleanup is complete",
};

type GapCopy = {
  title: string;
  explanation: string;
  readableSignal: string;
};

function fallbackReadableSignal(signal: string): string {
  return signal
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toTitleCase(value: string): string {
  if (!value) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
}

function inferTaskWorkLabel(taskTitle: string): string {
  const title = taskTitle.trim();
  const lowered = title.toLowerCase();
  if (lowered.includes("roof") && /(install|replace|replacement)/.test(lowered)) {
    return "Roof installation";
  }
  if (/(install|installation)/.test(lowered)) {
    return "Installation";
  }
  if (/(permit|approval)/.test(lowered)) {
    return "Permit workflow";
  }
  if (/(inspection)/.test(lowered)) {
    return "Inspection work";
  }
  return title || "This task";
}

function inferSignalCondition(signal: string): string {
  const normalized = normalizeSignalKey(signal);
  if (normalized === "weatheroktoproceed") {
    return "weather clearance";
  }
  if (normalized === "permitapproved") {
    return "permit approval";
  }
  if (normalized === "permitsubmitted") {
    return "permit submission";
  }
  if (normalized === "materialready") {
    return "material readiness";
  }
  if (normalized === "inspectionfinalscheduled") {
    return "final inspection scheduling";
  }
  if (normalized === "inspectionfinalpassed") {
    return "final inspection approval";
  }
  return fallbackReadableSignal(signal);
}

function inferExplanationClause(signal: string, workLabel: string): string {
  const normalized = normalizeSignalKey(signal);
  const work = workLabel.toLowerCase();
  if (normalized === "weatheroktoproceed") {
    return `the weather is safe before ${work}`;
  }
  if (normalized === "permitapproved") {
    return `the permit is approved before ${work}`;
  }
  if (normalized === "permitsubmitted") {
    return `the permit application is submitted before ${work}`;
  }
  if (normalized === "materialready") {
    return `materials are ready before ${work}`;
  }
  return fallbackReadableSignal(signal);
}

export function getReadableSignalCopy(signal: string): string {
  return SIGNAL_LABELS[normalizeSignalKey(signal)] ?? fallbackReadableSignal(signal);
}

export function buildMissingProviderGapCopy(signal: string, blockedTaskTitle: string): GapCopy {
  const workLabel = inferTaskWorkLabel(blockedTaskTitle);
  const condition = inferSignalCondition(signal);
  const explanationClause = inferExplanationClause(signal, workLabel);
  return {
    title: `${toTitleCase(workLabel)} is waiting on ${condition}`,
    explanation: `No task currently confirms ${explanationClause}.`,
    readableSignal: getReadableSignalCopy(signal),
  };
}

export function buildProviderTaskTitle(signal: string, blockedTaskTitle: string): string {
  const workLabel = inferTaskWorkLabel(blockedTaskTitle).toLowerCase();
  if (normalizeSignalKey(signal) === "weatheroktoproceed") {
    return `Confirm weather clearance before ${workLabel}`;
  }
  return `Confirm ${getReadableSignalCopy(signal)} before ${workLabel}`;
}

export function signalLooksSchedulingOrAccessRelated(signal: string): boolean {
  const normalized = normalizeSignalKey(signal);
  return (
    normalized.includes("weather") ||
    normalized.includes("access") ||
    normalized.includes("schedule") ||
    normalized.includes("window") ||
    normalized.includes("dispatch")
  );
}
