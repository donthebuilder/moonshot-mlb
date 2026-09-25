'use client'
import { C, NUM_FONT, TYPE, gradeFor } from '../../lib/nfl/theme'
import NflFace from './NflFace'
import MatchupBadge from './MatchupBadge'
import { reasonFor, topStatChips } from './ScoreAnatomy'
import { injuryTag, injuryTitle, injuryColor } from '../../lib/nfl/injury'

// ── THE PICK CARD (2026-09-25) ───────────────────────────────────────────────
//
// Donovan, with the MOONSHOT Props page beside TUDDY's Picks: "I don't really
// even like how it's set up." A MOONSHOT pick is a card -- badge, name, one
// sentence with a real fact in it, evidence chips, L5 / L10 / SZN tiles. A
// TUDDY rung was a number, a name and a button. This is the football card,
// cloned from that shape with football parts:
//
//   header   face · name · pos team vs opp · TARGET/AVOID · A+ · Q · score + grade
//   sentence "He gets the ball right next to the end zone ..." (reasonFor,
//            the component actually carrying his score) + the stat behind it
//   chips    top-3 components
//   tiles    L4 · L8 · season -- games he cleared this market's bar, from the
//            published game log (nfl_logs.json), the honest "what repeats"
//   log      last 8 games as bars against the bar line (the MOONSHOT "What
//            repeats" chart, small). Green = cleared, grey = did not.
//
// Every number is off the payload: stats/components from nfl_week, the log
// from nfl_logs. A card with no log shows no tiles and no bars -- an absent
// row is honest, a zero-filled one is not (project rule 16).
//
// The contest controls (take it / change / conviction) are NOT here: Picks.js
// keeps them under the card, because they are the page's mechanism and this
// is the pick's story.

const BAR_KEY = {
  TD: 'g_td', REC_YDS: 'g_recyd', REC: 'g_rec', RUSH_YDS: 'g_ruyd',
  RUSH_ATT: 'g_car', PASS_YDS: 'g_payd', KICK_PTS: 'g_kick',
}

// The one stat that backs the sentence, in plain units. Keyed by the
// component reasonFor() picked; falls back to the market's own stat.
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const FACT = {
  f_rz_opp:      (s) => num(s?.RZ) != null ? `${num(s.RZ).toFixed(1)} red-zone touches a game` : null,
  f_gl_opp:      (s) => num(s?.GL) != null ? `${num(s.GL).toFixed(1)} goal-line touches a game` : null,
  f_touches:     (s) => (num(s?.CAR) != null || num(s?.TGT) != null) ? `${((num(s?.CAR) || 0) + (num(s?.TGT) || 0)).toFixed(1)} touches a game` : null,
  f_xtd:         (s) => num(s?.xTD) != null ? `${num(s.xTD).toFixed(2)} expected TD a game` : null,
  f_wopr:        (s) => num(s?.WOPR) != null ? `WOPR ${num(s.WOPR).toFixed(3)}` : null,
  f_receiving_yards: (s) => num(s?.RECYD) != null ? `${num(s.RECYD).toFixed(1)} receiving yards a game` : null,
  f_receiving_air_yards: (s) => num(s?.AIRYD) != null ? `${num(s.AIRYD).toFixed(1)} air yards a game` : null,
  f_target_share: (s) => num(s?.['TGT%']) != null ? `${(num(s['TGT%']) * 100).toFixed(1)}% of his team’s targets` : null,
  f_receptions:  (s) => num(s?.REC) != null ? `${num(s.REC).toFixed(1)} catches a game` : null,
  f_targets:     (s) => num(s?.TGT) != null ? `${num(s.TGT).toFixed(1)} targets a game` : null,
  f_carries:     (s) => num(s?.CAR) != null ? `${num(s.CAR).toFixed(1)} carries a game` : null,
  f_rushing_yards: (s) => num(s?.RUYD) != null ? `${num(s.RUYD).toFixed(1)} rushing yards a game` : null,
  f_passing_yards: (s) => num(s?.PAYD) != null ? `${num(s.PAYD).toFixed(0)} passing yards a game` : null,
}

