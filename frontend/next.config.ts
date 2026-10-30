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
    const backend =
      process.env.BACKEND_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://loadtruth-api.onrender.com"
        : "http://localhost:8000");
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
  // The login background clips and posters are content-stable: serve them with a
  // long immutable cache so Cloudflare's edge holds them and repeat visits skip
  // the origin entirely. The filenames are versioned by content (new encode =
  // new deploy), so immutable is safe here.
  async headers() {
    const immutable = {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    };
    return [
      { source: "/videos/benchmark-:slug(.*).mp4", headers: [immutable] },
      { source: "/login-:slug(.*).mp4", headers: [immutable] },
      { source: "/login-:slug(.*).jpg", headers: [immutable] },
    ];
  },
};

export default nextConfig;
