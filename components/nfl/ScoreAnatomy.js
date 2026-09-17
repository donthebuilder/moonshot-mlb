'use client'
import { C, NUM_FONT, RAMP } from '../../lib/nfl/theme'

// SCORE ANATOMY — the number, taken apart.
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

export const LABELS = {
  f_gl_opp: 'Goal-line opportunity',
  f_rz_opp: 'Red-zone touches',
  implied_total: 'Implied team total',
  f_xtd: 'Expected TDs',
  f_touches: 'Touches (carries + targets)',
  f_snap_pct: 'Snap share',
  opp_td_soft: 'Defense TD softness',
  td_regression: 'TD regression (due)',
  f_wopr: 'WOPR (opportunity)',
  f_receiving_yards: 'Receiving yards form',
  f_receiving_air_yards: 'Air yards (depth)',
  opp_pass_soft: 'Defense pass softness',
  f_target_share: 'Target share',
  f_receptions: 'Receptions form',
  f_targets: 'Targets',
  f_carries: 'Carries',
  f_rushing_yards: 'Rushing yards form',
  f_rz_car: 'Red-zone carries',
  f_ngs_rush_yards_over_expected_per_att: 'RYOE per attempt (NGS)',
  total_line: 'Game total',
  f_passing_yards: 'Passing yards form',
  f_attempts: 'Pass attempts',
  f_passing_cpoe: 'CPOE',
  f_tm_fg_drive_rate: 'Team FG-drive rate',
  f_tm_rz_td_rate_inv: 'Team RZ TD rate (inverted)',
  f_fg_att: 'FG attempts',
  kick_env: 'Kicking environment',
  f_tm_drives: 'Team drives',
}

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
export const WHY = {
  // TD (bots/nfl/nfl_scoring.py MODELS.TD.w)
  f_gl_opp:      'gets the ball right next to the end zone more than almost anyone',
  f_rz_opp:      'is on the field for the plays that happen close to the end zone',
  f_touches:     'gets handed the ball constantly — the offence runs through him',
  f_snap_pct:    'almost never comes off the field',
  implied_total: 'plays for the team expected to score the most points',
  f_xtd:         'gets the kind of chances that usually turn into touchdowns',
  opp_td_soft:   'faces a defence that has been giving touchdowns up',
  td_regression: 'has had the chances and not cashed them yet',
  // REC_YDS (MODELS.REC_YDS.w)
  f_wopr:                'commands a huge share of his team’s targets and air yards',
  f_receiving_yards:     'has been racking up real receiving yardage lately',
  f_receiving_air_yards: 'is getting targeted deep down the field',
  opp_pass_soft:         'faces a defence that has been giving up yards through the air',
  // REC (MODELS.REC.w)
  f_target_share: 'is one of his team’s most-targeted receivers',
  f_receptions:   'has been catching the ball at a high rate',
  f_targets:      'keeps getting thrown the ball',
  // RUSH_YDS / RUSH_ATT (MODELS.RUSH_YDS.w, MODELS.RUSH_ATT.w)
  f_carries:                                'keeps getting handed the ball',
  f_rushing_yards:                          'has been piling up rushing yards lately',
  f_rz_car:                                 'gets the ball on the ground near the goal line',
  f_ngs_rush_yards_over_expected_per_att:   'gains more per carry than a runner in his shoes usually would',
  // PASS_YDS (MODELS.PASS_YDS.w)
  total_line:      'is in a game Vegas expects to be a shootout',
  f_passing_yards: 'has been throwing for real yardage lately',
  f_attempts:      'throws the ball more than almost anyone',
  f_passing_cpoe:  'completes passes at a higher rate than the situation calls for',
  // KICK_PTS (MODELS.KICK_PTS.w)
  f_tm_fg_drive_rate:  'plays for an offense whose drives keep stalling into field-goal range',
  f_tm_rz_td_rate_inv: 'plays for an offense that struggles to finish drives with touchdowns, which means more kicks',
  f_fg_att:            'gets a high number of field-goal chances',
  kick_env:            'kicks in a clean, low-wind setup',
  f_tm_drives:         'plays for a team that runs more drives than most',
}

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

export default function ScoreAnatomy({ components, weights, score, marketLabel, dropped }) {
  const a = anatomyOf(components, weights)
  if (!a) return null
  const { parts, composite, lead } = a

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, marginBottom: 7, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        }}>ANATOMY — {(marketLabel || '').toUpperCase()}</span>
        <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
          composite <b style={{ color: C.text }}>{composite.toFixed(1)}</b>
          {Number.isFinite(score) && <> · board score <b style={{ color: C.green }}>{Math.round(score)}</b></>}
        </span>
      </div>

      {/* the bar: full width is 100 composite points, the ghost is the rest.
          Segments carry a top highlight and a hairline divider so the blocks
          read as stacked material rather than a flat painted strip. */}
      <div style={{
        display: 'flex', width: '100%', height: 24, borderRadius: 7,
        overflow: 'hidden', background: 'rgba(255,255,255,.05)',
        border: `1px solid rgba(255,255,255,.12)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.10), inset 0 -2px 4px rgba(0,0,0,.45), 0 0 16px -8px ${RAMP[0]}`,
      }}>
        {parts.map((p, i) => (
          <div
            key={p.key}
            title={`${p.label} — ${Math.round(p.pct)}th percentile of his position pool, weighted ${Math.round(p.w * 100)}%, worth ${p.points.toFixed(1)} of ${composite.toFixed(1)}`}
            style={{
              width: `${p.points}%`, minWidth: p.points > 0 ? 2 : 0,
              background: `linear-gradient(180deg, ${tone(i)}, ${tone(i)}c4)`,
              borderRight: i < parts.length - 1 ? '1px solid rgba(0,0,0,.45)' : 'none',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)',
            }}
          />
        ))}
      </div>

      {/* legend, in the same order as the bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8,
      }}>
        {parts.map((p, i) => (
          <div key={p.key} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: C.text2,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, background: tone(i), flex: '0 0 auto',
            }} />
            <span>{p.label}</span>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
              {Math.round(p.pct)}p × {Math.round(p.w * 100)}% = <b style={{ color: C.text2 }}>{p.points.toFixed(1)}</b>
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, color: C.text2, marginTop: 8, lineHeight: 1.6 }}>
        His case is <b style={{ color: C.green }}>{lead.label.toLowerCase()}</b>, doing{' '}
        <b style={{ color: C.green }}>{Math.round((100 * lead.points) / composite)}%</b> of the work.
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5, lineHeight: 1.55 }}>
        Percentile against his position pool × the weight it carries. These add
        to the composite, not to the board score — the score is that composite
        ranked league-wide on the shared scale.
        {Array.isArray(dropped) && dropped.length > 0 && (
          <> Weights renormalised: {dropped.length} component
            {dropped.length > 1 ? 's are' : ' is'} unpublished this slate.</>
        )}
      </div>
    </div>
  )
}
