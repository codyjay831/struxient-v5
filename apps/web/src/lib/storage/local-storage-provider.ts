import { StorageProvider } from "./storage-provider";
import { Readable } from "stream";
import { join } from "path";
import { access, mkdir, writeFile, unlink } from "fs/promises";
import { createReadStream } from "fs";

export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = join(process.cwd(), "public", "uploads");
  }

  createObjectKey(params: {
    organizationId: string;
    jobId?: string;
    taskId?: string;
    attachmentId: string;
    fileName: string;
  }): string {
    // For local dev, we keep it simple but include the attachmentId for uniqueness
    const safeName = params.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    return `${params.attachmentId}-${safeName}`;
  }

  async createSignedUploadUrl(params: {
    fileKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    // Local dev doesn't support real signed URLs for PUT.
    // We return a special local marker that the client can use to decide
    // whether to use the legacy direct upload action or a simulated PUT.
    // For simplicity in V1, we'll keep the direct action for local.
    return `local://${params.fileKey}`;
  }

  async confirmObjectExists(fileKey: string): Promise<boolean> {
    const filePath = join(this.uploadDir, fileKey);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readObject(fileKey: string): Promise<Readable> {
    const filePath = join(this.uploadDir, fileKey);
    return createReadStream(filePath) as unknown as Readable;
  }

  async deleteObject(fileKey: string): Promise<void> {
    const filePath = join(this.uploadDir, fileKey);
    try {
      await unlink(filePath);
    } catch (e) {
      console.error("Failed to delete local file:", filePath, e);
    }
  }

  async writeObject(fileKey: string, buffer: Buffer, _contentType?: string): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
    const filePath = join(this.uploadDir, fileKey);
    await writeFile(filePath, buffer);
  }
}
