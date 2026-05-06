import { headers } from "next/headers";

/**
 * Best-effort absolute site origin for staff-facing copy helpers (Public Request Link).
 * Prefer `NEXT_PUBLIC_APP_URL` when set (canonical in production).
 */
export async function resolvePublicSiteBaseUrl(): Promise<string> {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
  if (envBase) {
    return envBase;
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) {
    return "";
  }
  const rawProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    rawProto === "http" || rawProto === "https" ? rawProto : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
