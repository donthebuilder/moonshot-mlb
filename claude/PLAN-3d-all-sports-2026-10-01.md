# PLAN — one 3D world, three sports · 2026-10-01

> **ADAPTED 2026-10-01 (Claude Code, Donovan: "adapt and run all 5", push each batch when green).**
> This plan predates queue 0e (61486c6), which fused the field: `FieldChart.js`, `TouchMap.js`,
> `MatchupMap.js` and `DvpDrift.js` are gone. Read every NFL step against what replaced them:
> **The Field = `components/nfl/TheField.js`**, its model = **`lib/nfl/fieldModel.js`**
> (was `MatchupMap.js:191`). `ChartFrame` had 3 importers left (Picks, SlateGaps, SlateRibbon),
> not 7. The component map and BATCH-COMPONENT-REUSE docs this cites are not in the repo.

```
BATCH-2D-CORE      claude/PLAN-3d-all-sports-2026-10-01.md §1  flags: core, one frame, one red-zone picture
BATCH-3D-CAMERA    §2  MLB stadium: azimuth clamp, sweep test, StadiumShell (fullscreen + presets)
BATCH-ARENA-SPLIT  §3  buildArena out of buildPark, pixel-parity script, no visible change
BATCH-NHL-3D       §4  LAMP: the rink in the arena
BATCH-NFL-3D       §5  TUDDY: the field in the stadium
```

Donovan's brief (2026-10-01): "I want the NHL and NFL to do the same thing MLB did — have a 3D map.
The thing with the MLB 3D spray chart is the stadium: when you move to a certain angle you're in the
stands behind home plate and you see nothing, and rotating is hard on mobile because the chart is so
small. The goal is all the main sports with a good 3D model and heat chart. NHL can be just as fire and
intuitive as MLB, same with NFL — but let's not forget making the 2D top tier too." Order: flags → MLB
3D fix → arena split → NHL 3D → NFL 3D. Phone: full-screen takeover with preset views. NHL before NFL.
Donovan's answers: the grid-background frame goes; the 3D honesty limits in §4/§5 are fine; NHL and NFL
both get built, ready to be made better after.

Standing rules for every batch:
- MOONSHOT's components are the base; NHL and NFL reuse, never re-draw by eye. MOONSHOT stays
  pixel-identical unless the batch says otherwise.
- NEVER INVENT DATA. A 3D mark sits where the published number puts it. An unpublished dimension (puck
  height, pass arc height, side-to-side spot of a red-zone touch, where in a lane a target landed) is NOT
  drawn as if known, and the caption says what the picture is and is not.
- The 2D chart never leaves. 3D is `next/dynamic` + `ssr:false`, behind `webglOk()`, replacing the 2D
  only while open and only when WebGL draws.
- Phone first (390). No new hex (theme tokens). No new polling, crons or stored data. check-routes,
  check-scales, check-mobile, check-clickable green on every page touched.

## §1 BATCH-2D-CORE · the flags
1. Rink onto the core: ShotPanel wraps Rink in ChartCard (LAMP theme), ChartLegend built from what is
   drawn (the hand-written legend at Rink.js moves into it), ChartEmpty for loading / delayed / no shots.
   Rink's SVG unchanged. ShotPanel (and other importers) import ChipGroup from components/charts; delete
   components/matchup/SprayParts.js once nothing imports it.
