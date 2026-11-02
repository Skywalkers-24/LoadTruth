import { describe, expect, it, vi } from "vitest";
import { getUploadLimits, validateUploadFile, compressVideoClient } from "./video-compress";

describe("video-compress limits and validation", () => {
  it("returns default upload limits when env is not set", () => {
    const limits = getUploadLimits();
    expect(limits.maxDurationSeconds).toBe(30);
    expect(limits.maxSizeBytes).toBe(50 * 1024 * 1024);
    expect(limits.compressThresholdBytes).toBe(10 * 1024 * 1024);
    expect(limits.targetCompressedBytes).toBe(5 * 1024 * 1024);
    expect(limits.enableCompression).toBe(true);
  });

  it("passes validation for file within size limits", async () => {
    const smallFile = new File(["a".repeat(1000)], "clip.mp4", { type: "video/mp4" });
    const res = await validateUploadFile(smallFile);
    expect(res.ok).toBe(true);
  });

  it("rejects file exceeding max size limit (50MB)", async () => {
    const oversized = new File([], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(oversized, "size", { value: 51 * 1024 * 1024 });
    const res = await validateUploadFile(oversized);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("exceeds the maximum limit of 50MB");
  });

  it("skips compression if file is already under target bytes (<= 5MB)", async () => {
    const smallFile = new File(["data"], "small.mp4", { type: "video/mp4" });
    const out = await compressVideoClient(smallFile, undefined, 5 * 1024 * 1024);
    expect(out).toBe(smallFile);
  });
});
