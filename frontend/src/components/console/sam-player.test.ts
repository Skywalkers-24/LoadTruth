import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { TicketEvidence } from "@/lib/api";
import {
  frameLayers,
  loadTexts,
  parseSam,
  SamPlayer,
  type SamShape,
  type SamTrack,
} from "./sam-player";

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

function shape(
  objectId: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): SamShape {
  return { objectId, left, top, right, bottom, path: "M0 0L1 0L1 1Z" };
}
function track(shapes: SamShape[]): SamTrack {
  return { frames: new Map([[0, shapes]]), width: 1024, height: 576, frameCount: 1 };
}

describe("evidence overlay regions", () => {
  const bed = shape("bed", 100, 100, 300, 400);
  const rim = shape("tailgate", 100, 260, 300, 400);
  it("uses the rear rim to separate bed interior from the tailgate and plate", () => {
    const cargo = shape("appliance", 140, 130, 210, 220);
    const plate = shape("plate", 160, 300, 200, 330);
    const outside = shape("yard debris", 310, 120, 420, 230);
    const result = frameLayers(track([bed]), track([cargo, plate, outside]), track([rim]), 0);
    expect(result.rim).toBe(260);
    expect(result.loads).toEqual([cargo]);
  });
  it("retains cargo whose mask does not intersect the visible metal mask", () => {
    const cargo = shape("cargo", 150, 120, 250, 200);
    expect(frameLayers(track([bed]), track([cargo]), track([rim]), 0).loads).toEqual([cargo]);
  });
  it("uses all named material prompts instead of only the best legacy phrase", () => {
    expect(
      loadTexts({ "debris pile": "best", "load: washers": "washers", "load: heaters": "heaters" }),
    ).toEqual(["washers", "heaters"]);
    expect(loadTexts({ "debris pile": "legacy" })).toEqual(["legacy"]);
  });
  it("does not switch to a background truck when the main bed leaves the frame", () => {
    const beds = track([bed, shape("small", 0, 0, 20, 20)]);
    beds.frames.set(1, [shape("small", 0, 0, 20, 20)]);
    expect(frameLayers(beds, track([]), track([]), 1).bed).toBeUndefined();
  });
  it("ignores unrelated and implausibly high tailgate detections", () => {
    const unrelated = shape("other rim", 500, 200, 600, 300);
    const cab = shape("cab", 100, 110, 300, 140);
    expect(frameLayers(track([bed]), track([]), track([unrelated, cab, rim]), 0).rim).toBe(260);
  });
  it("borrows bed from earliest tracked frame during pre-roll so masks don't drop out", () => {
    // Bed only tracked starting from frame 5
    const beds: SamTrack = { frames: new Map([[5, [bed]]]), width: 1024, height: 576, frameCount: 6 };
    const cargo = shape("cargo", 150, 120, 250, 200);
    const loads: SamTrack = { frames: new Map([[0, [cargo]]]), width: 1024, height: 576, frameCount: 6 };
    const rims: SamTrack = { frames: new Map([[0, [rim]]]), width: 1024, height: 576, frameCount: 6 };
    const result = frameLayers(beds, loads, rims, 0);
    expect(result.bed).toEqual(bed);
    expect(result.loads).toEqual([cargo]);
    expect(result.rimShapes).toEqual([rim]);
  });
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("SAM video overlay readiness", () => {
  it("waits for the video frame before displaying masks and respects autoplay control", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const evidence: TicketEvidence = {
      media_kind: "video",
      mime: "video/mp4",
      fps: 3,
      has_media: true,
      segments: { "truck bed": FRAME_0, "debris pile": FRAME_0 },
    };

    await act(async () =>
      root?.render(
        createElement(SamPlayer, {
          ticketId: "ticket",
          evidence,
          show: { body: false, bed: true, load: true },
          videoUrl: "blob:clip",
          autoPlay: false,
        }),
      ),
    );

    const video = host.querySelector("video");
    expect(video?.autoplay).toBe(false);
    expect(host.querySelector("svg.pointer-events-none")).toBeNull();
    expect(host.textContent).toContain("Synchronizing footage and masks");

    await act(async () => video?.dispatchEvent(new Event("loadeddata")));
    expect(host.querySelector("svg.pointer-events-none")).not.toBeNull();
    expect(host.textContent).not.toContain("Synchronizing footage and masks");
  });
});
