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
      if (url.endsWith("/demo-videos/uploads")) {
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
      if (url.endsWith("/clip-1/complete")) {
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
  });
  it("does not confirm or start analysis when the bucket rejects the upload", async () => {
    status = 503;
    setup();
    await expect(
      submitIngestJob("event-1", new File(["test"], "truck.mp4", { type: "video/mp4" })),
    ).rejects.toThrow("B2 upload failed");
    expect(sequence).toEqual(["sign", "bucket-put"]);
  });
});
