import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT as NextConfig["output"],
};

export default nextConfig;
