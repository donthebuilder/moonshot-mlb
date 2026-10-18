// WHERE THE MEN STAND ON THE FIELD (2026-10-17, path item 3: one chart, the zones AND the players). The men come from lib/nfl/whoLines.js
// (placeOffense / placeDefense); this puts each at a spot in BroadcastField's own 300-wide viewBox, so the 2D chart and the 3D one (GameArena)
// can never disagree about where a man is. Left / middle / right are the offence's view, up the page at the defence.
//   pass: the line of scrimmage is y = 236; receivers and tight ends stand ON it (outermost first), corners just above it, the QB and the backs
//         in one row behind it (the second back beside the first).   run: the backs and the QB behind the line, side -> gap.
// A spot is a place to stand, never a claim about a play: whoLines' `basis` (targets / carries / role / chart) says how sure it is.

export const FM = Object.freeze({
  W: 300,
  LOS: 236,            // pass line of scrimmage (BroadcastField LOS)
  R_LOS: 206,          // run line of scrimmage (BroadcastField R_LOS)
  EXTRA: 96,           // viewBox height added below the line for the two backfield rows
  R: 15,               // a face's radius in viewBox units (~37px on a phone)
  OFF_DY: 2,           // receivers stand a hair below the line so the line shows above the faces
  DEF_DY: -46,         // corners stand well above the line: their name + slot read clear of the receivers' faces
  BACK_DY: 54,         // the backfield row (below the line; clear of the run view's gap words)
  BACK_DX: 40,         // the second back stands beside the first, not under him (names sit under the faces)
})

const LANE = { left: 50, middle: 150, right: 250 }                       // lane centres
const OUTER = { left: 22, middle: 118, right: 278 }                      // two men in one lane: outermost first
const INNER = { left: 78, middle: 182, right: 222 }
const CORNER = { left: 36, middle: 112, right: 264 }                     // LCB / slot / RCB: outside the lane's zone number (BroadcastField moves that number away from them)
/** The run view's seven gap columns, x in BroadcastField's 0..300 viewBox (BroadcastField draws them, GameArena stands them up in 3D) */
export const RUN_GAP_X = Object.freeze({ 'left|end': 28, 'left|tackle': 70, 'left|guard': 112, 'middle|middle': 150, 'right|guard': 188, 'right|tackle': 230, 'right|end': 272 })
const GAP = { left: 70, middle: 150, right: 230 }                        // run: a side's usual gap (BroadcastField GAP_X tackle / middle)

/**
 * Spots for the men: [{ ...man, kind: 'off' | 'def', x, y }].
 * @param men     placeOffense(...).placed
 * @param defMen  placeDefense(...).placed (pass only; empty for a run)
 * @param pass    true = the passing field, false = the running one
 */
export function fieldSpots({ men = [], defMen = [], pass = true }) {
  const los = pass ? FM.LOS : FM.R_LOS
  const out = []
  const lineIn = (side) => men.filter((q) => !q.back && q.side === side).length
  for (const m of men) {
    if (!pass && !m.back) continue   // the run view places backs only (whoLines RUN_PRIORITY); a stray receiver is left off, never stacked on a gap
    if (m.back) {
      const base = pass ? LANE[m.side] : GAP[m.side]
      const beside = (m.row_i || 0) === 0 ? 0 : m.side === 'right' ? -FM.BACK_DX : FM.BACK_DX
      out.push({ ...m, kind: 'off', x: base + beside, y: los + FM.BACK_DY })
    } else {
      const x = lineIn(m.side) === 1 ? LANE[m.side] : (m.slot || 0) === 0 ? OUTER[m.side] : INNER[m.side]
      out.push({ ...m, kind: 'off', x: pass ? x : GAP[m.side], y: los + FM.OFF_DY })
    }
  }
  if (pass) for (const m of defMen) out.push({ ...m, kind: 'def', x: CORNER[m.side], y: los + FM.DEF_DY })
  return out
}

/** Pairs of spots closer than two radii (they would cover each other). Empty = every face is clear. */
export function overlapping(spots, r = FM.R) {
  const bad = []
  for (let i = 0; i < spots.length; i += 1) for (let j = i + 1; j < spots.length; j += 1) {
    if (Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) < 2 * r) bad.push([spots[i].id, spots[j].id])
  }
  return bad
}
