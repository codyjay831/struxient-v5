export type CreateSignatureRequestInput = {
  quoteId: string;
  organizationId: string;
  requestedByUserId?: string;
  recipients: { email: string; name?: string; phone?: string }[];
  customMessage?: string;
  expiresInDays?: number | null;
  resendExisting?: boolean;
};

export type SignatureRequestResult = {
  signatureRequestId: string;
  recipientTokens: { recipientId: string; email: string; rawToken: string }[];
};

export type SignatureStatus = {
  requestId: string;
  status: string;
};

export interface SignatureProviderAdapter {
  createSignatureRequest(input: CreateSignatureRequestInput): Promise<SignatureRequestResult>;
  resend(requestId: string): Promise<void>;
  void(requestId: string, reason?: string): Promise<void>;
  getStatus(requestId: string): Promise<SignatureStatus>;
}
