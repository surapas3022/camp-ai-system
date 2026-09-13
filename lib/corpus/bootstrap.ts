import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export interface RuntimePaths {
  projectRoot: string;
  runtimeDir: string;
  databasePath: string;
  sourceDir: string;
}

export function runtimePaths(options: { projectRoot?: string; runtimeDir?: string } = {}): RuntimePaths {
  const projectRoot = path.resolve(/* turbopackIgnore: true */ options.projectRoot ?? process.cwd());
  const runtimeDir = path.resolve(/* turbopackIgnore: true */ options.runtimeDir ?? (process.env.SECURE_RAG_RUNTIME_DIR?.trim() || path.join(projectRoot, "data", "runtime")));
  return {
    projectRoot,
    runtimeDir,
    databasePath: path.join(runtimeDir, "knowledge.sqlite"),
    sourceDir: path.join(runtimeDir, "source-files"),
  };
}

/** Copies immutable starter assets once; a learner database is never overwritten. */
export function bootstrapSeed(options: { projectRoot?: string; runtimeDir?: string } = {}): RuntimePaths {
  const paths = runtimePaths(options);
  if (existsSync(/* turbopackIgnore: true */ paths.databasePath)) return paths;

  const seedDir = path.join(paths.projectRoot, "data", "seed");
  const seedDatabase = path.join(seedDir, "secure-rag.sqlite");
  const seedSources = path.join(seedDir, "source-files");
  if (!existsSync(seedDatabase) || !existsSync(seedSources)) throw new Error("Seed corpus assets are missing.");

  mkdirSync(paths.runtimeDir, { recursive: true });
  // A database is the completion marker. Copy sources before atomically publishing it.
  if (!existsSync(/* turbopackIgnore: true */ paths.sourceDir)) cpSync(seedSources, paths.sourceDir, { recursive: true });
  const temporaryDatabase = `${paths.databasePath}.${process.pid}.bootstrap`;
  rmSync(temporaryDatabase, { force: true });
  copyFileSync(seedDatabase, temporaryDatabase);
  try {
    renameSync(temporaryDatabase, paths.databasePath);
  } catch (error) {
    rmSync(temporaryDatabase, { force: true });
    if (!existsSync(/* turbopackIgnore: true */ paths.databasePath)) throw error;
  }
  return paths;
}
