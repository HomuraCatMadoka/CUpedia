import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.cuhk.edu.hk",
      },
    ],
  },
  typescript: {
    ...(process.env.E2E_TEST === "1"
      ? { tsconfigPath: "tsconfig.e2e.json" }
      : {}),
    ignoreBuildErrors: process.env.NEXT_BUILD_SKIP_TYPECHECK === "1",
  },
};

export default nextConfig;
