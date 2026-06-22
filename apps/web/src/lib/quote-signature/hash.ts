import { createHash } from "crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}
