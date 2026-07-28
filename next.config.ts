import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
  turbopack: { root: process.cwd() },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_BUILD_SKIP_TYPECHECK === "1",
  },
};

export default nextConfig;
