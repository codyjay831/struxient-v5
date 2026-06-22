import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import {
  parseQuoteSendCheckpointSnapshot,
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  serializeCustomerPreviewDocumentForCheckpoint,
  type QuoteCheckpointSnapshotWire,
} from "@/lib/quote-checkpoint-snapshot";
import { sha256Json } from "./hash";

export function buildFrozenSnapshotWire(
  document: QuoteCustomerPreviewDocument,
): QuoteCheckpointSnapshotWire {
  return serializeCustomerPreviewDocumentForCheckpoint(document);
}

export function computeFrozenSnapshotSha256(wire: QuoteCheckpointSnapshotWire): string {
  return sha256Json(wire);
}

export function parseFrozenSnapshotJson(
  snapshotJson: unknown,
):
  | { ok: true; document: QuoteCustomerPreviewDocument }
  | { ok: false; error: string } {
  if (
    typeof snapshotJson === "object" &&
    snapshotJson !== null &&
    "document" in (snapshotJson as object)
  ) {
    return parseQuoteSendCheckpointSnapshot(
      QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson,
    );
  }
  return parseQuoteSendCheckpointSnapshot(
    QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
    { document: snapshotJson },
  );
}
