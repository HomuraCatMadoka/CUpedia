import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: { root: projectRoot },
  async headers() {
    return [
      {
        source: "/images/default-avatar.jpg",
        has: [{ type: "query", key: "v", value: "1" }],
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  webpack(config, { isServer, dev }) {
    if (!isServer && !dev && config.optimization?.splitChunks) {
      // Keep lazy-loading boundaries, but avoid many tiny initial scripts.
      // Recheck request/transfer and Wiki bundle budgets on changes/upgrades.
      config.optimization.splitChunks.minSize = 50000;
    }
    return config;
  },
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