2. One per-touch red-zone picture: RedZoneDots keeps its page shape but its field becomes RedZoneStrip
   rows instead of FootballField mode='redzone'; delete the redzone mode from FootballField.js (the "fixed
   spread by order" block) — nothing draws a touch at an unpublished side-to-side spot. RedZoneField
   (per-game RZ/GL bars) stays as the no-plays fallback in tabs/RedZone.js only.
3. One frame: ChartCard replaces ChartFrame in its importers (NFL theme + accent); delete ChartFrame.js
   (grid, corner brackets, edge ticks, bloom go). Carry a `live` prop into ChartCard if a chart needs the
   status rail. Last within the batch.
4. CLAUDE.md, one line under Design: the 3D views load with next/dynamic; a grep finding no importers
   does not mean they are dead.
5. Check (not a change): curl -sI .../nfl_field_NO.json -> 200, or say so.
Prove it: build; check-scales; check-mobile + check-clickable on nhl shotmap, nfl redzone, nfl matchups,
the NFL player card; screenshots 1280 + 390 (red zone with plays present and absent), Matchups before/after.

## §2 BATCH-3D-CAMERA · fix the MLB stadium before cloning it
Why: SprayFieldStadium clamps polar and distance but not azimuth, with the orbit target mid-field; swing
to the backstop side and the camera sits inside the DoubleSide bowl ("you see nothing"). On a phone the
canvas is 390 x 340 and rotateSpeed 0.55 was tuned for a 780px panel.
1. Azimuth clamp (min/maxAzimuthAngle, +-100 deg around the broadcast opening angle); zone map: never
   behind the backstop.
2. scripts/check-3d-view.mjs: headless, 12 azimuths x 3 distances x 2 polar; every frame >= 15% "field
   pixels" or print the failing view and exit 1. Run on both MLB views and every 3D view after.
3. components/charts/StadiumShell.js (shared): full screen on a coarse pointer (fixed, 100dvh, above the
   tab bar, body scroll locked, close, renderer resized via ResizeObserver); preset chips 44px (spray:
   PRESS BOX / PLATE / OUTFIELD / TOP; zone: MOUND / CATCHER / SIDE / TOP; ~600 ms through the damping);
   rotateSpeed x 780/canvasWidth; the live/replay/hold/orbit chip row as a slot above the presets. No
   scene code in the shell. Inline size stays max(340, 0.6W).
Prove it: sweep green at 1280 + fullscreen 390; phone screenshot per preset; open -> rotate -> close
restores scroll; check-mobile; desktop before/after identical except the chip rows.

## §3 BATCH-ARENA-SPLIT · the arena out of the ballpark (no visible change)
1. lib/arena.js buildArena(scene, { footprint, lights, roof }): sky dome or roof, light rig + towers,
   bowl + crowd + fascia, fog. footprint { kind: 'fan', ... } (the existing bowl path moved VERBATIM) or
   { kind: 'rect', w, l, cornerR, tiers }.
2. buildPark() keeps the ballpark and calls buildArena({ footprint: fan }) where the bowl code was.
3. scripts/check-3d-parity.mjs: 3 parks (Fenway, Coors, Great American) x both views x 2 presets, before
   (origin/main in a worktree; no git stash) and after; pixel diff < 0.5% per frame or exit 1. Kept for
   the NHL/NFL batches.
Prove it: parity green; build; the MLB 3D chunk within 2% of before.

## §4 BATCH-NHL-3D · THE ARENA (LAMP)
Toggle 🏟 ARENA beside DOTS / HEAT in ShotPanel; opens in StadiumShell; the 2D rink stays.
Data (existing): /api/lamp/shots map.recent (last 200: x, y, result, shot_type, strength, period,
period_type, time_s, game_date, miss_reason), map.grid 5x5 {att, sog, g}, SLOT, GRID; attack x > 0. The
3D gets the SAME filtered list as the 2D.
Files: lib/rinkWorld.js buildRink (200 x 85 ft, 28 ft corners, boards + glass, red line, blue lines +-25,
goal lines +-89, creases, faceoff circles + dots at (+-69, +-22) and neutral dots, nets — league feet, the
numbers Rink.js and shotMap.js use), components/lamp/RinkArena.js (next/dynamic), ShotPanel, Rink (toggle).
1. buildArena({ rect 85 x 200, cornerR 28, roof: true }) + buildRink; goals C.lamp emissive, on-net
   C.ice, misses/blocks dim hollow rings.
2. Marks: a puck disc per attempt (Rink.js colour rule). HEAT: the 5x5 grid as tiles shaded by rampAt,
   same cells and ramp as 2D; the slot shaded.
3. Lines on the ice: goal/sog to the net mouth; miss wide/high/iron to the goal line; block a short stub.
   NO puck height; caption: "lines run from the shot to the net along the ice — not tracked puck paths".
   Chips: REPLAY · HOLD · ORBIT. No LIVE (shots are written at grade time).
4. Presets BEHIND THE NET · BLUE LINE · RAFTERS · TOP; opening BLUE LINE; azimuth clamp in the
   attacking half's seats.
5. Tap a puck -> the same detail as the 2D; tap a tile -> its counts.
6. Nothing LAMP-only that MOONSHOT / the core already draws.
Prove it: sweep green (club + skater, 1280 + fullscreen 390); parity green; phone presets; 3D count = 2D
"n of the last 200"; check-mobile + check-clickable; no new hex; no new fetch.

## §5 BATCH-NFL-3D · THE STADIUM (TUDDY) — retargeted to TheField.js
Toggle 🏟 STADIUM in The Field (player card and Matchups TEAM mode); opens in StadiumShell; the 2D stays.
Data (existing): nfl_field_{TEAM}.json targets (air, lane L/M/R, res, yl, wk, opp) and redzone[] (d,
kind, res); the defence's leak from lib/nfl/fieldModel.js. Lane is a THIRD of the field, not a point.
Files: lib/fieldWorld.js buildField (120 x 53.3 yd, end zones, yard lines + numbers, hashes, goal posts,
benches), components/nfl/FieldArena.js (next/dynamic), components/nfl/TheField.js (toggle + same rows).
1. buildArena({ rect 160 x 360, cornerR 40, roof: false }) + buildField.
2. The 12 pass zones painted on the turf with TheField's alpha rule from the same fieldModel().
3. Targets at true depth (LOS + air) inside their lane; across the lane NOT published: three fixed
   columns per lane, stacked by order; caption: "a target's lane is known, its exact spot across the field
   is not". A line on the turf LOS -> mark (no arc; caption says so). Red-zone touches at their yard line
   in the player's lane.
4. REPLAY · HOLD · ORBIT; presets SIDELINE · END ZONE · ALL-22 · TOP; azimuth clamp; no LIVE.
5. Same reuse rule.
Prove it: as NHL.

## 2D TOP TIER (after the five)
1. A "how to read this" panel on the rink and The Field (lift SprayField's).
2. Vs a typical player on the rink (needs a league aggregate in lib/nhl/shotMap.js).
3. A tonight layer — a write-every-tick cost question Donovan decides first.
4. One legend from what is drawn — done in §1.

## Not in this plan, on purpose
HotZoneMap.js deletion (reuse plan R1); a live layer; arena props / scoreboard; photo textures; per-arena
geometry.
