import { JobIssueSeverity, JobIssueType } from "@prisma/client";

export type JobIssueCreateIntent = {
  isRequested: boolean;
  prefillTitle?: string;
  prefillDescription?: string;
  prefillSeverity?: JobIssueSeverity;
  prefillType?: JobIssueType;
  prefillJobTaskId?: string;
  prefillJobStageId?: string;
  returnTaskId?: string;
};

type SearchParamValue = string | string[] | undefined;

export function parseJobIssueCreateIntent(searchParams: {
  [key: string]: SearchParamValue;
}): JobIssueCreateIntent {
  const intent = getFirst(searchParams.intent);
  if (intent !== "create-issue") {
    return { isRequested: false };
  }

  return {
    isRequested: true,
    prefillTitle: coerceOptional(getFirst(searchParams.prefillTitle), 140),
    prefillDescription: coerceOptional(getFirst(searchParams.prefillDescription), 500),
    prefillSeverity: parseSeverity(getFirst(searchParams.prefillSeverity)),
    prefillType: parseType(getFirst(searchParams.prefillType)),
    prefillJobTaskId: coerceOptional(getFirst(searchParams.prefillJobTaskId), 100),
    prefillJobStageId: coerceOptional(getFirst(searchParams.prefillJobStageId), 100),
    returnTaskId: coerceOptional(getFirst(searchParams.returnTaskId), 100),
  };
}

export function buildJobIssueIntentHref(params: {
  jobId: string;
  prefillTitle: string;
  prefillDescription?: string;
  prefillSeverity?: JobIssueSeverity;
  prefillType?: JobIssueType;
  prefillJobTaskId?: string;
  prefillJobStageId?: string;
  returnTaskId?: string;
}): string {
  const query = new URLSearchParams({
    intent: "create-issue",
    prefillTitle: params.prefillTitle.trim(),
  });

  if (params.prefillDescription?.trim()) {
    query.set("prefillDescription", params.prefillDescription.trim());
  }
  if (params.prefillSeverity) {
    query.set("prefillSeverity", params.prefillSeverity);
  }
  if (params.prefillType) {
    query.set("prefillType", params.prefillType);
  }
  if (params.prefillJobTaskId?.trim()) {
    query.set("prefillJobTaskId", params.prefillJobTaskId.trim());
  }
  if (params.prefillJobStageId?.trim()) {
    query.set("prefillJobStageId", params.prefillJobStageId.trim());
  }
  if (params.returnTaskId?.trim()) {
    query.set("returnTaskId", params.returnTaskId.trim());
  }

  return `/jobs/${params.jobId}?${query.toString()}#job-issues`;
}

function getFirst(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function coerceOptional(value: string | undefined, maxLen: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function parseSeverity(value: string | undefined): JobIssueSeverity | undefined {
  if (value === JobIssueSeverity.BLOCKS_WORK || value === JobIssueSeverity.DOES_NOT_BLOCK) {
    return value;
  }
  return undefined;
}

function parseType(value: string | undefined): JobIssueType | undefined {
  return (Object.values(JobIssueType) as string[]).includes(value ?? "")
    ? (value as JobIssueType)
    : undefined;
}
