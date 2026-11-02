import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthToken, submitIngestJob } from "./api";

let status = 200;
let sentHeaders: Record<string, string>;
let sequence: string[];
class UploadXHR {
  upload: { onprogress?: unknown } = {};
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  status = status;
  open(method: string, url: string) {
    expect(method).toBe("PUT");
    expect(url).toBe("https://private-b2.test/signed-upload");
    sentHeaders = {};
  }
  setRequestHeader(key: string, value: string) {
    sentHeaders[key] = value;
  }
  send(file: File) {
    expect(file.size).toBe(4);
    sequence.push("bucket-put");
    queueMicrotask(() => this.onload?.());
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  setAuthToken(null);
  status = 200;
});
function setup() {
  sequence = [];
  setAuthToken("application-token");
  vi.stubGlobal("XMLHttpRequest", UploadXHR);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer application-token",
      );
      if (url.endsWith("/events/event-1/ingest-uploads")) {
        sequence.push("sign");
        expect(JSON.parse(init.body as string).size_bytes).toBe(4);
        return new Response(
          JSON.stringify({
            video: { id: "clip-1" },
            upload_url: "https://private-b2.test/signed-upload",
            headers: { "Content-Type": "video/mp4" },
          }),
        );
      }
      if (url.endsWith("/events/event-1/ingest-uploads/clip-1/complete")) {
        sequence.push("verify");
        return new Response(JSON.stringify({ id: "clip-1", status: "ready" }));
      }
      sequence.push("analyze");
      return new Response(JSON.stringify({ id: "job-1", status: "accepted" }));
    }),
  );
}
describe("direct B2 upload", () => {
  it("verifies the saved object before queuing analysis and never sends the app token to B2", async () => {
    setup();
    const job = await submitIngestJob(
      "event-1",
      new File(["test"], "truck.mp4", { type: "video/mp4" }),
    );
    expect(job.id).toBe("job-1");
    expect(sequence).toEqual(["sign", "bucket-put", "verify", "analyze"]);
    expect(sentHeaders).toEqual({ "Content-Type": "video/mp4" });
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).not.toContain("bypass_cache");
  });
  it("forwards the fresh-analysis choice after verifying the uploaded file", async () => {
    setup();
    await submitIngestJob("event-1", new File(["test"], "truck.mp4", { type: "video/mp4" }), {
      bypassCache: true,
    });
    expect(sequence).toEqual(["sign", "bucket-put", "verify", "analyze"]);
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(
      "/events/event-1/demo-videos/clip-1/analyze?bypass_cache=true",
    );
  });
  it("falls back to temporary direct ingest when the bucket rejects the upload (e.g. limit hit)", async () => {
    status = 503;
    setup();
    const res = await submitIngestJob(
      "event-1",
      new File(["test"], "truck.mp4", { type: "video/mp4" }),
    );
    expect(res).toEqual({ id: "job-1", status: "accepted" });
    expect(sequence).toEqual(["sign", "bucket-put", "analyze"]);
  });
});

it("sends temporary footage directly to the authenticated API without bucket uploads", async () => {
  setAuthToken("application-token");
  const bucket = vi.fn();
  vi.stubGlobal("XMLHttpRequest", bucket);
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer application-token");
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
    return new Response(JSON.stringify({ id: "temporary-job", status: "accepted" }));
  });
  vi.stubGlobal("fetch", fetcher);
  await submitIngestJob("event-1", new File(["clip"], "truck.mp4"), {
    keepFootage: false,
    bypassCache: true,
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(
    "/events/event-1/temporary-ingest?bypass_cache=true",
  );
  expect(bucket).not.toHaveBeenCalled();
});
