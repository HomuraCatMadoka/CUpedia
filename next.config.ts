import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
  turbopack: { root: process.cwd() },
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_BUILD_SKIP_TYPECHECK === "1",
  },
};

export default nextConfig;
