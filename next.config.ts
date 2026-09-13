import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers", "better-sqlite3", "sqlite-vec"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/seed/manifest.json", "./data/seed/source-files/**/*", "./data/evaluation/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/**/*": [
      "./node_modules/@huggingface/**/*",
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/sqlite-vec/**/*",
      "./data/runtime/**/*",
      "./data/model-cache/**/*",
    ],
  },
};

export default nextConfig;
