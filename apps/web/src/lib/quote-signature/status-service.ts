import {
  QuoteSignatureRequestStatus,
  QuoteSignatureRecipientStatus,
} from "@prisma/client";

export const ACTIVE_SIGNATURE_REQUEST_STATUSES: QuoteSignatureRequestStatus[] = [
  QuoteSignatureRequestStatus.DRAFT,
  QuoteSignatureRequestStatus.READY_TO_SEND,
  QuoteSignatureRequestStatus.SENT,
  QuoteSignatureRequestStatus.PARTIALLY_VIEWED,
  QuoteSignatureRequestStatus.VIEWED,
  QuoteSignatureRequestStatus.DELIVERY_FAILED,
];

export function isActiveSignatureRequestStatus(status: QuoteSignatureRequestStatus): boolean {
  return ACTIVE_SIGNATURE_REQUEST_STATUSES.includes(status);
}

export function deriveRequestStatusLabel(status: QuoteSignatureRequestStatus): string {
  switch (status) {
    case QuoteSignatureRequestStatus.DRAFT:
      return "Draft";
    case QuoteSignatureRequestStatus.READY_TO_SEND:
      return "Ready to send";
    case QuoteSignatureRequestStatus.SENT:
      return "Sent";
    case QuoteSignatureRequestStatus.PARTIALLY_VIEWED:
      return "Partially viewed";
    case QuoteSignatureRequestStatus.VIEWED:
      return "Viewed";
    case QuoteSignatureRequestStatus.ACCEPTED:
      return "Accepted";
    case QuoteSignatureRequestStatus.DECLINED:
      return "Declined";
    case QuoteSignatureRequestStatus.EXPIRED:
      return "Expired";
    case QuoteSignatureRequestStatus.REVOKED:
      return "Revoked";
    case QuoteSignatureRequestStatus.DELIVERY_FAILED:
      return "Delivery failed";
    case QuoteSignatureRequestStatus.FAILED:
      return "Failed";
    default:
      return status;
  }
}

export function deriveRecipientStatusLabel(status: QuoteSignatureRecipientStatus): string {
  switch (status) {
    case QuoteSignatureRecipientStatus.PENDING:
      return "Pending";
    case QuoteSignatureRecipientStatus.SENT:
      return "Sent";
    case QuoteSignatureRecipientStatus.DELIVERED:
      return "Delivered";
    case QuoteSignatureRecipientStatus.VIEWED:
      return "Viewed";
    case QuoteSignatureRecipientStatus.ACCEPTED:
      return "Accepted";
    case QuoteSignatureRecipientStatus.DECLINED:
      return "Declined";
    case QuoteSignatureRecipientStatus.EXPIRED:
      return "Expired";
    case QuoteSignatureRecipientStatus.REVOKED:
      return "Revoked";
    case QuoteSignatureRecipientStatus.FAILED:
      return "Failed";
    default:
      return status;
  }
}
