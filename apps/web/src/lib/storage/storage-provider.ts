import { Readable } from "stream";

export interface StorageProvider {
  /**
   * Generates a unique object key for storage.
   */
  createObjectKey(params: {
    organizationId: string;
    jobId: string;
    taskId: string;
    attachmentId: string;
    fileName: string;
  }): string;

  /**
   * Creates a signed URL for direct browser upload (PUT).
   */
  createSignedUploadUrl(params: {
    fileKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;

  /**
   * Verifies that an object exists in storage.
   */
  confirmObjectExists(fileKey: string): Promise<boolean>;

  /**
   * Reads an object from storage as a stream.
   */
  readObject(fileKey: string): Promise<Readable>;

  /**
   * Deletes an object from storage.
   */
  deleteObject(fileKey: string): Promise<void>;
}
