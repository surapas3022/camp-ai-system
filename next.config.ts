import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers", "better-sqlite3", "sqlite-vec"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/seed/manifest.json", "./data/seed/source-files/**/*", "./data/evaluation/**/*"],
  },
};

export default nextConfig;
