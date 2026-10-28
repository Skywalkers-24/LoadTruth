import { describe, expect, it } from "vitest";

import { parseSam } from "./sam-player";

// Two records from dev.meta.ai/docs/sam/reading-segmentation (lossless masks).
const FRAME_0 =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|><|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>";

describe("parseSam", () => {
  it("reads frames, boxes, and mask outlines from SAM output", () => {
    const track = parseSam(`${FRAME_0}\n${FRAME_0.replace("<0f>", "<2f>")}\n`, "video");
    expect(track.width).toBe(320);
    expect(track.height).toBe(334);
    expect(track.frameCount).toBe(3); // frame 1 had no objects and emitted no line
    const shapes = track.frames.get(0) ?? [];
    expect(shapes.map((s) => s.objectId)).toEqual(["0", "1"]);
    expect(shapes[0]).toMatchObject({ left: 211, top: 228, right: 271, bottom: 255 });
    expect(shapes[0]?.path.startsWith("M")).toBe(true);
    expect(track.frames.has(1)).toBe(false);
  });

  it("treats empty output as no detections", () => {
    const track = parseSam("", "video");
    expect(track.frameCount).toBe(0);
    expect(track.frames.size).toBe(0);
  });
});
