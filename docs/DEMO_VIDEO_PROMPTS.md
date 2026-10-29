# Demo video prompts (Google Flow / Veo)

Prompts for generating 10-second test clips that look like real gate-camera
footage of a dump truck passing through a debris-site checkpoint. Each clip is
fed into the LoadTruth pipeline, so the framing has to let the camera read three
things: the **truck ID placard**, the **load surface against the bed rails** (for
the fill %), and the **debris content** (for the debris class).

## Contents

- [The five truck types](#the-five-truck-types) — fixed body styles and capacities
- [Reading fill % as cubic yards](#reading-fill--as-cubic-yards)
- [Why the filenames matter](#why-the-filenames-matter-read-this-first)
- [The shared camera setup](#the-shared-camera-setup-baked-into-every-prompt)
- [Lighting, depth, and the CCTV overlay](#lighting-depth-and-the-cctv-overlay)
- [Realism / camera-setup clips (R1–R4)](#realism--camera-setup-clips-day-and-night) — day + night, gate and bed
- [Fixture-backed prompts (1–6)](#fixture-backed-prompts) — work in mock demo mode
- [Live-pipeline prompts (7–50)](#live-pipeline-prompts) — run against the real pipeline
- [Recommended 3-minute demo order](#recommended-3-minute-demo-order)

---

## The five truck types

LoadTruth's registry stores a `body_type` and a `certified_cubic_yards` per
truck (`backend/seed.json`). To keep the test clips realistic and consistent,
pick one of these five fixed truck types for every clip and describe it
accurately. The capacities below are typical certified sizes for debris hauling
and match the ranges already seeded in the registry.

| # | Truck type (`body_type`) | What it looks like | Typical certified capacity | Seeded registry IDs |
|---|---|---|---|---|
| T1 | **Tandem dump** (`tandem`) | Classic twin-rear-axle dump truck, steel box bed, rear tailgate placard. The workhorse. | 20–25 CY | FL-DT-3391 (20), FL-DT-2204 (25), FL-DT-6612 (22), FL-DT-7788 (20), FL-DT-8290 (24), FL-DT-9356 (20) |
| T2 | **Large tandem / tri-axle dump** (`tandem`) | Bigger steel-box dump, taller side walls, often tri-axle. | 28–30 CY | FL-DT-1182 (30) |
| T3 | **Roll-off** (`roll-off`) | Open rectangular roll-off container on a hook-lift truck, straight high walls. | 15–18 CY | FL-DT-5590 (15), FL-DT-6845 (18), FL-DT-8043 (16), FL-DT-9601 (15) |
| T4 | **Walking-floor trailer** (`walking-floor`) | Long enclosed-wall semi trailer, open top, moving-floor unloader. Largest bed. | 30–35 CY | FL-DT-4417 (30), FL-DT-9014 (32), FL-DT-7120 (35) |
| T5 | **Single-axle / compact dump** (`tandem`, small) | Smaller single-rear-axle dump truck, shallow bed. Lowest capacity. | 10–14 CY | (not seeded; use for live-mode variety, e.g. "FL-DT-5120") |

Rules when you use these in a prompt:

- State the type plainly in the prompt ("a tandem steel-box dump truck", "a long
  walking-floor trailer") so the generated truck looks the part.
- The **bed shape has to read from above**: T1/T2/T5 are open steel boxes; T3 is
  a straight-walled container; T4 is a long open-top trailer. The fill % geometry
  measures the load surface against those walls, so the walls must be visible.
- Keep the placard on the rear tailgate / rear door, readable from the overhead
  angle for about a second.

---

## Reading fill % as cubic yards

The ticket's cubic yards is roughly `certified_capacity × fill%`. Use this so the
load you describe in a prompt matches a believable number on the ticket. Examples
with the seeded capacities:

| Truck (type · capacity) | Fill in the clip | Approx. cubic yards | Reads as |
|---|---|---|---|
| FL-DT-3391 (T1 · 20 CY) | ~90% | ~18 CY | nearly full |
| FL-DT-2204 (T1 · 25 CY) | ~40% | ~10 CY | partial |
| FL-DT-1182 (T2 · 30 CY) | ~70% | ~21 CY | well loaded |
| FL-DT-5590 (T3 · 15 CY) | ~85% | ~13 CY | nearly full roll-off |
| FL-DT-7120 (T4 · 35 CY) | ~80% | ~28 CY | big trailer, well loaded |

A load that visibly overflows the rails on a small truck (e.g. a 15 CY roll-off
heaped to 130%) is what trips the `capacity_exceeded` anomaly, because the implied
cubic yards exceed the certified capacity.

---

## Why the filenames matter (read this first)

In the demo build the pipeline runs in mock mode (`MOCK_AI=true`), and the mock
returns a pre-recorded result based on a **filename prefix**, not on the pixels.
A clip named `<scenario>__anything.mp4` forces the matching recorded scenario, so
the ticket you see on screen always lines up with the footage. The parser lives
in `backend/app/pipeline/ingest.py` (`scenario_override`) and the recorded
results in `backend/app/ai/fixtures/scenarios.json`.

The six valid scenario keys (use one as the filename prefix, separator is a
double underscore `__`):

| Scenario key (filename prefix) | Placard the ticket shows | Debris class | Fill the pipeline reports | Anomaly it raises |
|---|---|---|---|---|
| `clean-full-cd` | FL-DT-3391 | Construction & demolition | ~90% (full) | none (baseline) |
| `clean-partial-veg` | FL-DT-2204 | Vegetative | ~40% (partial) | none |
| `hollow-load` | FL-DT-4417 | Vegetative | surface high, depth low | surface_depth_mismatch |
| `low-confidence-placard` | (unreadable) | Construction & demolition | ~55% | identity_unreadable / low_confidence |
| `uncertified-truck` | FL-ZZ-0000 (not in registry) | Vegetative | ~70% | uncertified_truck |
| `no-truck` | (none) | none | n/a | empty footage, no ticket |

So: generate the clip whose visuals match the scenario, then save it as
`clean-full-cd__demo.mp4` (etc.) before uploading. If you name it anything else,
the mock still drafts a believable clean ticket, but the numbers won't be
guaranteed to match what the video shows.

Prompts 1–6 below are the fixture-backed ones; their truck type, placard, and
fill are written to match the recorded result exactly. Prompts 7–20 are for the
**live** Meta pipeline (`MOCK_AI=false`), where the result is computed from the
pixels, so name those with a plain filename and let the pipeline read them.

## How to use this file

1. Pick a scenario, paste its prompt into Google Flow.
2. Keep it to 10 seconds, 24 fps, highest resolution available. The placard OCR
   and the fill-% geometry both benefit from detail.
3. Export MP4. For a fixture-backed clip, rename it with the scenario prefix
   (e.g. `hollow-load__demo.mp4`); for a live clip, any name is fine.
4. Upload at http://localhost:3000.
5. For the realism/setup clips in the next section (gate entry and bed scan, day
   and night), save with the filename given under each prompt.

## The shared camera setup (baked into every prompt)

Every scenario reuses one physical setup so the pipeline sees a consistent
viewpoint. Tune this block once and regenerate all scenarios from it.

> Fixed security camera mounted high on the top beam of a gate arch at a
> disaster-debris checkpoint, angled down and forward over the lane at roughly a 45
> to 55 degree angle. Wide lane, concrete and gravel ground, temporary chain-link
> fencing and orange cones on both sides. The camera is completely locked off: a
> single fixed vantage point for the whole clip, no pan, no zoom, no dolly, no orbit
> around the truck, and the angle never flips. A single dump truck drives **away**
> from the camera, deeper into the lane. It starts at a slow roll, eases up to a modest
> steady pace as it moves off, and gently slows again as it reaches the far end, always
> moving forward in one direction: never fast, never stopping dead, never reversing, no
> stop-and-go and no rolling backward, just a smooth speed that rises and falls a little.
> As it reaches the far part of the lane it follows the lane into a gentle, single curve,
> easing into a slow turn so it heads off toward the side and into the distance; the turn
> is one smooth arc in one direction, never a sharp swerve, a reversal, or a back-and-forth.
> It stays centered between the cones until the turn, and never touches the cones or the
> fence. From this high rear-three-quarter vantage the camera looks down over the top of
> the truck and directly into the open bed; while the truck is near and mid-lane the debris
> load and the rear tailgate stay the clearest things in frame, and they read clearly before
> the truck begins its turn. On the center of the steel rear tailgate is one single ID
> placard: a rectangular white plate reading "FL-DT-3391" in bold black text, the same
> placard, same text, same position for every frame, already present from the first frame and
> never appearing, changing, or moving. There is no other ID label, badge, or box anywhere on
> the truck. Realistic but gentle lens character: only a slight corner vignette and very mild
> edge distortion, not a strong fisheye or dark porthole. Natural engine motion, faint dust,
> barely perceptible camera micro-shake. Burned-in white monospace overlay in the top-left
> corner reading "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 09:14:22" on the second line, like a real surveillance feed.

Framing rules that matter for the pipeline:

- **The truck drives away from the camera, not toward it.** A front/grille view
  hides the bed and the rear placard, which are the two things the pipeline reads.
  The camera sits high on the gate arch and looks down and forward at the departing
  truck's open bed and tailgate. If you see the grille, the geometry is wrong.
- **Forward motion with gentle speed variation and one smooth turn.** The truck moves
  forward in one direction the whole clip: start at a slow roll, ease up to a modest
  steady pace, then gently slow again near the far end. Keep it slow overall, never
  fast. As it reaches the far part of the lane it follows the lane into a single gentle
  curve and eases off toward the side into the distance. Keep the speed changes smooth
  and the turn one clean arc in one direction. Never let it stop dead, reverse, roll
  backward, swerve sharply, or turn back and forth: those are the AI tells that make the
  load and background morph. Make sure the bed and placard read clearly while the truck
  is near and mid-lane, before it starts the turn.
- **One stable placard, present from frame one.** The second biggest tell was the
  placard popping in or changing (and a stray "T1" box alongside a plate). Specify
  exactly one rear-tailgate plate with one fixed ID string, present and unchanged in
  every frame, and explicitly forbid any other ID label on the truck. Never let the
  placard appear mid-clip or morph.
- **Dial back the lens.** Avoid strong fisheye and the dark circular vignette
  "porthole", it reads as a generated look. Ask for only mild edge distortion and a
  slight corner vignette, like a real wide gate camera.
- **One locked camera, one angle.** A real gate camera is bolted to the gantry. It
  never orbits the truck and never cuts from front to rear within one clip.
- **The truck follows a clean lane path into one gentle turn.** It stays centered in
  the lane while near and mid-lane, then follows the lane into a single smooth curve
  toward the side at the far end. It never clips a cone, never breaks through the
  barricade or fence, and never swerves. One smooth arc reads as real driving; erratic
  or back-and-forth motion reads as fake.
- **The bed stays visible until the turn.** From the high rear vantage the camera sees
  into the open bed while the truck is near and mid-lane, which is what lets the geometry
  engine measure the load surface against the bed rails. The load and placard must read
  clearly before the truck begins its turn at the far end.
- **The placard is on the rear tailgate, readable throughout** (unless the scenario
  is deliberately unreadable). It is one white rectangular panel centered on the steel
  tailgate with a bold black truck ID, not a floating label, not on the side, and not
  a second badge. Describe the exact ID string in every prompt.
- **One truck per clip.** Multiple trucks confuse single-load review.
- **Always burn in the CCTV overlay.** A `CAM NN` label plus a running date-time
  stamp in a corner is what sells the clip as a real camera feed. See the overlay
  rule below. Do not put any other synthetic captions or labels on the truck itself.

## Lighting, depth, and the CCTV overlay

Three cross-cutting rules apply to every prompt. Fold the relevant lines into the
shared block before generating.

**Lighting (day and night).** Generate a day and a night version of each setup so
the demo shows the camera works around the clock.

- *Day:* overcast or directional daylight. Avoid flat shadowless light, it kills
  the depth cue. Prefer "directional daylight with soft shadows" so the load surface
  has relief.
- *Night:* lit by overhead floodlights and a pole-mounted lamp, surfaces clearly
  visible, explicitly **not pitch black**. The truck's own headlights are on. Add
  cooler color, higher sensor noise, and faint motion blur typical of night CCTV.

**Depth (so the estimator can measure fill).** The fill-% geometry needs to see
*into* the bed and judge how deep the load sits.

- Keep the pause angle steep enough (around 45 to 60 degrees) that the camera looks
  down into the open bed, not just at the side of the truck.
- Keep the **bed side walls visible** as a scale reference, the estimator reads the
  load surface against the rails.
- Use **strong side or overhead lighting that casts shadows** across the load so
  surface relief and depth are visible. A flat, shadowless pile looks the same
  whether it is deep or hollow, which is exactly the ambiguity we want the lighting
  to remove.

**The burned-in overlay.** Top-left corner, white monospace text, two lines:
`CAM NN` then a date-time stamp like `2026-10-28 09:14:22` with running seconds.
Use `CAM 01` for the gate/entry lane and `CAM 02` for the bed-scan angle; use a
daytime clock (`09:xx`) for day clips and an evening clock (`21:xx`) for night
clips.

> Overlay reliability: video generators are unreliable at rendering exact text and
> a ticking clock, so the burned-in stamp may come out garbled. If it does, generate
> the clip clean and let the LoadTruth player draw the `CAM NN` + timestamp overlay
> on top, so it is always crisp and correct. Either way the review console shows a
> proper camera ID and timestamp.

---

# Realism / camera-setup clips (day and night)

These four clips are not tied to a scenario fixture. They exist to nail the
look-and-feel: a truly locked camera, a truck that drives **away** from the camera
so the open bed and the rear tailgate placard are both readable, a straight
controlled path, strong depth lighting, and a burned-in CCTV overlay, in both day
and night. Use them to validate framing and lighting before generating the scenario
clips, and as clean B-roll for the review console.

Both angles look at the truck from **behind and above** as it drives away, never at
the grille. `CAM 01` is the gate arch (wider, shows the truck entering and the whole
lane); `CAM 02` is a higher, steeper mast angle that fills the frame with the open
bed for the depth read. Save each with the filename shown.

## R1 — gate entry (rear/top view), day

**Filename:** `cam01-gate-entry-day.mp4`

> Fixed CCTV security camera mounted high on the top beam of a steel gate arch at the
> entrance to a county landfill tipping face, angled down and forward over the lane at
> about a 50 degree angle, completely locked off: one fixed vantage point, no pan, no
> zoom, no dolly, no orbit. In the background, mounded earth cover and the active
> working face of the landfill rise beyond the gate. A gray tandem steel-box dump truck
> drives away from the camera down a clear gravel haul lane, starting at a slow roll and
> easing up to a modest steady pace, never fast, then gently slowing and following the
> lane into one smooth gentle turn toward the side and off into the distance at the far
> end; it never stops dead, reverses, or swerves, and stays centered between two rows of
> orange cones until the turn, never touching the cones or the chain-link fence. From
> this high rear vantage the camera looks down over the top of the truck into the open
> steel bed, which is loaded with mixed construction debris, broken drywall, lumber, and
> concrete, mounded below the top of the bed rails so the load surface and the bed side
> walls both read clearly while the truck is near and mid-lane, before it turns. On the center
> of the steel rear tailgate is one single white rectangular ID placard reading
> "FL-DT-3391" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Directional overcast daylight with soft shadows that show the load's surface
> relief, dusty ground, mild sensor noise, only a slight corner vignette and very mild
> edge distortion (no strong fisheye, no dark porthole). Burned-in white monospace
> overlay in the top-left corner: "CAM 01" on the first line and a running date-time
> stamp "2026-10-28 09:14:22" on the second. 10 seconds, 24 fps, realistic surveillance
> look.

## R2 — gate entry (rear/top view), night

**Filename:** `cam01-gate-entry-night.mp4`

> Fixed CCTV security camera mounted high on the top beam of a steel gate arch at the
> gate of a debris staging yard at night, angled down and forward over the lane at about
> a 50 degree angle, completely locked off: no pan, no zoom, no dolly, no orbit. Rows of
> sorted debris piles and parked equipment sit in the dark beyond the gate. The scene is
> lit by overhead floodlights and a pole-mounted lamp so surfaces are clearly visible,
> not pitch black. A gray tandem dump truck, tail lights and headlights on, drives away
> from the camera down the yard lane, starting at a slow roll and easing up to a modest
> steady pace, never fast, then gently slowing and following the lane into one smooth
> gentle turn toward the side and off into the distance at the far end; it never stops
> dead, reverses, or swerves, and stays centered between the orange cones until the turn,
> never touching the cones or fence. From this high rear vantage the camera looks down
> into the open steel bed, loaded with mixed construction debris, drywall, lumber, and
> concrete, below the top of the bed rails so the load surface and side walls stay
> visible under the floodlight while the truck is near and mid-lane, before it turns. On the
> center of the steel rear tailgate is one single white rectangular ID placard reading
> "FL-DT-3391" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Cooler low-light color, visible pools of floodlight, higher sensor noise and
> faint motion blur typical of night CCTV, only a slight corner vignette and very mild
> edge distortion (no strong fisheye, no dark porthole). Burned-in white monospace
> overlay in the top-left corner: "CAM 01" on the first line and a running date-time
> stamp "2026-10-28 21:47:05" on the second. 10 seconds, 24 fps, realistic night
> surveillance look.

## R3 — overhead bed scan (rear/top close), day

**Filename:** `cam02-bed-overhead-day.mp4`

> Fixed CCTV security camera mounted high on a mast over a transfer-station weigh lane,
> completely locked off, steep downward angle about 60 degrees looking down and forward
> at a dump truck on the concrete scale platform driving away from the camera, starting
> at a slow roll and easing up to a modest steady pace, never fast, then gently slowing
> and following the lane into one smooth gentle turn toward the side and off into the
> distance at the far end (it never stops dead, reverses, or swerves), so the frame is
> filled with the open bed seen from behind and above while the truck is near and
> mid-lane, before it turns. The mixed construction and demolition debris inside,
> wood, drywall, concrete, and metal, is clearly visible and lit by strong directional
> daylight that casts hard shadows across the load to reveal surface relief and depth.
> The steel bed side walls are fully visible as a scale reference so the load surface
> can be read against the rails. On the center of the steel rear tailgate at the bottom
> of the frame is one single white rectangular ID placard reading "FL-DT-3391" in bold
> black text, present and unchanged from the very first frame, never appearing or
> morphing, with no other ID label on the truck. Mild sensor noise, only a slight corner
> vignette and very mild edge distortion (no strong fisheye). Burned-in white monospace
> overlay in the top-left corner: "CAM 02" on the first line and a running date-time
> stamp "2026-10-28 09:15:47" on the second. 10 seconds, 24 fps, realistic surveillance
> look.

## R4 — overhead bed scan (rear/top close), night

**Filename:** `cam02-bed-overhead-night.mp4`

> Fixed CCTV security camera mounted high on a mast over a scale-house checkpoint at
> night, completely locked off, steep downward angle about 60 degrees looking down and
> forward at a dump truck passing the lit weigh-station booth and driving away from the
> camera, starting at a slow roll and easing up to a modest steady pace, never fast, then
> gently slowing and following the lane into one smooth gentle turn toward the side and
> off into the distance at the far end (it never stops dead, reverses, or swerves), so the
> frame is filled with the open bed seen from behind and above while the truck is near and
> mid-lane, before it turns. A bright overhead floodlight is aimed into the bed so the
> mixed construction debris, wood, drywall, concrete, and metal, is clearly visible with
> hard shadows that reveal surface relief and depth, surfaces well lit and not pitch
> black. The steel bed side walls are fully visible as a scale reference so the load
> surface can be read against the rails. On the center of the steel rear tailgate at the
> bottom of the frame is one single white rectangular ID placard reading "FL-DT-3391" in
> bold black text, present and unchanged from the very first frame, never appearing or
> morphing, with no other ID label on the truck. Cooler low-light color, higher sensor
> noise typical of night CCTV, only a slight corner vignette and very mild edge
> distortion (no strong fisheye). Burned-in white monospace overlay in the top-left
> corner: "CAM 02" on the first line and a running date-time stamp "2026-10-28 21:48:30"
> on the second. 10 seconds, 24 fps, realistic night surveillance look.

---

# Fixture-backed prompts

These six match a recorded fixture. Save each with the scenario-key prefix so the
mock demo draws the matching ticket.

## 1 — `clean-full-cd` · T1 tandem, full C&D load

**Filename:** `clean-full-cd__demo.mp4`
**Truck:** T1 tandem dump, FL-DT-3391, certified 20 CY.
**Pipeline shows:** FL-DT-3391, construction & demolition, ~90% full (~18 CY), no
anomalies. The "everything works" reference clip.

> Fixed CCTV security camera mounted high on the top beam of a steel gate arch at a
> disaster-debris checkpoint, angled down and forward over the lane at about a 45
> degree angle. The camera is completely locked off: one fixed vantage point for the
> whole clip, no pan, no zoom, no dolly, no orbit. A heavy gray tandem steel-box dump
> truck drives away from the camera, deeper into the lane, starting at a slow roll and
> easing up to a modest steady pace, never fast, then gently slowing and following the
> lane into one smooth gentle turn toward the side and off into the distance at the far
> end; it never stops dead, reverses, or swerves, staying centered between two rows of
> orange cones until the turn and never touching the cones or the chain-link fence. From
> this high rear vantage, while the truck is near and mid-lane the camera looks down
> over the top of the truck into the open steel bed, loaded about 90 percent full with
> mixed construction and demolition debris: broken drywall, splintered lumber, concrete
> chunks, bent metal studs, and roofing shingles, mounded near the top of the bed rails
> but not overflowing, with directional daylight casting soft shadows across the pile so
> its surface relief and depth read clearly against the visible bed side walls. On the
> center of the steel rear tailgate is one single white rectangular ID placard reading
> "FL-DT-3391" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Bright overcast daylight, dusty gravel ground, temporary fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye, no dark porthole),
> subtle camera micro-shake, light dust kick-up. Burned-in white monospace overlay in
> the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 09:14:22" on the second. 10 seconds, 24 fps, realistic surveillance look.

## 2 — `clean-partial-veg` · T1 tandem, partial vegetative load

**Filename:** `clean-partial-veg__demo.mp4`
**Truck:** T1 tandem dump, FL-DT-2204, certified 25 CY.
**Pipeline shows:** FL-DT-2204, vegetative, ~40% full (~10 CY), no anomalies.

> Fixed CCTV security camera mounted high on a steel gate arch at a roadside
> curbside-collection control point, angled down and forward over the lane at about a 45
> degree angle, completely locked off: one fixed vantage point, no pan, no zoom, no
> dolly, no orbit. Neat suburban curb, parked collection carts, and a control booth sit
> off to the side of the lane. A clean white tandem steel-box dump truck drives away from
> the camera down the control lane, starting at a slow roll and easing up to a modest
> steady pace, never fast, then gently slowing and following the lane into one smooth
> gentle turn toward the side and off into the distance at the far end; it never stops
> dead, reverses, or swerves, and stays centered between two rows of orange cones until
> the turn, never touching the cones or the fence. From this high rear vantage the camera
> looks down into the open steel bed,
> loaded about 40 percent full with fresh green and brown tree debris: branches, palm
> fronds, cut limbs, and leafy brush, resting well below the top of the bed rails so the
> empty upper walls of the bed are clearly visible as a scale reference, with soft
> directional daylight showing the shallow depth of the pile. On the center of the steel
> rear tailgate is one single white rectangular ID placard reading "FL-DT-2204" in crisp
> black text, present and unchanged from the very first frame, never appearing or
> morphing mid-clip, with no other ID label or box anywhere on the truck. Soft overcast
> daylight, gravel ground, chain-link fencing on both sides, only a slight corner
> vignette and very mild edge distortion (no strong fisheye), faint camera shake, light
> dust. Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first
> line and a running date-time stamp "2026-10-28 10:02:11" on the second. 10 seconds,
> 24 fps, realistic surveillance look.

## 3 — `hollow-load` · T4 walking-floor, fluffed load

**Filename:** `hollow-load__demo.mp4`
**Truck:** T4 walking-floor trailer, FL-DT-4417, certified 30 CY.
**Pipeline shows:** FL-DT-4417, vegetative, surface spans the bed but shallow
depth, trips `surface_depth_mismatch` (the classic fluffed load).

> Fixed CCTV security camera mounted high on a steel gate arch at the entrance to a
> temporary disaster debris management site (TDMS), angled down and forward over the lane
> at about a 45 degree angle, completely locked off: one fixed vantage point, no pan, no
> zoom, no dolly, no orbit. Large segregated storm-debris piles and a few spotter flags
> line the field beyond the gate. A long green open-top walking-floor trailer drives away
> from the camera down the site lane, starting at a slow roll and easing up to a modest
> steady pace, never fast, then gently slowing and following the lane into one smooth
> gentle turn toward the side and off into the distance at the far end; it never stops
> dead, reverses, or swerves, and stays centered between the cones until the turn, never
> touching the cones or the fence. From this high rear vantage the camera looks
> down the length of the open-top trailer: a light, airy layer of brush and small branches
> is spread evenly across the entire top of the bed, reaching the top of the side walls
> from edge to edge, but very loosely piled and shallow, so gaps and the bare trailer floor
> show through the debris in several spots, directional daylight raking across it to expose
> the lack of depth. The load looks fluffed, wide surface coverage but little real volume.
> On the center of the steel rear tailgate is one single white rectangular ID placard
> reading "FL-DT-4417" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Overcast-but-directional daylight, gravel ground, orange cones, fencing, only a
> slight corner vignette and very mild edge distortion (no strong fisheye), subtle camera
> micro-shake. Burned-in white monospace overlay in the top-left corner: "CAM 01" on the
> first line and a running date-time stamp "2026-10-28 11:18:40" on the second. 10 seconds,
> 24 fps, realistic surveillance look.

## 4 — `low-confidence-placard` · T1 tandem, unreadable placard

**Filename:** `low-confidence-placard__demo.mp4`
**Truck:** T1 tandem dump (ID unreadable in the clip).
**Pipeline shows:** OCR fails, construction & demolition, ~55% full, raises
`identity_unreadable` / `low_confidence`. Tests the fail-loud identity path.

> Fixed CCTV security camera mounted high on a steel gate arch at the entry to a
> municipal public-works yard, angled down and forward at about a 45 degree angle,
> completely locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit.
> City maintenance vehicles, a salt shed, and stacked pipe sit in the yard behind the
> gate. A dirty white tandem steel-box dump truck drives away from the camera down the
> yard lane, starting at a slow roll and easing up to a modest steady pace, never fast,
> then gently slowing and following the lane into one smooth gentle turn toward the side
> and off into the distance at the far end; it never stops dead, reverses, or swerves, and
> stays centered between the cones until the turn, never touching the cones or the fence.
> From this high rear vantage the camera looks down
> into the open steel bed, about 55 percent full with mixed construction and demolition
> debris, lumber, drywall, and broken concrete, sitting below the top of the bed rails with
> the side walls visible as a scale reference and directional daylight showing the pile's
> depth. On the center of the steel rear tailgate is one single white rectangular ID placard
> in the normal position, present and unchanged from the first frame, but heavily caked in
> mud and dust and partly peeled, so its lettering is smeared and illegible; everything else
> in the frame stays in sharp focus, only the placard text cannot be read, and there is no
> other ID label on the truck. Gray overcast light, muddy gravel ground, orange cones,
> chain-link fencing, only a slight corner vignette and very mild edge distortion (no strong
> fisheye), faint camera shake, light dust. Burned-in white monospace overlay in the
> top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 13:41:07" on the second. 10 seconds, 24 fps, realistic surveillance look.

## 5 — `uncertified-truck` · T1 tandem, truck not in registry

**Filename:** `uncertified-truck__demo.mp4`
**Truck:** T1 tandem dump, placard FL-ZZ-0000 (absent from the registry).
**Pipeline shows:** FL-ZZ-0000 read clearly but missing from the registry, raises
`uncertified_truck`. Vegetative, ~70% full.

> Fixed CCTV security camera mounted high on a steel gate arch at a construction-site
> haul-road checkpoint, angled down and forward at about a 45 degree angle, completely
> locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. A half-built
> structure, a tower crane, and stockpiled fill line the haul road beyond the gate. A red
> tandem steel-box dump truck drives away from the camera down the haul road, starting at
> a slow roll and easing up to a modest steady pace, never fast, then gently slowing and
> following the lane into one smooth gentle turn toward the side and off into the distance
> at the far end; it never stops dead, reverses, or swerves, and stays centered between
> the cones until the turn, never touching the cones or the fence. From this high rear
> vantage the camera looks down
> into the open steel bed, about 70 percent full with mixed tree debris, branches and leafy
> brush, mounded a little below the top of the bed rails with the side walls visible as a
> scale reference and directional daylight showing the pile's depth. On the center of the
> steel rear tailgate is one single white rectangular ID placard reading "FL-ZZ-0000" in
> bold black text, sharp and clearly readable, present and unchanged from the very first
> frame, never appearing or morphing mid-clip, with no other ID label or box anywhere on
> the truck. Bright overcast light, dry gravel lane, orange cones, temporary fencing, only
> a slight corner vignette and very mild edge distortion (no strong fisheye), faint camera
> shake, light dust. Burned-in white monospace overlay in the top-left corner: "CAM 01" on
> the first line and a running date-time stamp "2026-10-28 14:09:55" on the second.
> 10 seconds, 24 fps, realistic surveillance look.

## 6 — `no-truck` · empty lane, no truck (negative case)

**Filename:** `no-truck__demo.mp4`
**Truck:** none.
**Pipeline shows:** empty footage, nothing tracked, no ticket drafted. Shows the
pipeline correctly producing nothing instead of inventing a load.

> Fixed CCTV security camera mounted high on the top beam of a steel gate arch at the
> entrance to a recycling center, angled down and forward over an empty lane at about a 45
> degree angle, completely locked off: one fixed vantage point, no pan, no zoom, no dolly,
> no orbit. No vehicle passes for the whole clip: just the bare concrete and gravel lane
> centered between two rows of orange cones, a closed intake bay and rows of sorting bins
> off to the side, temporary chain-link fencing on both sides, and faint dust drifting in
> the wind, with occasional distant background movement far outside the lane. The scene is
> completely still apart from the drifting dust. Flat
> overcast daylight, long still shadows, only a slight corner vignette and very mild edge
> distortion (no strong fisheye), subtle camera micro-shake. Burned-in white monospace
> overlay in the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 15:33:20" on the second. 10 seconds, 24 fps, realistic surveillance look.

---

# Live-pipeline prompts

Prompts 7–20 provide the first live-pipeline scenarios. Prompts 21–50 add more
load types, operating conditions, and anomaly cases, reusing registry IDs where
noted. Every prompt below explicitly requires a completely fixed camera; do not
allow camera shake or any viewpoint movement.

Prompts 7–20 are for the live Meta pipeline (`MOCK_AI=false`), where the result
is read from the pixels. Each cites a real registry truck (type and certified
capacity) so the fill reads as a believable cubic-yard number, and spans every
truck type, debris class, lighting condition, and anomaly. Use a plain filename.

## 7 — T2 large tandem, full vegetative load

**Filename:** `live-07-tri-axle-veg-full.mp4`
**Truck:** T2 large tandem, FL-DT-1182, certified 30 CY. **Load:** ~90% (~27 CY),
vegetative.

> Fixed CCTV security camera mounted high on a steel gate arch at a quarry and aggregate
> yard gate, angled down and forward over the lane at about a 45 degree angle, completely
> locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. Tall conical
> stockpiles of crushed stone and a loader sit in the yard beyond the gate. A big white
> tri-axle dump truck with tall steel side walls drives away from the camera down the yard
> lane, starting at a slow roll and easing up to a modest steady pace, never fast, then
> gently slowing and following the lane into one smooth gentle turn toward the side and
> off into the distance at the far end; it never stops dead, reverses, or swerves, and
> stays centered between the cones until the turn, never touching the cones or the fence.
> From this high rear vantage the camera looks down into the deep bed, about 90
> percent full with dense vegetative debris: whole tree limbs, thick branches, and leafy
> brush packed near the top of the tall rails, with directional daylight raking across
> the pile so its depth reads against the visible side walls. On the center of the steel
> rear tailgate is one single white rectangular ID placard reading "FL-DT-1182" in bold
> black text, present and unchanged from the very first frame, never appearing or
> morphing mid-clip, with no other ID label or box anywhere on the truck. Bright overcast
> daylight, dusty gravel ground, orange cones, fencing, only a slight corner vignette and
> very mild edge distortion (no strong fisheye), faint camera shake, light dust. Burned-in
> white monospace overlay in the top-left corner: "CAM 01" on the first line and a running
> date-time stamp "2026-10-28 08:51:33" on the second. 10 seconds, 24 fps, realistic
> surveillance look.

## 8 — T3 roll-off, nearly full C&D

**Filename:** `live-08-rolloff-cd-full.mp4`
**Truck:** T3 roll-off, FL-DT-5590, certified 15 CY. **Load:** ~85% (~13 CY), C&D.

> Fixed CCTV security camera mounted high on a steel gate arch at the entrance to a
> materials recovery facility, angled down and forward at about a 45 degree angle,
> completely locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit.
> Conveyor housings, a sorting hall, and baled recyclables stand beyond the gate. A gray
> hook-lift truck carrying an
> open rectangular roll-off container with straight high walls drives away from the camera
> down the intake lane, starting at a slow roll and easing up to a modest steady pace,
> never fast, then gently slowing and following the lane into one smooth gentle turn
> toward the side and off into the distance at the far end; it never stops dead, reverses,
> or swerves, and stays centered between the cones until the turn, never touching the
> cones or the fence. From this high rear vantage the camera looks down into the container,
> about 85 percent full with construction and demolition debris: broken concrete, lumber, and
> drywall, level just below the top of the straight container walls, with directional
> daylight showing the load's depth against the visible walls. On the center of the steel
> rear door of the container is one single white rectangular ID placard reading "FL-DT-5590"
> in bold black text, present and unchanged from the very first frame, never appearing or
> morphing mid-clip, with no other ID label or box anywhere on the truck. Flat but
> directional daylight, gravel ground, orange cones, chain-link fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye), faint camera shake.
> Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first line and
> a running date-time stamp "2026-10-28 09:27:14" on the second. 10 seconds, 24 fps,
> realistic surveillance look.

## 9 — T4 walking-floor, big vegetative load

**Filename:** `live-09-walkingfloor-veg-big.mp4`
**Truck:** T4 walking-floor, FL-DT-7120, certified 35 CY. **Load:** ~80% (~28 CY),
vegetative.

> Fixed CCTV security camera mounted high on a steel gate arch at an inland intermodal
> rail yard gate, angled down and forward at about a 45 degree angle, completely locked
> off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. Long rows of rail
> cars, stacked containers, and a reach-stacker fill the yard beyond the gate. A long
> open-top walking-floor trailer drives away from the camera down the yard lane,
> starting at a slow roll and easing up to a modest steady pace, never fast, then gently
> slowing and following the lane into one smooth gentle turn toward the side and off into
> the distance at the far end; it never stops dead, reverses, or swerves, and stays
> centered between the cones until the turn, never touching the cones or the fence. From
> this high rear vantage the camera looks down
> the length of the trailer, about 80 percent full with vegetative debris: a long mounded
> pile of branches, limbs, and brush reaching near the side walls, with soft morning light
> casting long shadows that show the pile's real depth against the visible walls. On the
> center of the steel rear of the trailer is one single white rectangular ID placard
> reading "FL-DT-7120" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Soft morning light, long shadows, gravel ground, cones, fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye), subtle camera shake,
> light dust. Burned-in white monospace overlay in the top-left corner: "CAM 01" on the
> first line and a running date-time stamp "2026-10-28 07:44:02" on the second. 10 seconds,
> 24 fps, realistic surveillance look.

## 10 — T5 compact dump, partial mixed load

**Filename:** `live-10-compact-other-partial.mp4`
**Truck:** T5 single-axle compact dump, FL-DT-5120, certified ~12 CY. **Load:**
~45% (~5 CY), other.

> Fixed CCTV security camera mounted high on a steel gate arch at a wheel-wash station
> checkpoint, angled down and forward at about a 48 degree angle, completely locked off:
> one fixed vantage point, no pan, no zoom, no dolly, no orbit. A grated wash pit and
> spray nozzles sit in the wet lane, with a small equipment cabin off to the side. A small
> single-rear-axle dump truck with a shallow steel bed drives away from the camera through
> the wash lane, starting at a slow roll and easing up to a modest steady pace, never
> fast, then gently slowing and following the lane into one smooth gentle turn toward the
> side and off into the distance at the far end; it never stops dead, reverses, or swerves,
> and stays centered between the cones until the turn, never touching the cones or the
> fence. From this high rear vantage the camera
> looks down into the shallow bed, about 45 percent full with mixed general debris: broken
> furniture, cardboard, carpet, and plastic, sitting below the top of the low bed rails,
> with directional daylight showing the shallow depth against the visible walls. On the
> center of the steel rear tailgate is one single white rectangular ID placard reading
> "FL-DT-5120" in bold black text, present and unchanged from the very first frame, never
> appearing or morphing mid-clip, with no other ID label or box anywhere on the truck.
> Overcast-but-directional daylight, gravel ground, orange cones, fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye), faint camera shake.
> Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first line and
> a running date-time stamp "2026-10-28 11:36:49" on the second. 10 seconds, 24 fps,
> realistic surveillance look.

## 11 — T3 roll-off, white goods

**Filename:** `live-11-rolloff-whitegoods.mp4`
**Truck:** T3 roll-off, FL-DT-8043, certified 16 CY. **Load:** ~70% (~11 CY), white
goods.

> Fixed CCTV security camera mounted high on a steel gate arch at the tipping-floor gate
> of a waste transfer station, angled down and forward at about a 45 degree angle,
> completely locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. The
> open mouth of a large steel transfer building and a push-wall of mixed waste show
> beyond the gate. A blue hook-lift truck with an open roll-off container drives away from
> the camera down the tipping lane, starting at a slow roll and easing up to a modest
> steady pace, never fast, then gently slowing and following the lane into one smooth
> gentle turn toward the side and off into the distance at the far end; it never stops
> dead, reverses, or swerves, and stays centered between the cones until the turn, never
> touching the cones or the fence. From this high rear vantage the camera
> looks down into the container, about 70 percent full with discarded household appliances:
> white refrigerators, washing machines, dryers, and a water heater, stacked at angles with
> gaps between them, below the top of the straight container walls, directional daylight
> casting shadows into the gaps so the depth reads. On the center of the steel rear door of
> the container is one single white rectangular ID placard reading "FL-DT-8043" in bold
> black text, present and unchanged from the very first frame, never appearing or morphing
> mid-clip, with no other ID label or box anywhere on the truck. Flat overcast daylight, wet
> concrete and gravel ground, orange cones, fencing, only a slight corner vignette and very
> mild edge distortion (no strong fisheye), faint camera shake. Burned-in white monospace
> overlay in the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 12:18:05" on the second. 10 seconds, 24 fps, realistic surveillance look.

## 12 — T1 tandem, hazardous load

**Filename:** `live-12-tandem-hazardous.mp4`
**Truck:** T1 tandem, FL-DT-7788, certified 20 CY. **Load:** ~40% (~8 CY),
hazardous.

> Fixed CCTV security camera mounted high on a steel gate arch at a hazardous-waste intake
> bay, angled down and forward at about a 48 degree angle, completely locked off: one
> fixed vantage point, no pan, no zoom, no dolly, no orbit. Hazard placards, a spill-kit
> station, and a covered containment pad stand beyond the gate. A white tandem dump truck
> drives away from the camera down the intake lane, starting at a slow roll and easing up
> to a modest steady pace, never fast, then gently slowing and following the lane into one
> smooth gentle turn toward the side and off into the distance at the far end; it never
> stops dead, reverses, or swerves, and stays centered between the cones until the turn,
> never touching the cones or the fence. From this high rear vantage the camera looks down
> into the bed, about
> 40 percent full with clearly hazardous material: rusted metal drums, paint and chemical
> cans, old car batteries, and propane tanks, grouped together below the top of the bed
> rails and visibly different from ordinary debris, with directional daylight showing their
> shape and depth against the visible walls. On the center of the steel rear tailgate is one
> single white rectangular ID placard reading "FL-DT-7788" in bold black text, present and
> unchanged from the very first frame, never appearing or morphing mid-clip, with no other
> ID label or box anywhere on the truck. Flat but directional daylight, concrete and gravel
> ground, orange cones, chain-link fencing, only a slight corner vignette and very mild edge
> distortion (no strong fisheye), subtle camera micro-shake. Burned-in white monospace
> overlay in the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 13:05:58" on the second. 10 seconds, 24 fps, realistic surveillance look.

## 13 — T3 roll-off, over certified capacity (capacity_exceeded)

**Filename:** `live-13-rolloff-overcapacity.mp4`
**Truck:** T3 roll-off, FL-DT-9601, certified 15 CY. **Load:** heaped well past the
walls, implied volume over 15 CY, trips `capacity_exceeded`. C&D.

> Fixed CCTV security camera mounted high on a steel gate arch over a landfill weighbridge,
> angled down and forward at about a 45 degree angle, completely locked off: one fixed
> vantage point, no pan, no zoom, no dolly, no orbit. The lane runs across a flush
> concrete scale deck lined with gray jersey barriers instead of cones, with a weigh booth
> to one side. A gray hook-lift truck with an open roll-off container drives away from the
> camera across the weighbridge, starting at a slow roll and easing up to a modest steady
> pace, never fast, then gently slowing and following the lane into one smooth gentle turn
> toward the side and off into the distance at the far end; it never stops dead, reverses,
> or swerves, and stays centered between the jersey barriers until the turn, never touching
> the barriers or the fence. From this high rear vantage the camera looks
> down into the container, grossly overloaded with construction and demolition debris,
> broken concrete, lumber, drywall, and twisted metal, heaped in a tall mound that rises
> well above the top of the straight container walls and bulges past the edges, with pieces
> visibly overhanging the sides; harsh midday sun casts a hard shadow over the mound so its
> height above the rails is unmistakable. The load clearly exceeds what the container can
> hold. On the center of the steel rear door of the container is one single white
> rectangular ID placard reading "FL-DT-9601" in bold black text, present and unchanged from
> the very first frame, never appearing or morphing mid-clip, with no other ID label or box
> anywhere on the truck. Harsh midday sun, short hard shadow, dusty concrete scale deck,
> gray jersey barriers, perimeter fencing, only a slight corner vignette and very mild edge distortion (no strong fisheye),
> camera micro-shake, heavy dust kick-up. Burned-in white monospace overlay in the top-left
> corner: "CAM 01" on the first line and a running date-time stamp "2026-10-28 12:47:21" on
> the second. 10 seconds, 24 fps, realistic surveillance look.

## 14 — T2 large tandem, over capacity vegetative (capacity_exceeded)

**Filename:** `live-14-tri-axle-overcapacity-veg.mp4`
**Truck:** T2 large tandem, FL-DT-1182, certified 30 CY. **Load:** heaped far above
the rails, trips `capacity_exceeded`. Vegetative.

> Fixed CCTV security camera mounted high on a steel gate arch over an aggregate quarry
> scale lane, angled down and forward at about a 45 degree angle, completely locked off:
> one fixed vantage point, no pan, no zoom, no dolly, no orbit. Benched rock faces and
> graded stockpiles rise behind the gate, with a dusty scale deck underfoot. A big
> tri-axle dump truck drives away from the camera across the scale lane, starting at a
> slow roll and easing up to a modest steady pace, never fast, then gently slowing and
> following the lane into one smooth gentle turn toward the side and off into the distance
> at the far end; it never stops dead, reverses, or swerves, and stays centered between the
> cones until the turn, never touching the cones or the fence. From this high rear vantage
> the camera looks down into
> the deep bed, overfilled with vegetative debris: a towering mound of branches, limbs, and
> brush piled far above the top of the tall side walls and spilling over the edges, with
> bright harsh sunlight casting a short shadow that shows how far the pile rises above the
> rails. The load clearly exceeds a safe level. On the center of the steel rear tailgate is
> one single white rectangular ID placard reading "FL-DT-1182" in bold black text, present
> and unchanged from the very first frame, never appearing or morphing mid-clip, with no
> other ID label or box anywhere on the truck. Bright harsh sunlight, short shadow, dusty
> gravel lane, cones, fencing, only a slight corner vignette and very mild edge distortion
> (no strong fisheye), camera micro-shake, heavy dust. Burned-in white monospace overlay in
> the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 12:55:40" on the second. 10 seconds, 24 fps, realistic surveillance look.

## 15 — T4 walking-floor, fluffed load (surface_depth_mismatch)

**Filename:** `live-15-walkingfloor-fluffed.mp4`
**Truck:** T4 walking-floor, FL-DT-9014, certified 32 CY. **Load:** surface spans
the trailer but shallow, trips `surface_depth_mismatch`. Vegetative.

> Fixed CCTV security camera mounted high on a steel gate arch at the gate of a green-waste
> composting yard, angled down and forward at about a 45 degree angle, completely locked
> off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. Long windrows of
> composting mulch and a straddle turner sit in the field beyond the gate. A long open-top
> walking-floor trailer drives away from the camera down the yard lane, starting at a slow
> roll and easing up to a modest steady pace, never fast, then gently slowing and
> following the lane into one smooth gentle turn toward the side and off into the distance
> at the far end; it never stops dead, reverses, or swerves, and stays centered between the
> cones until the turn, never touching the cones or the fence. From this high rear vantage
> the camera looks down the
> length of the trailer: a thin, airy layer of brush and small branches is spread evenly
> across the whole length, touching the top of the side walls edge to edge, but loosely
> piled and shallow so the trailer floor shows through in gaps, directional daylight raking
> across it to expose the lack of depth. Wide surface, little real volume: a fluffed load.
> On the center of the steel rear of the trailer is one single white rectangular ID placard
> reading "FL-DT-9014" in bold black text, present and unchanged from the very first frame,
> never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Overcast-but-directional daylight, gravel ground, cones, fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye), subtle camera
> micro-shake. Burned-in white monospace overlay in the top-left corner: "CAM 01" on the
> first line and a running date-time stamp "2026-10-28 10:39:16" on the second. 10 seconds,
> 24 fps, realistic surveillance look.

## 16 — T1 tandem, unreadable muddy placard (identity_unreadable)

**Filename:** `live-16-tandem-unreadable-placard.mp4`
**Truck:** T1 tandem (ID unreadable). **Load:** ~60% (~12 CY), C&D.

> Fixed CCTV security camera mounted high on a steel gate arch at a muddy haul-road
> checkpoint with a guard booth, angled down and forward at about a 48 degree angle,
> completely locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. A
> small guard booth and a rutted, rain-soaked access road sit beyond the gate. A
> mud-streaked tandem dump truck drives away from the camera down the muddy haul road,
> starting at a slow roll and easing up to a modest steady pace, never fast, then gently
> slowing and following the lane into one smooth gentle turn toward the side and off into
> the distance at the far end; it never stops dead, reverses, or swerves, and stays
> centered between the cones until the turn, never touching the cones or the fence. From
> this high rear vantage the camera looks down
> into the bed, about 60 percent full with construction and demolition debris, broken
> concrete and lumber, below the top of the bed rails with the side walls visible as a
> scale reference and directional daylight showing the pile's depth. On the center of the
> steel rear tailgate is one single white rectangular ID placard in the normal position,
> present and unchanged from the first frame, but heavily caked in dried mud so its
> lettering is smeared and illegible; everything else in the frame stays in sharp focus,
> only the placard text cannot be read, and there is no other ID label on the truck. Gray
> overcast light, muddy gravel ground, orange cones, fencing, only a slight corner vignette
> and very mild edge distortion (no strong fisheye), faint camera shake, light dust.
> Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first line and
> a running date-time stamp "2026-10-28 14:22:33" on the second. 10 seconds, 24 fps,
> realistic surveillance look.

## 17 — T5 compact dump, uncertified truck, white goods

**Filename:** `live-17-compact-uncertified-whitegoods.mp4`
**Truck:** T5 compact dump, placard FL-DT-0000 (absent from the registry). **Load:**
~50% (~6 CY), white goods.

> Fixed CCTV security camera mounted high on a steel gate arch at a rural collection site
> with a boom gate, angled down and forward at about a 48 degree angle, completely locked
> off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. A raised red-and-white
> boom gate arm and an open field with a small drop-off shed sit beyond the arch. A small
> single-axle dump truck with a shallow bed drives away from the camera down the site lane,
> starting at a slow roll and easing up to a modest steady pace, never fast, then gently
> slowing and following the lane into one smooth gentle turn toward the side and off into
> the distance at the far end; it never stops dead, reverses, or swerves, and stays
> centered between the cones until the turn, never touching the cones or the fence. From
> this high rear vantage the camera looks down
> into the bed, about 50 percent full with discarded white goods: a small refrigerator, a
> microwave, and a water heater laid at angles with gaps between them, below the top of the
> low rails with the side walls visible as a scale reference and directional daylight
> casting shadows into the gaps so the depth reads. On the center of the steel rear tailgate
> is one single white rectangular ID placard reading "FL-DT-0000" in bold black text, sharp
> and clearly readable, present and unchanged from the very first frame, never appearing or
> morphing mid-clip, with no other ID label or box anywhere on the truck. Bright overcast
> light, dry gravel lane, orange cones, fencing, only a slight corner vignette and very mild
> edge distortion (no strong fisheye), faint camera shake, light dust. Burned-in white
> monospace overlay in the top-left corner: "CAM 01" on the first line and a running
> date-time stamp "2026-10-28 15:11:47" on the second. 10 seconds, 24 fps, realistic
> surveillance look.

## 18 — T1 tandem, night-time C&D load

**Filename:** `live-18-tandem-cd-night.mp4`
**Truck:** T1 tandem, FL-DT-4408, certified ~20 CY. **Load:** ~80% (~16 CY), C&D,
under floodlight.

> Fixed CCTV security camera mounted high on a steel gate arch under a floodlit canopy at
> a transfer-station night gate, angled down and forward at about a 45 degree angle,
> completely locked off: one fixed vantage point, no pan, no zoom, no dolly, no orbit. A
> steel canopy, a lit booth, and the dark bulk of the transfer building frame the lane.
> The scene is lit by a harsh overhead floodlight and the truck's own lights so surfaces
> are clearly visible, not pitch black. A tandem dump truck, tail lights and headlights on,
> drives away from the camera down the night lane, starting at a slow roll and easing up to
> a modest steady pace, never fast, then gently slowing and following the lane into one
> smooth gentle turn toward the side and off into the distance at the far end; it never
> stops dead, reverses, or swerves, and stays centered between the cones until the turn,
> never touching the cones or the fence. From this high rear vantage the camera looks down
> into the bed, about 80 percent
> full with mixed construction debris, lumber, drywall, and broken concrete, the floodlight
> raking across it so the load surface reads against the visible bed rails. On the center of
> the steel rear tailgate is one single white rectangular ID placard reading "FL-DT-4408" in
> bold black text, legible under the floodlight, present and unchanged from the very first
> frame, never appearing or morphing mid-clip, with no other ID label or box anywhere on the
> truck. Dark surroundings, pools of artificial light, long hard shadows, gravel ground,
> cones and fencing catching the light, cooler low-light color, mild sensor noise and grain
> typical of low-light security cameras, only a slight corner vignette and very mild edge
> distortion (no strong fisheye), faint camera shake. Burned-in white monospace overlay in
> the top-left corner: "CAM 01" on the first line and a running date-time stamp
> "2026-10-28 21:52:10" on the second. 10 seconds, 24 fps, realistic night surveillance look.

## 19 — T3 roll-off, rainy day partial load

**Filename:** `live-19-rolloff-cd-rain.mp4`
**Truck:** T3 roll-off, FL-DT-6845, certified 18 CY. **Load:** ~55% (~10 CY), C&D,
wet weather.

> Fixed CCTV security camera mounted high on a steel gate arch at a marine terminal gate in
> light rain, angled down and forward at about a 45 degree angle, completely locked off: one
> fixed vantage point, no pan, no zoom, no dolly, no orbit. Wet stacked containers and a
> quay crane loom through the drizzle beyond the gate. A gray hook-lift truck with a wet open
> roll-off container drives away from the camera down the terminal lane, starting at a slow
> roll and easing up to a modest steady pace, never fast, then gently slowing and following
> the lane into one smooth gentle turn toward the side and off into the distance at the far
> end; it never stops dead, reverses, or swerves, and stays centered between the cones until
> the turn, never touching the cones or the fence. From this high rear vantage the camera
> looks down into the container, about 55 percent full with rain-darkened construction and
> demolition debris, wet lumber and broken drywall, below the top of the straight walls,
> with water beading on the metal and soft overcast light still showing the load's depth
> against the visible walls. On the center of the steel rear door of the container is one
> single white rectangular ID placard reading "FL-DT-6845" in bold black text, still readable
> through the drizzle, present and unchanged from the very first frame, never appearing or
> morphing mid-clip, with no other ID label or box anywhere on the truck. Gray rainy daylight,
> wet reflective ground, puddles, orange cones, fencing, faint rain streaks on the lens, only
> a slight corner vignette and very mild edge distortion (no strong fisheye), subtle camera
> shake. Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first line
> and a running date-time stamp "2026-10-28 16:04:29" on the second. 10 seconds, 24 fps,
> realistic surveillance look.

## 20 — T2 large tandem, hazardous load

**Filename:** `live-20-tri-axle-hazardous.mp4`
**Truck:** T2 large tandem, FL-DT-8290, certified 24 CY. **Load:** ~55% (~13 CY),
hazardous.

> Fixed CCTV security camera mounted high on a steel gate arch at a hazardous-waste intake
> bay, angled down and forward at about a 48 degree angle, completely locked off: one fixed
> vantage point, no pan, no zoom, no dolly, no orbit. Spill-containment pallets, a drum rack,
> and hazard placards on a low concrete building sit beyond the gate. A big tri-axle dump
> truck drives away from the camera down the containment lane, starting at a slow roll and
> easing up to a modest steady pace, never fast, then gently slowing and following the lane
> into one smooth gentle turn toward the side and off into the distance at the far end; it
> never stops dead, reverses, or swerves, and stays centered between the cones until the
> turn, never touching the cones or the fence. From this high rear vantage the camera looks
> down into the deep bed, about 55 percent full with clearly hazardous material: rusted
> chemical drums, paint and solvent cans, old car batteries, and a pair of propane tanks,
> grouped together below the top of the tall rails and visibly different from ordinary
> debris, with directional daylight showing their shape and depth against the visible walls.
> On the center of the steel rear tailgate is one single white rectangular ID placard reading
> "FL-DT-8290" in bold black text, present and unchanged from the very first frame, never
> appearing or morphing mid-clip, with no other ID label or box anywhere on the truck. Flat
> but directional daylight, stained concrete ground, orange cones, fencing, only a slight
> corner vignette and very mild edge distortion (no strong fisheye), camera micro-shake.
> Burned-in white monospace overlay in the top-left corner: "CAM 01" on the first line and a
> running date-time stamp "2026-10-28 13:28:52" on the second. 10 seconds, 24 fps, realistic
> surveillance look.

## 21 — T1 tandem, partial mixed C&D

**Filename:** `live-21-tandem-partial-cd.mp4`
**Truck:** T1 tandem, FL-DT-6612, certified 22 CY. **Load:** ~55% (~12 CY), C&D.

> Strict camera instruction: use one rigidly mounted, completely fixed CCTV camera for
> the entire clip. The camera must not pan, tilt, zoom, dolly, orbit, track, shake,
> reframe, or change position or angle. Only the truck moves. Mount it high above a
> county transfer-station entry lane, angled down about 50 degrees. A red tandem
> steel-box dump truck drives slowly away between orange cones, then follows one gentle
> curve at the far end without stopping or reversing. From the fixed high rear view,
> show the open bed and its side walls clearly: it is about 55 percent full of broken
> drywall, short lumber offcuts, and small concrete pieces, all below the rails with
> visible gaps and surface shadows. A single white placard centered on the rear
> tailgate reads "FL-DT-6612" in bold black text and remains unchanged and readable
> from the first frame; no other truck labels. Soft directional morning daylight,
> gravel and concrete ground, chain-link fencing, mild CCTV grain. Burned-in white
> monospace overlay at top left: "CAM 01" and "2017-06-14 09:16:08". 10 seconds,
> 24 fps, realistic surveillance footage.

## 22 — T3 roll-off, vegetative debris

**Filename:** `live-22-rolloff-vegetative.mp4`
**Truck:** T3 roll-off, FL-DT-6845, certified 18 CY. **Load:** ~65% (~12 CY),
vegetative.

> Strict camera instruction: the CCTV camera is bolted in place and stays perfectly
> still for the whole clip: no pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or angle change. Only the truck moves. Place it high over a municipal
> yard gate at a steep rear-facing angle, looking down into the container. A blue
> hook-lift truck with a straight-sided open roll-off container drives away at a slow,
> steady pace between cones and makes one smooth turn into the distant lane. Its bed
> is about 65 percent full of leafy branches, short logs, and bundled brush, below the
> top edges; keep the container walls visible and cast shadows between the branches so
> the load depth is clear. One centered white rear-door placard reads "FL-DT-6845"
> in bold black characters, stable and legible from the first frame, with no other
> labels. Overcast daylight, damp gravel, a wood-chip pile in the background, subtle
> sensor grain. Top-left white monospace overlay: "CAM 01" and
> "2020-09-03 10:22:31". 10 seconds, 24 fps, realistic fixed-camera footage.

## 23 — T4 walking-floor, mixed demolition debris

**Filename:** `live-23-walking-floor-demolition.mp4`
**Truck:** T4 walking-floor, FL-DT-9014, certified 32 CY. **Load:** ~60% (~19 CY),
C&D.

> Strict camera instruction: keep the security camera completely stationary and
> locked for all 10 seconds. No pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or change in viewpoint is allowed; only the truck may move. Mount the
> camera above a demolition-site gate, looking down and forward from behind. A long
> walking-floor trailer with high straight side walls rolls away slowly through the
> cone-marked lane and eases into a single gentle turn in the distance. The open top
> stays visible: about 60 percent full with broken brick, concrete fragments, and
> splintered framing lumber, with the uneven load surface below the rails and distinct
> shadows showing depth. Put one white placard reading "FL-DT-9014" in bold black
> text at the center of the rear trailer door; it is present and unchanged from the
> first frame, and no other ID appears. Directional late-morning sunlight, dusty
> ground, excavated structure behind the fence. Fixed top-left CCTV overlay in white
> monospace: "CAM 01" and "2024-04-19 11:03:14". 10 seconds, 24 fps.

## 24 — T1 tandem, asphalt shingles

**Filename:** `live-24-tandem-shingles.mp4`
**Truck:** T1 tandem, FL-DT-9356, certified 20 CY. **Load:** ~85% (~17 CY), roofing
debris.

> Strict camera instruction: the camera is fixed to a concrete gate column and must
> remain absolutely motionless: no pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or viewpoint change. Only the truck moves. Look down at roughly 50
> degrees from a high rear position over a roofing-recovery facility entrance. A
> green tandem steel dump truck drives away slowly along the marked lane, remaining
> between the cones before one smooth distant turn. The bed is about 85 percent full
> of dark asphalt shingles and roofing felt, mounded but still below the bed rails;
> show the side walls and use angled sunlight to define the rough surface and its
> depth. A single centered white tailgate placard reads "FL-DT-9356" in bold black
> text, clearly visible from the first frame and never changing; no extra lettering
> or labels. Bright overcast light, stacks of salvaged roofing material behind the
> fence, realistic mild CCTV noise. Top-left white monospace overlay: "CAM 01" and
> "2019-08-27 11:41:52". 10 seconds, 24 fps, realistic surveillance style.

## 25 — T2 large tandem, screened soil

**Filename:** `live-25-tri-axle-screened-soil.mp4`
**Truck:** T2 large tandem, FL-DT-1182, certified 30 CY. **Load:** ~70% (~21 CY),
screened soil.

> Strict camera instruction: keep a single high-mounted CCTV camera rigidly fixed
> throughout the video. Absolutely no pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or camera-angle change; only the truck moves. At a soil
> processing yard, frame the rear of a large tri-axle steel dump truck from above
> at about 50 degrees. It drives away at a modest slow pace between jersey barriers
> and follows a single gentle curve at the far end. Its deep bed contains roughly
> 70 percent screened brown soil, visibly below the top rails; preserve clear
> visibility of the bed walls and the granular surface with small shadows. A single
> centered white rear-tailgate placard reads "FL-DT-1182" in bold black text, sharp
> from the first frame to the last and not duplicated elsewhere. Directional
> afternoon light, aggregate piles and a conveyor beyond the fence, light dust near
> the tires. Top-left fixed white monospace overlay: "CAM 01" and
> "2022-05-11 12:07:26". 10 seconds, 24 fps.

## 26 — T3 roll-off, overloaded mixed C&D

**Filename:** `live-26-rolloff-overcapacity-cd.mp4`
**Truck:** T3 roll-off, FL-DT-9601, certified 15 CY. **Load:** visibly above the
container walls, capacity exceeded; mixed C&D.

> Strict camera instruction: use a rigidly mounted camera that remains perfectly
> still for the entire clip. No pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or viewpoint change; only the truck moves. From a high rear angle over
> a landfill scale lane, watch a gray hook-lift truck with an open roll-off
> container drive slowly away between fixed concrete barriers, then make one gentle
> turn in the distance. Its construction debris load is unmistakably over capacity:
> broken concrete, twisted metal, drywall, and lumber form a stable-looking mound
> well above the straight container walls, with the raised profile and overhanging
> edges clearly visible. The bed walls remain in view as a comparison. One white
> placard centered on the rear door reads "FL-DT-9601" in bold black text and stays
> unchanged and readable from frame one; no other ID labels. Hard midday light
> casts a clear shadow from the mound. Top-left white monospace overlay: "CAM 01"
> and "2018-11-06 12:38:40". 10 seconds, 24 fps, fixed CCTV look.

## 27 — T1 tandem, over-capacity mixed C&D

**Filename:** `live-27-tandem-overcapacity-cd.mp4`
**Truck:** T1 tandem, FL-DT-3391, certified 20 CY. **Load:** mixed C&D piled
above the rails, capacity exceeded.

> Strict camera instruction: the security camera is fixed and immobile for the
> whole video: no pan, tilt, zoom, dolly, orbit, tracking, shake, reframing, or
> change of angle. Only the truck moves. At night, overhead floodlights illuminate
> a construction-and-demolition transfer yard without leaving it pitch black.
> A yellow tandem dump truck drives slowly away from the high rear-facing camera
> through a cone-lined lane and makes one smooth distant turn. Show the open steel
> bed clearly, with broken concrete, bricks, and lumber piled well above the side
> rails and extending past the bed edges so the overload is unmistakable; the pile's
> surface and the rails must both stay visible. A single white placard fixed at
> the center of the rear tailgate reads "FL-DT-3391" in bold black text, clear
> and unchanged from the first frame. No other writing on the truck. Floodlights
> create clear shadows across the rubble; a concrete crusher and sorted C&D piles
> sit behind the fence. Use cool night color and mild sensor grain. Top-left white monospace
> overlay: "CAM 01" and "2023-03-22 21:19:03". 10 seconds, 24 fps.

## 28 — T4 walking-floor, hollow cardboard load

**Filename:** `live-28-walking-floor-hollow-cardboard.mp4`
**Truck:** T4 walking-floor, FL-DT-4417, certified 30 CY. **Load:** high
cardboard surface with a visibly shallow, hollow center.

> Strict camera instruction: lock the CCTV camera firmly in one position for the
> full clip. It must not pan, tilt, zoom, dolly, orbit, track, shake, reframe, or
> change angle; only the truck moves. At sunset, from a steep high rear view at a
> paper-recycling facility, a long walking-floor trailer rolls away slowly and
> follows one gentle turn at the far end. Its open bed appears nearly full from
> the top, but
> make the center of the load visibly hollow and shallow beneath a loose high layer
> of flattened cardboard; show a depression exposing the lower interior and bed floor so
> surface height and actual depth are visibly inconsistent. Keep the tall side
> walls unobstructed. A single centered white rear placard reads "FL-DT-4417" in
> bold black text, constant and legible from the first frame, with no other truck
> labels. Low golden evening light casts long shadows into the hollow while keeping
> the load readable. Top-left fixed white monospace overlay: "CAM 01" and
> "2021-07-15 18:54:17". 10 seconds, 24 fps.

## 29 — T1 tandem, unreadable placard

**Filename:** `live-29-tandem-unreadable-id.mp4`
**Truck:** T1 tandem, identity intentionally unreadable. **Load:** ~60% (~12 CY)
C&D.

> Strict camera instruction: the CCTV camera is rigidly mounted and stays
> completely fixed for the entire clip. No pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or viewpoint change; only the truck moves. At a county
> construction-waste gate, a blue tandem dump truck drives away slowly between
> cones and makes one gradual turn far down the lane in steady light rain. From above
> and behind, show
> the open steel bed about 60 percent full of broken concrete, drywall, and
> framing scraps, all below the rails with clear surface shadows. Center one
> weathered white rectangular placard on the rear tailgate, but make its printed
> characters genuinely unreadable from dirt and abrasion; do not invent, reveal,
> or change an ID at any point. The placard stays in the same position from frame
> one, with no other labels on the truck. Gray rainy daylight, wet concrete and
> gravel, and small puddles; keep the placard and bed unobscured. Top-left white
> monospace overlay: "CAM 01" and
> "2017-10-02 14:26:39". 10 seconds, 24 fps, realistic CCTV.

## 30 — T3 roll-off, uncertified truck with wood debris

**Filename:** `live-30-rolloff-uncertified-wood.mp4`
**Truck:** T3 roll-off, FL-DT-0000, intentionally absent from the registry.
**Load:** ~50% (~8 CY), clean untreated wood.

> Strict camera instruction: one high-mounted CCTV camera remains entirely fixed
> throughout: no pan, tilt, zoom, dolly, orbit, tracking, shake, reframing, or
> angle change. Only the truck moves. At night, floodlights illuminate a
> reclaimed-building-materials yard. A white hook-lift truck with an open
> roll-off container drives away at a slow,
> even pace between cones, then follows one gentle turn at the far end. The
> container is about 50 percent full of clean untreated lumber offcuts and
> separated wooden boards, below the straight side walls, with visible gaps and
> shadows that reveal the load depth. A single centered white rear-door placard
> reads "FL-DT-0000" in bold black text, fully readable and unchanged from the
> first frame; no other ID labels. Sorted wood stacks sit behind chain-link
> fencing. Keep the placard and load visible under the floodlights, with cool
> night color and mild sensor grain. Top-left white monospace overlay:
> "CAM 01" and "2024-01-30 21:58:02". 10 seconds, 24 fps.

## 31 — T5 compact dump, uncertified salvaged wood

**Filename:** `live-31-compact-uncertified-wood.mp4`
**Truck:** T5 compact dump, FL-DT-5120, intentionally absent from the registry.
**Load:** ~45% (~5 CY), salvaged wood.

> Strict camera instruction: keep the camera rigidly mounted and perfectly
> stationary for all 10 seconds. No pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or viewpoint change; only the truck moves. At a small
> neighborhood transfer-yard entrance, a compact single-rear-axle dump truck
> drives slowly away through a narrow cone-marked lane and eases into one gentle
> turn in the distance. Its shallow open steel bed is about 45 percent full of
> salvaged boards and short timber pieces, below the low rails; show the entire
> bed and its walls from the elevated rear angle so the amount is easy to judge.
> One centered white tailgate placard reads "FL-DT-5120" in bold black text,
> stable and readable from the first frame, with no second ID. Warm evening
> light falls across the yard, compact loaders and sorted material piles in the
> background. Fixed top-left white monospace overlay: "CAM 01" and
> "2020-06-08 18:32:45". 10 seconds,
> 24 fps, realistic surveillance footage.

## 32 — T1 tandem, secured hazardous battery load

**Filename:** `live-32-tandem-hazardous-batteries-night.mp4`
**Truck:** T1 tandem, FL-DT-7788, certified 20 CY. **Load:** ~85% (~17 CY),
secured lead-acid batteries, hazardous.

> Strict camera instruction: the camera is bolted to the gate structure and
> absolutely fixed for the full clip: no pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or change in viewpoint. Only the truck moves. At night, a
> tandem dump truck with its lights on drives away slowly under overhead
> floodlights and follows one smooth distant turn. The elevated rear view clearly
> sees into the steel bed, about 85 percent full of closed, leakproof battery
> transport boxes secured upright on pallets. The boxes are visibly intact,
> tightly restrained, and below the rails; do not show loose batteries, leaks,
> sparks, or spills. Keep the bed walls visible and use floodlight shadows to
> show the box arrangement and fill. One centered white tailgate placard reads "FL-DT-7788" in bold
> black text, lit and unchanged from the first frame; no other ID labels. The
> transfer-yard lane, cones, and fencing are visible and not pitch black. Cooler
> night color, moderate sensor grain, no camera motion. Top-left white monospace
> overlay: "CAM 01" and "2019-12-12 21:18:11". 10 seconds, 24 fps.

## 33 — T4 walking-floor, compost feedstock

**Filename:** `live-33-walking-floor-compost-feedstock.mp4`
**Truck:** T4 walking-floor, FL-DT-7120, certified 35 CY. **Load:** ~75%
(~26 CY), green waste.

> Strict camera instruction: use a completely stationary security camera fixed
> high above the compost-facility gate. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or angle change at any point; only the truck moves.
> In steady rain, a long walking-floor trailer drives slowly away along the
> marked lane and makes one gentle turn into the facility. The open top is clearly visible from the
> rear-downward angle: roughly 75 percent full of chopped green waste, leaves,
> and small branches, with the uneven surface below the rails and shadows across
> it to convey depth. A single white placard centered on the rear door reads
> "FL-DT-7120" in bold black text, legible and unchanged from the first frame;
> no other labels. Gray rainy daylight, wet pavement, and compost windrows and
> a covered conveyor behind the fence; keep the load visible through the rain.
> Fixed top-left white
> monospace overlay: "CAM 01" and "2025-02-20 08:07:36". 10 seconds, 24 fps.

## 34 — T3 roll-off, rainy mixed debris

**Filename:** `live-34-rolloff-rainy-mixed.mp4`
**Truck:** T3 roll-off, FL-DT-8043, certified 16 CY. **Load:** ~60% (~10 CY),
mixed C&D.

> Strict camera instruction: mount the CCTV camera rigidly and keep it perfectly
> still throughout the clip. No pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or viewpoint change; only the truck moves. At a transfer station in
> steady light rain, a gray hook-lift truck drives away slowly between the lane
> markers, then follows one gradual turn in the distance. The open container is
> about 60 percent full of wet lumber, broken drywall, and small masonry pieces,
> below the top of its straight walls. Keep the bed and its walls visible; the
> wet load has distinct ridges and soft shadows so its depth can still be judged.
> A single white placard on the center of the rear door reads "FL-DT-8043" in
> bold black text, readable and unchanged from frame one; no other truck ID.
> Overcast gray daylight, reflective pavement and shallow puddles, no dramatic
> lens effects. Fixed top-left white monospace overlay: "CAM 01" and
> "2018-09-17 10:44:20". 10 seconds, 24 fps.

## 35 — T2 large tandem, flattened cardboard

**Filename:** `live-35-tri-axle-cardboard.mp4`
**Truck:** T2 large tandem, FL-DT-1182, certified 30 CY. **Load:** ~50% (~15 CY),
recyclable cardboard.

> Strict camera instruction: keep a single fixed camera completely motionless
> from beginning to end. No pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or camera-angle change; only the truck moves. From a high rear
> vantage overlooking a materials-recovery facility scale lane, a large tri-axle
> dump truck drives away slowly between painted lines and makes one easy turn
> beyond the scale. Show the steel bed from above, around 50 percent full with
> flattened brown cardboard sheets and compact bundles, all below the rails; keep
> the bed walls visible and the folded layers distinct enough to judge the fill.
> One centered white placard on the rear tailgate reads "FL-DT-1182" in bold
> black text and remains unchanged and clear from the first frame. No other ID
> label. Warm evening light enters the partly covered sorting yard, with conveyor
> structures in the distance and long shadows across the load. Top-left white
> monospace overlay: "CAM 01" and "2022-10-05 18:26:54". 10 seconds, 24 fps.

## 36 — T1 tandem, near-full concrete rubble

**Filename:** `live-36-tandem-near-full-concrete.mp4`
**Truck:** T1 tandem, FL-DT-8290, certified 24 CY. **Load:** ~95% (~23 CY),
concrete rubble, below the rails.

> Strict camera instruction: fix the CCTV camera securely in one position and
> keep it absolutely still for the entire clip. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or viewpoint change; only the truck moves. At a
> concrete recycling plant, a tandem steel dump truck rolls slowly away from
> the high rear-facing camera at night and follows one gentle turn at the end
> of the lane. Its open
> bed is nearly full, about 95 percent, of crushed concrete chunks and pale
> masonry, but every piece remains below the top rails; do not show overflow.
> Keep both bed walls and the full textured surface in view so the near-capacity
> fill is clear. A single centered white rear-tailgate placard reads
> "FL-DT-8290" in bold black text, legible and unchanged from frame one, with no
> other ID. Bright overhead floodlights define the rubble shadows and keep the
> scene visible, not pitch black. Top-left white monospace overlay: "CAM 01" and
> "2023-05-16 21:02:18". 10 seconds, 24 fps.

## 37 — T3 roll-off, low-fill white goods

**Filename:** `live-37-rolloff-low-fill-white-goods.mp4`
**Truck:** T3 roll-off, FL-DT-5590, certified 15 CY. **Load:** ~35% (~5 CY),
white goods.

> Strict camera instruction: the camera is fixed in place and must not move at
> all: no pan, tilt, zoom, dolly, orbit, tracking, shake, reframing, or change
> of angle during the clip. Only the truck moves. At a municipal bulky-waste
> intake lane, a blue hook-lift truck with an open roll-off container drives
> slowly away from the elevated rear camera and makes a single gentle turn in the
> distance in steady rain. The container is only about 35 percent full, holding
> a refrigerator door, a washing-machine shell, and a small water heater separated by visible
> open spaces; all items sit well below the straight walls. Make the low fill and
> gaps unambiguous from above. One centered white rear-door placard reads
> "FL-DT-5590" in bold black text and stays clear and unchanged from the first
> frame; no other truck labels. Gray rainy daylight, wet concrete, and sorting
> bays in the background; keep the items clearly visible despite the rain.
> Fixed top-left white monospace overlay: "CAM 01" and
> "2021-04-08 13:17:43". 10 seconds, 24 fps.

## 38 — T4 walking-floor, over-capacity brush

**Filename:** `live-38-walking-floor-overcapacity-brush.mp4`
**Truck:** T4 walking-floor, FL-DT-9014, certified 32 CY. **Load:** visibly
heaped above the side walls, capacity exceeded; brush.

> Strict camera instruction: use a rigid, fixed CCTV camera with absolutely no
> movement for the full duration: no pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or viewpoint change. Only the truck moves. At a regional
> storm-cleanup site, a long walking-floor trailer drives slowly away down a
> wide lane between cones and makes one gradual turn far away. The very long
> open-top bed carries an unmistakably excessive mound of branches and leafy
> brush, rising well above the straight side walls and spilling visibly over
> both sides. Show the wall tops and the mound together from the elevated rear
> angle so the excess height is clear. One white placard centered on the rear
> trailer door reads "FL-DT-9014" in bold black text, stable and legible from
> the first frame; no extra ID labels. Warm evening light and work lamps create
> clear branch shadows, with cleanup equipment beyond the fence. Fixed top-left
> white monospace overlay: "CAM 01" and "2017-08-24 18:01:09". 10 seconds, 24 fps.

## 39 — T1 tandem, low-fill C&D

**Filename:** `live-39-tandem-low-fill-cd.mp4`
**Truck:** T1 tandem, FL-DT-6612, certified 22 CY. **Load:** ~25% (~6 CY), C&D.

> Strict camera instruction: keep the camera rigidly mounted and completely
> stationary for the entire video. No pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or angle change; only the truck moves. At a small demolition
> transfer gate, a white tandem steel-box dump truck travels slowly away from
> the high rear camera between orange cones and follows one gentle turn at night
> under bright floodlights. Its bed is only about 25 percent full, with a shallow
> layer of broken brick, short lumber pieces, and drywall scraps collected at the front half;
> leave most of the bed floor visibly empty and keep both side walls in view.
> A single centered white tailgate placard reads "FL-DT-6612" in bold black
> text, clearly readable from the first frame and unchanged throughout; no
> other ID. Floodlights create small shadows across the sparse load. Keep the
> yard clearly visible, not pitch black, with mild sensor grain. Fixed top-left
> white monospace overlay: "CAM 01" and
> "2024-06-13 21:39:55". 10 seconds, 24 fps.

## 40 — T3 roll-off, secured hazardous materials

**Filename:** `live-40-rolloff-hazardous-materials.mp4`
**Truck:** T3 roll-off, FL-DT-9601, certified 15 CY. **Load:** ~45% (~7 CY),
hazardous materials.

> Strict camera instruction: the CCTV camera is firmly mounted and stays
> completely motionless for all 10 seconds. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or viewpoint change; only the truck moves. At a
> permitted hazardous-materials receiving facility, a hook-lift truck with an
> open roll-off container drives slowly away in steady light rain between marked
> barriers and makes one smooth distant turn. From the high rear view, show the container about
> 45 percent full of a few closed, secured chemical drums and sealed battery
> totes, upright and separated with visible gaps, all below the container walls.
> Keep the load surface and straight walls clear enough to judge both content
> and fill. One centered white rear-door placard reads "FL-DT-9601" in bold
> black text, legible and unchanged from frame one; no other truck ID. Strong
> overcast rainy daylight, wet pavement, a spill-response station and warning
> signs in the background, no spills or unsafe activity. Fixed top-left white monospace overlay: "CAM 01"
> and "2020-03-29 15:12:27". 10 seconds, 24 fps.

## 41 — T1 tandem, separated recyclable materials

**Filename:** `live-41-tandem-recyclables.mp4`
**Truck:** T1 tandem, FL-DT-6612, certified 22 CY. **Load:** ~50% (~11 CY),
recyclable materials.

> Strict camera instruction: the CCTV camera is bolted in place and remains
> perfectly still for the entire clip. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or angle change; only the truck moves. At a
> materials-recovery facility entrance, a blue tandem steel-box dump truck
> drives slowly away between lane cones and follows a single gentle turn in the
> distance. From the elevated rear view, show the open bed about 50 percent full
> of separated recyclable material: flattened cardboard, short clean lumber
> pieces, and a few rigid plastic containers. Keep all items below the rails,
> clearly distinguishable, and separated enough to show the load surface and
> bed walls. One white placard centered on the tailgate reads "FL-DT-6612" in
> bold black text and remains unchanged and readable from frame one; no other
> truck labels. Warm evening light enters the sorting facility, casting long
> shadows across the load. Fixed top-left white monospace overlay: "CAM 01" and
> "2018-05-14 18:42:16". 10 seconds, 24 fps.

## 42 — T3 roll-off, nearly full green waste

**Filename:** `live-42-rolloff-near-full-green-waste.mp4`
**Truck:** T3 roll-off, FL-DT-6845, certified 18 CY. **Load:** ~90% (~16 CY),
green waste, below the walls.

> Strict camera instruction: use one rigidly mounted, completely stationary
> security camera. It must not pan, tilt, zoom, dolly, orbit, track, shake,
> reframe, or change position or angle at any time; only the truck moves. At a
> city compost yard at night, lit by overhead floodlights so the scene is clear,
> not pitch black. A dark green hook-lift truck with a straight-sided open roll-off
> container moves slowly away through the marked lane, then makes one
> gentle turn at the far end. Its container is nearly full, around 90 percent,
> with compacted leaves, short branches, and chipped brush sitting just below
> the wall tops; do not show overflow. Keep the full container opening and both
> side walls visible from above, with shadows that show the uneven depth. One
> centered white rear-door placard reads "FL-DT-6845" in bold black text,
> visible and unchanged from the first frame; no other ID. Cool night color and
> mild sensor grain; compost windrows and a loader remain
> visible behind the fence. Fixed white monospace top-left overlay: "CAM 01" and
> "2023-10-09 21:24:37". 10 seconds, 24 fps.

## 43 — T4 walking-floor, low-fill demolition debris

**Filename:** `live-43-walking-floor-low-fill-demo.mp4`
**Truck:** T4 walking-floor, FL-DT-9014, certified 32 CY. **Load:** ~30%
(~10 CY), C&D.

> Strict camera instruction: the camera remains rigidly fixed and motionless
> for the full clip: no pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or viewpoint change. Only the truck may move. At a demolition
> recycling gate in steady rain, a long walking-floor trailer rolls slowly away
> from the high rear camera and follows one smooth gradual turn at the distant end.
> Its long open bed is only about 30 percent full with a shallow layer of
> broken brick, lumber offcuts, and small concrete pieces gathered near the
> center; most of the bed floor remains visibly empty. Keep the full bed and
> high side walls in frame so the low fill is easy to assess. A single centered
> white rear-door placard reads "FL-DT-9014" in bold black text, legible and
> unchanged from frame one; no other ID labels. Gray rainy daylight creates
> soft shadows across the sparse debris. Show wet pavement and small puddles
> without obscuring the load. Fixed top-left white monospace overlay: "CAM 01"
> and "2019-02-26 10:11:05". 10 seconds, 24 fps.

## 44 — T1 tandem, wet asphalt millings

**Filename:** `live-44-tandem-asphalt-millings-rain.mp4`
**Truck:** T1 tandem, FL-DT-9356, certified 20 CY. **Load:** ~70% (~14 CY),
asphalt millings, rainy conditions.

> Strict camera instruction: keep the CCTV camera firmly mounted and absolutely
> still throughout. No pan, tilt, zoom, dolly, orbit, tracking, shake,
> reframing, or camera-angle change; only the truck moves. At a road-repair
> materials yard in light rain, a gray tandem dump truck drives slowly away
> between cones and eases into a single gentle turn. From the high rear angle,
> show its steel bed about 70 percent full of dark, damp asphalt millings,
> below the top rails. The bed walls and textured surface must remain visible,
> with soft shadows and small highlights on the wet aggregate to communicate
> depth. One white placard centered on the rear tailgate reads "FL-DT-9356"
> in bold black text, readable and unchanged from the first frame; no other
> truck ID. Overcast daylight, wet pavement, subtle rain in the background,
> no raindrops obscuring the view. Fixed top-left white monospace overlay:
> "CAM 01" and "2025-11-18 11:03:48". 10 seconds, 24 fps.

## 45 — T2 large tandem, overfilled soil

**Filename:** `live-45-tri-axle-overcapacity-soil.mp4`
**Truck:** T2 large tandem, FL-DT-1182, certified 30 CY. **Load:** soil piled
clearly above the rails, capacity exceeded.

> Strict camera instruction: mount the camera rigidly above the scale lane and
> keep it completely fixed for all 10 seconds. No pan, tilt, zoom, dolly,
> orbit, tracking, shake, reframing, or change in viewpoint; only the truck
> moves. At dusk, a large tri-axle dump truck drives slowly away through an aggregate
> yard, centered between fixed barriers, then makes one gentle turn at the
> far end. Its deep steel bed contains a clearly excessive mound of dark soil
> that rises well above the side rails and visibly bulges over the edges.
> Show the rail tops and the mound together from the elevated rear view so
> the over-capacity condition is unmistakable. The soil remains contained
> without falling from the vehicle. One centered white tailgate placard reads
> "FL-DT-1182" in bold black text, stable and legible from the first frame;
> no additional labels. Low evening sunlight and yard lamps define the mound's
> height while keeping it easy to inspect. Fixed top-left white monospace overlay:
> "CAM 01" and "2017-04-21 18:47:22". 10 seconds, 24 fps.

## 46 — T3 roll-off, hollow cardboard load

**Filename:** `live-46-rolloff-hollow-cardboard.mp4`
**Truck:** T3 roll-off, FL-DT-9601, certified 15 CY. **Load:** high surface
with a visibly shallow, hollow center.

> Strict camera instruction: the camera is fixed in one position and must
> remain absolutely motionless: no pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or angle change. Only the truck moves. At a recycling
> center's gate in steady rain, an orange hook-lift truck drives slowly away with its open
> roll-off container visible from the high rear angle, then follows one
> gentle turn. The container appears nearly full at the edges with loose,
> flattened cardboard, but the center is visibly hollow and shallow: show
> a broad depression with the lower interior visible beneath a thin raised
> layer, making surface height and actual depth inconsistent. Keep the
> straight side walls unobstructed. A single centered white rear-door
> placard reads "FL-DT-9601" in bold black text and stays unchanged and
> readable from frame one; no other ID. Gray rainy daylight, wet container
> walls, and puddles beside the lane; keep the hollow clearly visible. Fixed
> top-left white monospace overlay: "CAM 01" and "2022-07-07 12:28:09".
> 10 seconds, 24 fps.

## 47 — T1 tandem, night-time concrete rubble

**Filename:** `live-47-tandem-concrete-night.mp4`
**Truck:** T1 tandem, FL-DT-8290, certified 24 CY. **Load:** ~75% (~18 CY),
concrete rubble.

> Strict camera instruction: the gate camera is bolted down and entirely
> motionless from first frame to last. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or viewpoint change; only the truck moves.
> At night, a tandem steel dump truck with headlights and tail lights on
> drives slowly away beneath bright overhead floodlights and follows one
> gradual turn in the distance. Show its bed from above and behind, about
> 75 percent full of broken concrete chunks, below the rails with visible
> side walls and shadows between the rubble. Keep the load clear under the
> lights; the yard must not be pitch black. One centered white placard on
> the tailgate reads "FL-DT-8290" in bold black text, illuminated and
> unchanged from frame one; no other truck labels. Cool night color and
> realistic sensor grain, but absolutely no camera shake. Fixed top-left
> white monospace overlay: "CAM 01" and "2020-12-03 21:16:54". 10 seconds,
> 24 fps.

## 48 — T4 walking-floor, over-capacity demolition rubble

**Filename:** `live-48-walking-floor-overcapacity-rubble.mp4`
**Truck:** T4 walking-floor, FL-DT-7120, certified 35 CY. **Load:** mixed
demolition rubble piled above the walls, capacity exceeded.

> Strict camera instruction: keep the camera rigidly mounted and perfectly
> still for the complete clip. No pan, tilt, zoom, dolly, orbit, tracking,
> shake, reframing, or angle change; only the truck moves. At a concrete
> recycling facility, a long walking-floor trailer drives slowly away
> through a wide lane and makes one smooth turn far beyond the scale. Its
> open-top bed carries an unmistakably overloaded mound of broken masonry,
> brick, and concrete chunks, rising well above the tall side walls and
> extending beyond the bed edges. The mound and wall tops remain clearly
> visible together from the elevated rear position. One centered white
> placard on the rear trailer door reads "FL-DT-7120" in bold black text,
> sharp and unchanged from the first frame; no other truck ID. Warm late-evening
> light and work lamps define the pile's height, with a crusher and sorted
> aggregate behind the fence. Fixed top-left white monospace overlay: "CAM 01" and
> "2024-09-25 18:53:40". 10 seconds, 24 fps.

## 49 — T3 roll-off, clean wood-only load

**Filename:** `live-49-rolloff-clean-wood.mp4`
**Truck:** T3 roll-off, FL-DT-8043, certified 16 CY. **Load:** ~80% (~13 CY),
clean untreated wood.

> Strict camera instruction: use one fixed CCTV viewpoint, rigidly mounted
> and completely still for all 10 seconds. No pan, tilt, zoom, dolly, orbit,
> tracking, shake, reframing, or camera-angle change; only the truck moves.
> At a reclaimed lumber facility, a blue hook-lift truck with an open
> straight-sided container drives slowly away between lane markings and
> makes one easy distant turn. The container is about 80 percent full of
> clean untreated boards, broken pallets, and short timber offcuts, all
> below the wall tops. Show visible gaps between pieces and clear side
> walls so the fill and material are easy to inspect. A single centered
> white rear-door placard reads "FL-DT-8043" in bold black text and stays
> legible and unchanged from the first frame; no other ID labels. Light rain
> falls over wet pavement and neat lumber stacks behind a chain-link fence;
> the container and load remain unobscured. Fixed top-left white monospace
> overlay: "CAM 01" and
> "2018-03-12 09:36:12". 10 seconds, 24 fps.

## 50 — T1 tandem, mixed storm debris

**Filename:** `live-50-tandem-storm-debris.mp4`
**Truck:** T1 tandem, FL-DT-7788, certified 20 CY. **Load:** ~65% (~13 CY),
mixed storm debris.

> Strict camera instruction: the security camera is fixed firmly to the
> gate structure and remains absolutely motionless for the whole clip:
> no pan, tilt, zoom, dolly, orbit, tracking, shake, reframing, or
> viewpoint change. Only the truck moves. At a municipal storm-cleanup
> drop-off site at night, a red tandem dump truck drives slowly away along
> a cone-lined lane under overhead floodlights, then follows one gentle
> curve in the distance. Its open steel bed is about 65 percent full
> of leafy branches, short fence boards, and small roof-shingle pieces,
> all below the rails; keep the side walls visible and the mixed debris
> distinct, with shadows showing its depth. One centered white tailgate
> placard reads "FL-DT-7788" in bold black text, clear and unchanged
> from the first frame; no other truck labels. Keep the bed clearly visible,
> not pitch black, with cool night color, sensor grain, damp ground, and sorted
> storm debris in the background. Fixed top-left white monospace overlay:
> "CAM 01" and "2021-08-30 21:18:37". 10 seconds,
> 24 fps.

---

## Prompt index

| # | Truck type | Registry ID (capacity) | Debris class | Fill | Anomaly | Mode |
|---|---|---|---|---|---|---|
| R1 | gate entry (day) | — | — | — | realism/setup | any |
| R2 | gate entry (night) | — | — | — | realism/setup | any |
| R3 | overhead bed scan (day) | FL-DT-3391 (20) | C&D | depth-lit | realism/setup | any |
| R4 | overhead bed scan (night) | FL-DT-3391 (20) | C&D | depth-lit | realism/setup | any |
| 1 | T1 tandem | FL-DT-3391 (20) | C&D | ~90% | none | mock fixture |
| 2 | T1 tandem | FL-DT-2204 (25) | Vegetative | ~40% | none | mock fixture |
| 3 | T4 walking-floor | FL-DT-4417 (30) | Vegetative | surface high | surface_depth_mismatch | mock fixture |
| 4 | T1 tandem | (unreadable) | C&D | ~55% | identity_unreadable | mock fixture |
| 5 | T1 tandem | FL-ZZ-0000 (none) | Vegetative | ~70% | uncertified_truck | mock fixture |
| 6 | — | — | — | — | empty footage | mock fixture |
| 7 | T2 large tandem | FL-DT-1182 (30) | Vegetative | ~90% | none | live |
| 8 | T3 roll-off | FL-DT-5590 (15) | C&D | ~85% | none | live |
| 9 | T4 walking-floor | FL-DT-7120 (35) | Vegetative | ~80% | none | live |
| 10 | T5 compact dump | FL-DT-5120 (~12) | Other | ~45% | none | live |
| 11 | T3 roll-off | FL-DT-8043 (16) | White goods | ~70% | none | live |
| 12 | T1 tandem | FL-DT-7788 (20) | Hazardous | ~40% | none | live |
| 13 | T3 roll-off | FL-DT-9601 (15) | C&D | >100% | capacity_exceeded | live |
| 14 | T2 large tandem | FL-DT-1182 (30) | Vegetative | >100% | capacity_exceeded | live |
| 15 | T4 walking-floor | FL-DT-9014 (32) | Vegetative | surface high | surface_depth_mismatch | live |
| 16 | T1 tandem | (unreadable) | C&D | ~60% | identity_unreadable | live |
| 17 | T5 compact dump | FL-DT-0000 (none) | White goods | ~50% | uncertified_truck | live |
| 18 | T1 tandem | FL-DT-4408 (~20) | C&D | ~80% | none (night) | live |
| 19 | T3 roll-off | FL-DT-6845 (18) | C&D | ~55% | none (rain) | live |
| 20 | T2 large tandem | FL-DT-8290 (24) | Hazardous | ~55% | none (haz intake) | live |
| 21 | T1 tandem | FL-DT-6612 (22) | C&D | ~55% | none | live |
| 22 | T3 roll-off | FL-DT-6845 (18) | Vegetative | ~65% | none | live |
| 23 | T4 walking-floor | FL-DT-9014 (32) | C&D | ~60% | none | live |
| 24 | T1 tandem | FL-DT-9356 (20) | Roofing debris | ~85% | none | live |
| 25 | T2 large tandem | FL-DT-1182 (30) | Soil | ~70% | none | live |
| 26 | T3 roll-off | FL-DT-9601 (15) | C&D | >100% | capacity_exceeded | live |
| 27 | T1 tandem | FL-DT-3391 (20) | Vegetative | >100% | capacity_exceeded | live |
| 28 | T4 walking-floor | FL-DT-4417 (30) | Vegetative | surface high, depth low | surface_depth_mismatch | live |
| 29 | T1 tandem | (unreadable) | C&D | ~60% | identity_unreadable | live |
| 30 | T3 roll-off | FL-DT-0000 (none) | Wood | ~50% | uncertified_truck | live |
| 31 | T5 compact dump | FL-DT-5120 (none) | Wood | ~45% | uncertified_truck | live |
| 32 | T1 tandem | FL-DT-7788 (20) | Vegetative | ~65% | none (night) | live |
| 33 | T4 walking-floor | FL-DT-7120 (35) | Vegetative | ~75% | none | live |
| 34 | T3 roll-off | FL-DT-8043 (16) | C&D | ~60% | none (rain) | live |
| 35 | T2 large tandem | FL-DT-1182 (30) | Cardboard | ~50% | none | live |
| 36 | T1 tandem | FL-DT-8290 (24) | Concrete | ~95% | none | live |
| 37 | T3 roll-off | FL-DT-5590 (15) | White goods | ~35% | none | live |
| 38 | T4 walking-floor | FL-DT-9014 (32) | Vegetative | >100% | capacity_exceeded | live |
| 39 | T1 tandem | FL-DT-6612 (22) | C&D | ~25% | none | live |
| 40 | T3 roll-off | FL-DT-9601 (15) | Hazardous | ~45% | none | live |
| 41 | T1 tandem | FL-DT-6612 (22) | Recyclables | ~50% | none | live |
| 42 | T3 roll-off | FL-DT-6845 (18) | Vegetative | ~90% | none | live |
| 43 | T4 walking-floor | FL-DT-9014 (32) | C&D | ~30% | none | live |
| 44 | T1 tandem | FL-DT-9356 (20) | Asphalt millings | ~70% | none (rain) | live |
| 45 | T2 large tandem | FL-DT-1182 (30) | Soil | >100% | capacity_exceeded | live |
| 46 | T3 roll-off | FL-DT-9601 (15) | Cardboard | surface high, depth low | surface_depth_mismatch | live |
| 47 | T1 tandem | FL-DT-8290 (24) | Concrete | ~75% | none (night) | live |
| 48 | T4 walking-floor | FL-DT-7120 (35) | C&D | >100% | capacity_exceeded | live |
| 49 | T3 roll-off | FL-DT-8043 (16) | Wood | ~80% | none | live |
| 50 | T1 tandem | FL-DT-7788 (20) | Mixed storm debris | ~65% | none | live |

> Registry note: IDs in prompts 1–9, 11–16, and 19–20 exist in `backend/seed.json`
> with the capacity shown. Prompts 10 and 18 use IDs not in the seed (FL-DT-5120,
> FL-DT-4408); under the live pipeline they will read as uncertified unless you add
> them to the registry first. Prompts 5, 17, 30, and 31 use intentionally absent
> IDs to trigger the uncertified-truck path. Prompts 21–28 and 32–40 reuse seeded
> IDs; prompt 29 intentionally has no readable identity. Prompts 41–50 reuse
> seeded IDs from prompts 21–40. Adjust any placard string to match your seed data
> if you change it.

## Recommended 3-minute demo order

Six clips in a clean arc that moves from "it works" to "it catches fraud, and it
knows when not to guess." Each clip is 10 seconds; the rest of the three minutes is
the review console (the money frame, the flag, the dollar delta) and a word of
narration per ticket. The first five are mock-fixture clips, so the ticket numbers
are guaranteed on stage; clip 4 is the one live-pipeline moment.

| Order | Clip | Prompt | What it proves |
|---|---|---|---|
| 1 | `clean-partial-veg__demo.mp4` | 2 | Baseline. A normal partial vegetative load drafts a clean ticket, no flags. Sets the "this is what right looks like" anchor. |
| 2 | `clean-full-cd__demo.mp4` | 1 | A full C&D load near capacity is still clean. Shows the fill-% read tracking a heavy, legitimate load. |
| 3 | `hollow-load__demo.mp4` | 3 | The signature catch. A fluffed load trips `surface_depth_mismatch`; the monitor sees the surface-vs-depth flag and the dollar delta it would have overpaid. |
| 4 | `live-13-rolloff-overcapacity.mp4` | 13 | The live moment. A roll-off heaped past its walls trips `capacity_exceeded`, the biggest single dollar story, computed live from the pixels. |
| 5 | `uncertified-truck__demo.mp4` | 5 | A truck that is not in the registry trips `uncertified_truck`, so an unknown hauler cannot get paid. |
| 6 | `low-confidence-placard__demo.mp4` | 4 | Knowing when not to guess. An unreadable placard makes the pipeline fail loud and ask for a manual identity instead of inventing one. |

Keep `no-truck__demo.mp4` (prompt 6) on hand as a backup beat: the pipeline produces
nothing on empty footage rather than hallucinating a load. If you want a second live
clip, `live-14-tri-axle-overcapacity-veg.mp4` (prompt 14) shows the same
capacity-exceeded story on a big tandem.

Why these six: they cover a clean baseline, both a full and a partial legitimate
load, all three of the anomalies that carry a dollar delta or block payment
(`surface_depth_mismatch`, `capacity_exceeded`, `uncertified_truck`), and the
fail-loud identity path, while spanning three truck types (tandem, roll-off,
walking-floor) and three debris classes (vegetative, C&D). The night, rain, dust,
hazardous, white-goods, and low-fill clips (10–50) are the breadth reel for a
longer walkthrough or the showcase, not the three-minute cut.
