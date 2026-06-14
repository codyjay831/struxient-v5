import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirnameCJS: string | undefined = typeof __dirname !== "undefined" ? __dirname : undefined;
let __dirnameESM: string | undefined;
try {
  __dirnameESM = path.dirname(fileURLToPath(import.meta.url));
} catch {
  __dirnameESM = undefined;
}
const resolvedRoot = __dirnameCJS ?? __dirnameESM ?? path.resolve(process.cwd());

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: resolvedRoot,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/leads/inbox",
        destination: "/workstation",
        permanent: true,
      },
      {
        source: "/quotes",
        destination: "/leads",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
