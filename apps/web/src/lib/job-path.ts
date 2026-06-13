export function jobDetailPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function jobChangeOrdersPath(jobId: string): string {
  return `/jobs/${jobId}/change-orders`;
}
