'use client'
import { C, NUM_FONT, RAMP } from '../../lib/nfl/theme'

// SCORE ANATOMY — the number, taken apart.
//
// 2026-10-01 (0e b): the stacked-bar panel below is gone from the card; the
// default export is now the one WHY line + the board rank (see the bottom of
// this file). anatomyOf / reasonFor / baselineFor / topStatChips stay -- the
// boards and the pick cards read them.
//
// 2026-09-13. The WHY panel this replaces was a correct list: every component,
// its percentile, its weight, one row each. The trouble with a list is that
// you have to read six rows and do the multiplication yourself before you know
// which one is carrying the player. A stacked bar does that arithmetic in the
// drawing: the widest block IS the reason he is on the board, and two men with
// the same score look visibly different, which is the entire point.
//
// ── THE ARITHMETIC, HONESTLY ─────────────────────────────────────────────────
// Read bots/nfl/nfl_bot.py score_all() before changing anything here.
//
//   raw   = SUM(weight_i x percentile_i)      <- 0-100, what this bar draws
//   score = mlb_scale(rank of raw in the league's raws)   <- what the board shows
//
// So the segments DO NOT sum to the 74 on the rung, and any version of this
// chart that claims they do is lying. `raw` is a weighted average of
// percentiles, which piles up near the middle; the published score is that
// composite ranked league-wide and pushed onto the shared MLB scale (mean 47,
// sd 11, clamped 5-95) so that an NFL 78 means what an MLB 78 means.
//
// This component therefore draws the composite, labels it the composite, and
// states the score's relationship to it in one line underneath. The weights it
// multiplies by are the RENORMALISED ones the bot ships per market
// (`spec.weights`) — when a context column is missing for a slate its weight is
// redistributed across the components that are present, so the static table in
// nfl_scoring.MODELS is the wrong one to draw with.

// Imported AND re-exported: this file still uses both tables itself (the
// label lookup in anatomyOf and the clause picker in reasonFor), and a bare
// `export ... from` does not bring a binding into local scope.
import { LABELS, WHY } from '../../lib/nfl/scoreLabels'
import { boardReason } from '../../lib/nfl/boardReason'
export { LABELS, WHY }

// The shared ramp (lib/nfl/theme.js), heaviest component at the warm end.
// The first pass used a jade→cyan ramp and the segments blurred into one
// another — three blocks reading as one green smear, which defeats the entire
// purpose of taking the score apart. Segment ORDER still identifies a factor
// (same order for every player in a market, every week); the ramp just has to
// make the boundaries visible, and this one does.
const tone = (i) => RAMP[Math.min(i, RAMP.length - 1)]

// spec.weights is keyed WITHOUT the inversion marker; component keys arrive
// with a trailing _inv when the model inverts them.
const baseKey = (k) => k.replace(/_inv$/, '')

export function anatomyOf(components, weights) {
  const parts = Object.entries(components || {})
    .map(([key, pct]) => ({
      key,
      label: LABELS[key] || baseKey(key),
      pct: Number(pct),
      w: Number(weights?.[baseKey(key)] ?? 0),
    }))
    .filter((p) => Number.isFinite(p.pct) && p.w > 0)
  if (!parts.length) return null
  for (const p of parts) p.points = p.w * p.pct
  const composite = parts.reduce((a, p) => a + p.points, 0)
  // Draw in the model's own weight order, heaviest first — stable per market.
  parts.sort((a, b) => b.w - a.w || b.points - a.points)
  const lead = [...parts].sort((a, b) => b.points - a.points)[0]
  return { parts, composite, lead }
}

// ── WHY / REASONFOR / BASELINEFOR / TOPSTATCHIPS (2026-09-17, markets pass) ─
//
// Donovan, off the MOONSHOT storylines screenshot: "the prop eq rn is
// touchdowns just add the different markets... i feel we need induivual
// score for each position in a sense." Traced first
// (claude/tuddy-storylines-and-markets-audit-2026-09-16.md): every player
// already carries a `scores`/`components` object across all 7 markets
// (bots/nfl/nfl_scoring.py, bots/nfl/nfl_bot.py) — the model and the numbers
// were never missing. What Touchdowns.js had that the other six markets'
// home (Boards.js) didn't was the ONE-LINE "why" explanation and the stat
// chips underneath a card — Touchdowns.js's own WHY map, `reasonFor()` and
// `statChips()`, hardcoded to the TD market and its eight TD-only
// components.
//
// These four exports are that same logic, market-parametrized instead of
// TD-only, so Boards.js's seven-market card board can give every market the
// same "here's what's actually driving this number" sentence Touchdowns
// gives TD — not a new model, not new copy invented for its own sake: WHY's
// twenty new clauses are one-line descriptions of the real components
// bots/nfl/nfl_scoring.py's MODELS table already weights for REC_YDS, REC,
// RUSH_YDS, RUSH_ATT, PASS_YDS and KICK_PTS (read there before adding a
// component key here — a clause with no matching weight in a market's own
// model is dead code, not a feature).
//
// Touchdowns.js has been refactored to call these instead of keeping its own
// copy (rule #21: one place, not seven markets each growing their own).

