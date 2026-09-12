import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function sanitizeReportValue(value, workspace = ROOT) {
  if (typeof value === "string") {
    const workspacePattern = escapeRegex(path.resolve(workspace)).replace(/\\\\|\//g, "[\\\\/]");
    return value
      .replace(new RegExp(workspacePattern + "(?=[\\\\/]|$)", "gi"), "<workspace>")
      .replace(/\b[A-Z]:[\\/]Users[\\/][^\\/\r\n]+/gi, "<home>")
      .replace(/\/(?:Users|home)\/[^/\r\n]+/g, "<home>")
      .replace(/\b[A-Z]:[\\/]Program Files(?: \(x86\))?[\\/]/gi, "<program-files>/");
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeReportValue(entry, workspace));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeReportValue(entry, workspace)]));
  return value;
}

export async function sanitizeReportFile(filename, workspace = ROOT) {
  workspace = await realpath(workspace);
  const target = await realpath(path.resolve(workspace, filename));
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !target.endsWith(".json")) throw new Error("Report must be a JSON file beneath the workspace.");
  const input = JSON.parse(await readFile(target, "utf8"));
  const output = sanitizeReportValue(input, workspace);
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
  return { file: relative.split(path.sep).join("/"), sanitized: JSON.stringify(input) !== JSON.stringify(output) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 3) throw new Error("Usage: node scripts/sanitize-report.mjs <report.json> [...reports]");
  for (const filename of process.argv.slice(2)) console.log(JSON.stringify(await sanitizeReportFile(filename)));
}
