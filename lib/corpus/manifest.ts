import { readFileSync } from "node:fs";
import path from "node:path";
import type { CorpusManifest } from "./types";

export function readCorpusManifest(): CorpusManifest {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "seed", "manifest.json"), "utf8")) as CorpusManifest;
}
