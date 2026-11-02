import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const META_API_ORIGIN = "https://api.meta.ai";

/**
 * Cloudflare Worker Edge Proxy for Meta Model API (api.meta.ai).
 * Proxies responses, files, and streaming SSE endpoints.
 *
 * ZERO-EGRESS ACCELERATION:
 * When X-Media-Source-Url is supplied on /files, the Worker downloads the media
 * directly from Backblaze B2 (Bandwidth Alliance = 0 egress cost) and streams it
 * to Meta's File API, keeping Render's outbound egress at 0 MB.
 */
async function handleProxy(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const pathStr = path.join("/");
  const targetUrl = new URL(`/v1/${pathStr}`, META_API_ORIGIN);

  // Preserve query parameters
  req.nextUrl.searchParams.forEach((val, key) => {
    targetUrl.searchParams.set(key, val);
  });

  // Prepare outgoing headers
  const outgoingHeaders = new Headers();
  req.headers.forEach((val, key) => {
    const lowerKey = key.toLowerCase();
    if (
      !["host", "connection", "keep-alive", "transfer-encoding", "content-length"].includes(
        lowerKey,
      )
    ) {
      outgoingHeaders.set(key, val);
    }
  });

  // Direct B2 -> Meta file ingestion (Zero Render Egress)
  const mediaSourceUrl = req.headers.get("x-media-source-url");
  if (pathStr === "files" && req.method === "POST" && mediaSourceUrl) {
    try {
      // 1. Fetch from B2 (zero egress on Cloudflare via Bandwidth Alliance)
      const mediaRes = await fetch(mediaSourceUrl);
      if (!mediaRes.ok) {
        return new Response(
          JSON.stringify({
            error: {
              code: "b2_fetch_failed",
              detail: `Failed to fetch media from B2: ${mediaRes.statusText}`,
            },
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      const mediaBlob = await mediaRes.blob();
      const filename = req.headers.get("x-media-filename") || "evidence.mp4";

      // 2. Build multipart form for Meta Files API
      const formData = new FormData();
      formData.append("purpose", "user_data");
      formData.append("file", mediaBlob, filename);

      const ttl = req.headers.get("x-media-ttl-s");
      if (ttl) {
        formData.append("expires_after[anchor]", "created_at");
        formData.append("expires_after[seconds]", ttl);
      }

      // Remove content-type so fetch sets the multipart boundary automatically
      outgoingHeaders.delete("content-type");

      // 3. Stream directly to Meta
      const metaRes = await fetch(targetUrl.toString(), {
        method: "POST",
        headers: outgoingHeaders,
        body: formData,
      });

      const responseHeaders = new Headers();
      metaRes.headers.forEach((val, key) => {
        if (!["connection", "transfer-encoding"].includes(key.toLowerCase())) {
          responseHeaders.set(key, val);
        }
      });

      return new Response(metaRes.body, {
        status: metaRes.status,
        statusText: metaRes.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error ingesting from B2 to Meta";
      return new Response(
        JSON.stringify({ error: { code: "edge_b2_ingest_error", detail: msg } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Standard proxy pass-through for /responses, /files (binary), etc.
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? req.body : undefined;

  try {
    const metaRes = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: outgoingHeaders,
      body,
      // @ts-expect-error duplex is required for streaming request bodies in modern fetch
      duplex: "half",
    });

    const responseHeaders = new Headers();
    metaRes.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!["connection", "transfer-encoding"].includes(lowerKey)) {
        responseHeaders.set(key, val);
      }
    });

    return new Response(metaRes.body, {
      status: metaRes.status,
      statusText: metaRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy error";
    return new Response(JSON.stringify({ error: { code: "edge_proxy_error", detail: message } }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const DELETE = handleProxy;
export const PUT = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
