/**
 * Walk a directory for .ts / .tsx files (skip node_modules, .next).
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} rootDir
 * @param {(absPath: string, content: string) => void} visitor
 */
export function walkSourceFiles(rootDir, visitor) {
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "dist") continue;
        walk(abs);
        continue;
      }
      if (!/\.(tsx?)$/.test(ent.name)) continue;
      const content = fs.readFileSync(abs, "utf8");
      visitor(abs, content);
    }
  }
  walk(rootDir);
}
