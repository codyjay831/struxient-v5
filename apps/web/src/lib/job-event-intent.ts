export type FieldEventIntent = "hold-work" | "report-issue";

export function shouldCreateFieldEventTask(intent: FieldEventIntent): boolean {
  return intent === "hold-work";
}

export function buildIssueCreateHref(params: {
  jobId: string;
  prefillTitle: string;
  prefillDescription?: string;
}): string {
  const query = new URLSearchParams({
    intent: "create-issue",
    prefillTitle: params.prefillTitle.trim(),
    prefillSeverity: "BLOCKS_WORK",
  });
  if (params.prefillDescription?.trim()) {
    query.set("prefillDescription", params.prefillDescription.trim());
  }
  return `/jobs/${params.jobId}?${query.toString()}#job-issues`;
}