/** Per-component league median for `market`, over whatever pool the caller
 * hands in — Touchdowns.js passes every TD-eligible player before its own
 * search/tier filters narrow the view; Boards.js does the same per market,
 * so the baseline doesn't collapse to n=1 the moment someone searches a
 * name. */
export function baselineFor(rows, market) {
  const acc = {}
  for (const p of rows) {
    for (const [k, v] of Object.entries(p?.components?.[market] || {})) {
      if (Number.isFinite(Number(v))) (acc[k] ||= []).push(Number(v))
    }
  }
  const out = {}
  for (const [k, vals] of Object.entries(acc)) {
    vals.sort((a, b) => a - b)
    out[k] = vals[Math.floor(vals.length / 2)]
  }
  return out
}

/** The single biggest reason THIS player is scoring what he's scoring in
 * `market`, as a plain clause ("gets handed the ball constantly...") — or
 * null when nothing clears the bar (best percentile under 60, or no
 * component actually ahead of the field). Same edge = (percentile - league
 * median) * weight Touchdowns.js always used, just pointed at whichever
 * market's own components/weights the caller passes in. */
export function reasonFor(player, weights, base, market) {
  const comps = player?.components?.[market]
  if (!comps || !weights) return null
  let best = null
  for (const [k, pctRaw] of Object.entries(comps)) {
    const w = Number(weights[k])
    const pct = Number(pctRaw)
    if (!Number.isFinite(w) || !Number.isFinite(pct) || !WHY[k]) continue
    const edge = (pct - (base?.[k] ?? 50)) * w
    if (!best || edge > best.edge) best = { k, edge, pct }
  }
  if (!best || best.pct < 60 || best.edge <= 0) return null
  return WHY[best.k]
}

/** The card's stat chips — top N components by actual weighted contribution
 * (anatomyOf's own `points`), the same source as the AnatomyStrip bar.
 * Stat jargon and all: the raw label and percentile, not a translated
 * sentence. */
export function topStatChips(components, weights, n = 3) {
  const a = anatomyOf(components, weights)
  if (!a) return null
  return [...a.parts].sort((x, y) => y.points - x.points).slice(0, n)
    .map((p) => ({ t: `${p.label} ${Math.round(p.pct)}p`, key: p.key }))
}

// Inline strip for a board rung: the shape only, no text, ~5px tall.
export function AnatomyStrip({ components, weights, width = 84 }) {
  const a = anatomyOf(components, weights)
  if (!a) return null
  return (
    <div
      title={`${a.lead.label} is doing most of the work (${Math.round(a.lead.points)} of ${Math.round(a.composite)} composite points)`}
      style={{
        display: 'flex', width, height: 5, borderRadius: 99, overflow: 'hidden',
        background: 'rgba(255,255,255,.07)',
      }}
    >
      {a.parts.map((p, i) => (
        <i key={p.key} style={{
          width: `${p.points}%`, background: tone(i), opacity: 0.92, display: 'block',
        }} />
      ))}
    </div>
  )
}

// ── THE CARD'S WHY (2026-10-01, 0e b) ────────────────────────────────────
// The stacked bar, its swatch legend and the component arithmetic
// ("53p x 22% = 11.8") that used to be drawn here went on Donovan's word
// ("I actually hate these"): an analyst instrument that needed a legend and
// sat in front of the answer. The card now says what the board card says --
// the boardReason line, his top component with the number behind it --
// and where the score puts him on the board. The arithmetic lives only in
// the score's own "what am I looking at?" tap (components/Explain.js).
//
// `pool` is the market's FULL eligible pool (every player with a score in
// it, as Boards.js passes), so the median, the rank inside the WHY line and
// the board rank are the same numbers the board shows.
export default function ScoreAnatomy({ player, market, weights, pool = [], marketLabel }) {
  const score = player?.scores?.[market]
  if (!Number.isFinite(score)) return null
  const eligible = (pool || []).filter((p) => Number.isFinite(p?.scores?.[market]))
  const why = boardReason(player, weights, baselineFor(eligible, market), market, eligible)
  const rank = eligible.length ? 1 + eligible.filter((p) => p.scores[market] > score).length : null

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em', marginBottom: 6 }}>
        WHY — {(marketLabel || market || '').toUpperCase()}
      </div>
      {why && (
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>{why.text}</div>
      )}
      <div style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text2, marginTop: why ? 4 : 0 }}>
        board score <b style={{ color: C.green }}>{Math.round(score)}</b>
        {rank != null && <> · <b style={{ color: C.text }}>#{rank}</b> of {eligible.length} on the board</>}
      </div>
    </div>
  )
}
