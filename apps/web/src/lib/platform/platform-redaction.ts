import type { PlatformAiFailureDto, PlatformNotificationFailureDto } from "./platform-types";

type AiLogRow = {
  id: string;
  feature: string;
  provider: string;
  model: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  errorMessage: string | null;
  createdAt: Date;
};

export function toRedactedAiFailure(row: AiLogRow): PlatformAiFailureDto {
  return {
    id: row.id,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    status: row.status,
    errorMessage: row.errorMessage ? truncate(row.errorMessage, 500) : null,
    createdAt: row.createdAt,
  };
}

export function toRedactedNotificationFailure(row: NotificationRow): PlatformNotificationFailureDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    errorMessage: row.errorMessage ? truncate(row.errorMessage, 500) : null,
    createdAt: row.createdAt,
  };
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
