import { StorageProvider } from "./storage-provider";
import { LocalStorageProvider } from "./local-storage-provider";
import { GcsStorageProvider } from "./gcs-storage-provider";

let storageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageProvider) return storageProvider;

  const type = process.env.STORAGE_PROVIDER || "local";

  if (type === "gcs") {
    storageProvider = new GcsStorageProvider();
  } else {
    // Default to local for dev
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local storage provider is not allowed in production. Set STORAGE_PROVIDER=gcs.");
    }
    storageProvider = new LocalStorageProvider();
  }

  return storageProvider;
}

export * from "./storage-provider";
export * from "./local-storage-provider";
export * from "./gcs-storage-provider";
