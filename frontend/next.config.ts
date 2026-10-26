import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Minimal self-contained server for Docker/containerized deploys.
  output: "standalone",
  // API calls proxy to the FastAPI backend during local dev.
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
