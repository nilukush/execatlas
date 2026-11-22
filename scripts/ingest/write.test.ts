import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeJsonAtomic } from "./write";


describe("writeJsonAtomic", () => {
  it("writes the full payload and leaves no temp file behind", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "data", "execatlas-write-"));
    const file = path.join(dir, "jobs.json");
    writeJsonAtomic(file, { generatedAt: "now", jobs: [{ id: "j1" }] });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ generatedAt: "now", jobs: [{ id: "j1" }] });
    expect(fs.readdirSync(dir)).toEqual(["jobs.json"]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("writeJsonAtomic guard", () => {
  it("refuses paths outside the data directory", () => {
    expect(() => writeJsonAtomic("/tmp/evil.json", {})).toThrow(/outside data/);
  });
});
