import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
