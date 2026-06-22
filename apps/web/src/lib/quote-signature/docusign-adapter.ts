/**
 * Milestone 4: DocuSign Verified E-Sign adapter shell.
 */
import type {
  CreateSignatureRequestInput,
  SignatureProviderAdapter,
  SignatureRequestResult,
  SignatureStatus,
} from "./provider-adapter";

export class DocuSignAdapter implements SignatureProviderAdapter {
  async createSignatureRequest(_input: CreateSignatureRequestInput): Promise<SignatureRequestResult> {
    throw new Error("Verified E-Sign (DocuSign) is not enabled yet.");
  }

  async resend(_requestId: string): Promise<void> {
    throw new Error("Verified E-Sign (DocuSign) is not enabled yet.");
  }

  async void(_requestId: string, _reason?: string): Promise<void> {
    throw new Error("Verified E-Sign (DocuSign) is not enabled yet.");
  }

  async getStatus(_requestId: string): Promise<SignatureStatus> {
    throw new Error("Verified E-Sign (DocuSign) is not enabled yet.");
  }
}
