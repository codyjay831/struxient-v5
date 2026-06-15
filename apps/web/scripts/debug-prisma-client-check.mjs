import fs from "fs";
import path from "path";

const clientPath = path.join("node_modules", ".prisma", "client", "index.d.ts");
const exists = fs.existsSync(clientPath);
const hasLeadChannel =
  exists && fs.readFileSync(clientPath, "utf8").includes("LeadChannel");

// #region agent log
fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "8585c4",
  },
  body: JSON.stringify({
    sessionId: "8585c4",
    location: "scripts/debug-prisma-client-check.mjs",
    message: "Prisma client LeadChannel presence check",
    data: { clientPath, exists, hasLeadChannel, phase: process.env.DEBUG_PHASE ?? "unknown" },
    timestamp: Date.now(),
    hypothesisId: "A",
    runId: process.env.DEBUG_RUN_ID ?? "verify",
  }),
}).catch(() => {});
// #endregion

if (!hasLeadChannel) {
  console.error(
    "[debug] LeadChannel missing from generated Prisma client — prisma generate likely did not run.",
  );
  process.exit(1);
}
