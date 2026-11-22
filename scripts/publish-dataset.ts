import fs from "node:fs";
import path from "node:path";

/**
 * Publishes the job index as a content-addressed static asset so the jobs
 * listing can fetch it at runtime instead of baking the whole dataset into
 * every locale's HTML (issue 10). The filename carries the dataset
 * signature, so cache-first fetching an old URL can never serve stale data.
 */
const GENERATED = path.join(process.cwd(), "data", "generated");
const OUT_DIR = path.join(process.cwd(), "out", "data");

function main() {
  const stats = JSON.parse(fs.readFileSync(path.join(GENERATED, "stats.json"), "utf8"));
  const digits = stats.generatedAt.replace(/[^0-9]/g, "");
  const signature = `${digits.slice(0, 8)}T${digits.slice(8, 14)}`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const stale of fs.readdirSync(OUT_DIR)) {
    if (stale.startsWith("index-")) fs.rmSync(path.join(OUT_DIR, stale));
  }
  fs.copyFileSync(
    path.join(GENERATED, "index.json"),
    path.join(OUT_DIR, `index-${signature}.json`)
  );
  console.log(`[publish-dataset] out/data/index-${signature}.json`);
}

main();
