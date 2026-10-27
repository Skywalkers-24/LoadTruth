import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Minimal self-contained server for Docker/containerized deploys.
  output: "standalone",
  experimental: {
    // The /api proxy buffers request bodies and cuts them at 10 MB by default,
    // which truncated clip uploads (the backend then saw a dropped socket).
    // Match the upload limit the New Ticket screen advertises.
    proxyClientMaxBodySize: "500mb",
    // A live run (upload, SAM on two concepts, Spark OCR and classify) can take
    // well over the default proxy timeout; allow up to 10 minutes.
    proxyTimeout: 600_000,
  },
  // API calls proxy to the FastAPI backend.
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
