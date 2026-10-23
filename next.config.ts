import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo sits inside the Convex prototype's folder, which has its own
  // package-lock.json. Without this, Next.js treats that parent as the project
  // root and traces files from the wrong place when bundling for deployment.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
};

export default nextConfig;
