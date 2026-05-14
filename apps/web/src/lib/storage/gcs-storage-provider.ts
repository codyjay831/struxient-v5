import { StorageProvider } from "./storage-provider";
import { Readable } from "stream";
import { Storage, GetSignedUrlConfig } from "@google-cloud/storage";

export class GcsStorageProvider implements StorageProvider {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME || "";
    if (!this.bucketName && process.env.NODE_ENV === "production") {
      throw new Error("GCS_BUCKET_NAME is required in production");
    }
    
    // In local dev, we might not have credentials, so we only initialize if bucket is set
    // or if we're in production.
    this.storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
    });
  }

  createObjectKey(params: {
    organizationId: string;
    jobId?: string;
    taskId?: string;
    attachmentId: string;
    fileName: string;
  }): string {
    const safeName = params.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    if (params.jobId && params.taskId) {
      return `orgs/${params.organizationId}/jobs/${params.jobId}/tasks/${params.taskId}/attachments/${params.attachmentId}/${safeName}`;
    }
    return `orgs/${params.organizationId}/leads/attachments/${params.attachmentId}/${safeName}`;
  }

  async createSignedUploadUrl(params: {
    fileKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(params.fileKey);

    const options: GetSignedUrlConfig = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + params.expiresInSeconds * 1000,
      contentType: params.contentType,
    };

    const [url] = await file.getSignedUrl(options);
    return url;
  }

  async confirmObjectExists(fileKey: string): Promise<boolean> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileKey);
    const [exists] = await file.exists();
    return exists;
  }

  async readObject(fileKey: string): Promise<Readable> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileKey);
    return file.createReadStream();
  }

  async deleteObject(fileKey: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fileKey);
    try {
      await file.delete();
    } catch (e) {
      console.error("Failed to delete GCS object:", fileKey, e);
    }
  }
}