const MARKET_FACT = {
  TD: (p) => (num(p?.season_td) != null ? `${p.season_td} TD this season` : null),
  REC_YDS: (p) => (num(p?.stats?.RECYD) != null ? `${num(p.stats.RECYD).toFixed(1)} receiving yards a game` : null),
  REC: (p) => (num(p?.stats?.REC) != null ? `${num(p.stats.REC).toFixed(1)} catches a game` : null),
  RUSH_YDS: (p) => (num(p?.stats?.RUYD) != null ? `${num(p.stats.RUYD).toFixed(1)} rushing yards a game` : null),
  RUSH_ATT: (p) => (num(p?.stats?.CAR) != null ? `${num(p.stats.CAR).toFixed(1)} carries a game` : null),
  PASS_YDS: (p) => (num(p?.stats?.PAYD) != null ? `${num(p.stats.PAYD).toFixed(0)} passing yards a game` : null),
  KICK_PTS: (p) => (num(p?.stats?.FGM) != null ? `${num(p.stats.FGM).toFixed(1)} field goals a game` : null),
}

function bestComponent(player, weights, base, market) {
  const comps = player?.components?.[market]
  if (!comps || !weights) return null
  let best = null
  for (const [k, pctRaw] of Object.entries(comps)) {
    const w = Number(weights[k]); const pct = Number(pctRaw)
    if (!Number.isFinite(w) || !Number.isFinite(pct)) continue
    const edge = (pct - (base?.[k] ?? 50)) * w
    if (!best || edge > best.edge) best = { k, edge, pct }
  }
  return best?.k || null
}

/** Games cleared in the last n of a log, for a market's bar. */
function cleared(log, key, bar, n) {
  const rows = (log || []).slice(-n)
  if (!rows.length) return null
  return [rows.filter((g) => Number(g[key]) >= bar).length, rows.length]
}

function Tile({ label, value, sub, lit }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, textAlign: 'center', padding: '6px 4px',
      background: C.bg, border: `1px solid ${lit ? `${C.green}66` : C.border}`, borderRadius: 8,
    }}>
      <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.name, fontWeight: 900, color: lit ? C.green : C.text, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{sub}</div>}
    </div>
  )
}

/** The last 8 games as bars against the bar line -- MOONSHOT's "What repeats", small. */
export function GameLogMini({ log, market, bar, width = 168, height = 34 }) {
  const key = BAR_KEY[market]
  const rows = (log || []).slice(-8)
  if (!key || !rows.length || !(bar > 0)) return null
  const vals = rows.map((g) => Number(g[key]) || 0)
  const max = Math.max(bar * 1.6, ...vals, 0.01)
  const gap = 3
  const bw = (width - gap * (rows.length - 1)) / rows.length
  const y = (v) => height - (v / max) * (height - 4)
  return (
    <svg width={width} height={height + 12} viewBox={`0 0 ${width} ${height + 12}`} role="img"
         aria-label={`Last ${rows.length} games against the bar of ${bar}`}
         style={{ display: 'block', overflow: 'visible' }}>
      {rows.map((g, i) => {
        const v = vals[i]; const hit = v >= bar
        const h = Math.max(2, height - y(v))
        return (
          <g key={`${g.s}-${g.w}-${i}`}>
            <rect x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={2}
                  fill={hit ? C.green : 'rgba(255,255,255,.16)'} />
            <text x={i * (bw + gap) + bw / 2} y={height + 10} textAnchor="middle"
                  fontFamily={NUM_FONT} fontSize={7.5} fill={C.text3}>{g.opp}</text>
          </g>
        )
      })}
      <line x1={0} x2={width} y1={y(bar)} y2={y(bar)} stroke={C.text3} strokeDasharray="3 3" strokeWidth={1} />
    </svg>
  )
}

