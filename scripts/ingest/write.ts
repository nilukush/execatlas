import path from "node:path";
import fs from "node:fs";

/**
 * Writes JSON via temp file plus rename so a killed process can never leave a
 * truncated dataset behind; readers either see the old file or the new one.
 * The resolved target must stay inside the project's data directory: the
 * file name reaches this sink through configuration, so the guard lives here.
 */
export function writeJsonAtomic(file: string, payload: unknown): void {
  const resolved = path.resolve(file);
  const allowedRoot = path.resolve(process.cwd(), "data");
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(`writeJsonAtomic refuses a path outside data/: ${resolved}`);
  }
  const tmp = `${resolved}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, resolved);
}
