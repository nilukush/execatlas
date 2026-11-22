import fs from "node:fs";
import path from "node:path";
import { datasetSignature } from "../src/lib/dataset";

/**
 * Publishes the job index as a content-addressed static asset so the jobs
 * listing can fetch it at runtime instead of baking the whole dataset into
 * every locale's HTML (issue 10). The filename carries the dataset
 * signature, so cache-first fetching an old URL can never serve stale data.
 */
const GENERATED = path.join(process.cwd(), "data", "generated");
const OUT_DIRS = [path.join(process.cwd(), "out", "data"), path.join(process.cwd(), "public", "data")];

function main() {
  const stats = JSON.parse(fs.readFileSync(path.join(GENERATED, "stats.json"), "utf8"));
  const signature = datasetSignature(stats.generatedAt);
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    for (const stale of fs.readdirSync(dir)) {
      if (stale.startsWith("index-")) fs.rmSync(path.join(dir, stale));
    }
    fs.copyFileSync(path.join(GENERATED, "index.json"), path.join(dir, `index-${signature}.json`));
  }
  console.log(`[publish-dataset] index-${signature}.json (out/data and public/data)`);
}

main();
