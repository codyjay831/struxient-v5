export const FIELD_EVENT_SIGNAL_PREFIX = "event:";
export const FIELD_EVENT_TASK_PREFIX = "EVENT:";

export function isFieldEventTaskTitle(title: string): boolean {
  return title.trim().toUpperCase().startsWith(FIELD_EVENT_TASK_PREFIX);
}

export function isFieldEventSignal(signal: string): boolean {
  return signal.startsWith(FIELD_EVENT_SIGNAL_PREFIX);
}

export function getSignalBlockedWaitingCopy(missingSignals: string[]): string {
  if (missingSignals.some(isFieldEventSignal)) {
    return "Complete field hold to unblock this task";
  }
  return "Waiting for required prior work";
}

export function getFieldEventSignal(providesSignals: string[]): string | undefined {
  return providesSignals.find(isFieldEventSignal);
}

export function isRemovableFieldEventTask(
  title: string,
  providesSignals: string[],
): boolean {
  return isFieldEventTaskTitle(title) && !!getFieldEventSignal(providesSignals);
}

export function removeEventSignalFromRequires(
  requiresSignals: string[],
  eventSignal: string,
): string[] {
  return requiresSignals.filter((s) => s !== eventSignal);
}

export function shouldShowCancelFieldHold(params: {
  isFieldHoldTask: boolean;
  isCompleted: boolean;
}): boolean {
  return params.isFieldHoldTask && !params.isCompleted;
}

export const FIELD_HOLD_LIFECYCLE_COPY =
  "This field hold is blocking selected downstream tasks. Complete it when the hold condition is satisfied, or cancel it if the hold is no longer needed.";

export const FIELD_HOLD_BLOCKED_BY_ISSUE_COPY =
  "This field hold cannot be completed until the blocking issue is resolved.";

export const CANCEL_FIELD_HOLD_CONFIRM_TITLE = "Cancel field hold?";

export const CANCEL_FIELD_HOLD_CONFIRM_BODY =
  "This will remove the hold and unblock tasks that were waiting on it. Use this only if the hold was created by mistake or is no longer needed.";
