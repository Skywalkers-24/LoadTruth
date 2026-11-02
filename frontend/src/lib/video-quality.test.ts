import { describe, expect, it } from "vitest";
import {
  detectNetworkQuality,
  getQualityBadge,
  getQualityLabel,
  getVideoVariantUrl,
  resolveQualityTier,
} from "./video-quality";

describe("video quality url variant resolution", () => {
  it("resolves relative benchmark urls to variants", () => {
    const url = "/videos/benchmark-001-ced45539ee71.mp4";
    expect(getVideoVariantUrl(url, "low")).toBe("/videos/benchmark-001-ced45539ee71-low.mp4");
    expect(getVideoVariantUrl(url, "medium")).toBe("/videos/benchmark-001-ced45539ee71-med.mp4");
    expect(getVideoVariantUrl(url, "high")).toBe("/videos/benchmark-001-ced45539ee71.mp4");
  });

  it("resolves cloudflare worker urls to variants", () => {
    const cf = "https://loadtruth.tiwabhay800.workers.dev/videos/benchmark-025-65b8152a3771.mp4";
    expect(getVideoVariantUrl(cf, "low")).toBe(
      "https://loadtruth.tiwabhay800.workers.dev/videos/benchmark-025-65b8152a3771-low.mp4",
    );
    expect(getVideoVariantUrl(cf, "medium")).toBe(
      "https://loadtruth.tiwabhay800.workers.dev/videos/benchmark-025-65b8152a3771-med.mp4",
    );
    expect(getVideoVariantUrl(cf, "high")).toBe(cf);
  });

  it("handles urls that already contain a variant suffix cleanly", () => {
    const low = "/videos/benchmark-002-85db2e8f1e08-low.mp4";
    expect(getVideoVariantUrl(low, "medium")).toBe("/videos/benchmark-002-85db2e8f1e08-med.mp4");
    expect(getVideoVariantUrl(low, "high")).toBe("/videos/benchmark-002-85db2e8f1e08.mp4");
  });

  it("passes non-mp4 and empty urls through unchanged", () => {
    expect(getVideoVariantUrl(null, "low")).toBeNull();
    expect(getVideoVariantUrl(undefined, "high")).toBeNull();
    expect(getVideoVariantUrl("/evidence/photo.jpg", "low")).toBe("/evidence/photo.jpg");
  });
});

describe("quality badges and labels", () => {
  it("formats labels and short badges", () => {
    expect(getQualityLabel("auto")).toBe("Auto");
    expect(getQualityLabel("high")).toBe("HD (1080p)");
    expect(getQualityLabel("medium")).toBe("720p");
    expect(getQualityLabel("low")).toBe("480p");

    expect(getQualityBadge("high")).toBe("HD");
    expect(getQualityBadge("medium")).toBe("720p");
    expect(getQualityBadge("low")).toBe("480p");
    expect(getQualityBadge("auto", "low")).toBe("Auto (480p)");
    expect(getQualityBadge("auto", "medium")).toBe("Auto (720p)");
    expect(getQualityBadge("auto", "high")).toBe("Auto (HD)");
  });

  it("resolves explicit tiers unchanged", () => {
    expect(resolveQualityTier("low")).toBe("low");
    expect(resolveQualityTier("medium")).toBe("medium");
    expect(resolveQualityTier("high")).toBe("high");
  });
});
