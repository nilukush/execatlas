import fs from "node:fs";

/**
 * Writes JSON via temp file plus rename so a killed process can never leave a
 * truncated dataset behind; readers either see the old file or the new one.
 */
export function writeJsonAtomic(file: string, payload: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, file);
}
