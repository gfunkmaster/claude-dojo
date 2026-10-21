import path from "node:path";
import type { NextConfig } from "next";

// The UI reads the repo's own src/ and data, one folder up.
const repoRoot = path.resolve(process.cwd(), "..");

const config: NextConfig = {
  env: { DOJO_REPO_ROOT: repoRoot },
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  devIndicators: false,
};

export default config;