export default function PickCard({
  rung, player, market, marketLabel, weights, base, bar, matchup, log, onOpen, right = null,
}) {
  const p = player || rung
  const score = Number(rung?.score ?? p?.scores?.[market])
  const g = gradeFor(score)
  const why = reasonFor(p, weights, base, market)
  const bestK = bestComponent(p, weights, base, market)
  const fact = (bestK && FACT[bestK]?.(p?.stats)) || MARKET_FACT[market]?.(p) || null
  const chips = topStatChips(p?.components?.[market], weights, 3) || []
  const inj = injuryTag(p)
  const key = BAR_KEY[market]
  const l4 = cleared(log, key, bar, 4)
  const l8 = cleared(log, key, bar, 8)
  const szn = (() => {
    const season = Math.max(...(log || []).map((r) => Number(r.s) || 0), 0)
    const rows = (log || []).filter((r) => Number(r.s) === season)
    return rows.length ? [rows.filter((r) => Number(r[key]) >= bar).length, rows.length, season] : null
  })()
  const pct = (t) => (t && t[1] ? Math.round((100 * t[0]) / t[1]) : null)

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderTop: `3px solid ${g.color}`,
      borderRadius: 10, padding: '9px 11px 10px', display: 'flex', flexDirection: 'column', gap: 7,
      opacity: rung?.low_sample ? 0.72 : 1,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, color: C.text3, minWidth: 14 }}>{rung?.rank}</span>
        <NflFace player={p} size={38} />
        <button onClick={onOpen} style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name}</div>
          <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span>{p?.position} · {p?.team}{p?.opp ? ` vs ${p.opp}` : ''}</span>
            <MatchupBadge matchup={matchup} player={p} market={market} />
            {p?.high_confidence_td_flag && market === 'TD' && (
              <span title="High-confidence: a TD score of 78 or better, the A+ band" style={{ color: C.green, fontWeight: 900 }}>A+</span>
            )}
            {inj && <span title={injuryTitle(inj)} style={{ fontWeight: 900, color: injuryColor(inj, C) }}>{inj}</span>}
          </div>
        </button>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, color: g.color, lineHeight: 1 }}>{Math.round(score)}</div>
          <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, color: g.color, border: `1px solid ${g.color}55`, borderRadius: 5, padding: '1px 4px', marginTop: 3, textAlign: 'center' }}>{g.label}</div>
        </div>
        {right}
      </div>

      {/* the sentence -- the component carrying the score, with the number behind it */}
      {(why || fact) && (
        <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.4 }}>
          {why ? `He ${why}` : (marketLabel || market)}{fact ? ` — ${fact}` : ''}.
        </div>
      )}

      {/* chips */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <span key={c.key} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, color: C.text2, border: `1px solid ${C.border}`,
              borderRadius: 999, padding: '2px 7px', background: C.bg,
            }}>{c.t}</span>
          ))}
        </div>
      )}

      {/* tiles + the log */}
      {(l4 || l8 || szn) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5, flex: '1 1 150px', minWidth: 150 }}>
            {l4 && <Tile label="L4" value={`${l4[0]}/${l4[1]}`} sub={`${pct(l4)}%`} lit={pct(l4) >= 50} />}
            {l8 && <Tile label="L8" value={`${l8[0]}/${l8[1]}`} sub={`${pct(l8)}%`} lit={pct(l8) >= 50} />}
            {szn && <Tile label={String(szn[2])} value={`${szn[0]}/${szn[1]}`} sub={`${pct(szn)}%`} lit={pct(szn) >= 50} />}
          </div>
          <div title={`Last 8 games against the bar (${bar}). Green cleared it.`} style={{ flex: '0 0 auto' }}>
            <GameLogMini log={log} market={market} bar={bar} />
          </div>
        </div>
      )}
    </div>
  )
}
