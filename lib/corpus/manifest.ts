import { readFileSync } from "node:fs";
import path from "node:path";
import type { CorpusManifest } from "./types";

export function readCorpusManifest(projectRoot = process.cwd()): CorpusManifest {
  return JSON.parse(readFileSync(path.join(projectRoot, "data", "seed", "manifest.json"), "utf8")) as CorpusManifest;
}
