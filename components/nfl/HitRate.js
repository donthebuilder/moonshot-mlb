'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import AgainstTheBar from './AgainstTheBar'

// HitRate — every game against the line.
//
// 2026-09-13: the bars became dots (components/nfl/AgainstTheBar.js). The
// column chart could only ever say over/under; the strip says over/under AND
// by how much, in half the vertical space. The line chips, the window chips
// and the season/L5/L10/L20 rates below are unchanged — they were the good
// half of this component and they still are.
//
// The reason this beats an average: two 12-catch games and eight 2-catch games
// average the same as ten 4-catch games and are not remotely the same bet. The
// average hides the shape; the bars are the shape.
//
// The LINE IS ADJUSTABLE and re-grades in the browser, which is why the bot
// ships the raw game log rather than a precomputed hit percentage. Moving from
// 3.5 to 4.5 receptions is the actual question a bettor is asking, and it
// shouldn't require another bot run to answer.

const PRESETS = {
  TD: [0.5], REC_YDS: [24.5, 39.5, 59.5], REC: [2.5, 3.5, 4.5, 6.5],
  RUSH_YDS: [39.5, 49.5, 79.5], RUSH_ATT: [9.5, 11.5, 14.5],
  PASS_YDS: [199.5, 224.5, 274.5], KICK_PTS: [5.5, 8.5],
}
const STAT_KEY = {
  TD: 'g_td', REC_YDS: 'g_recyd', REC: 'g_rec', RUSH_YDS: 'g_ruyd',
  RUSH_ATT: 'g_car', PASS_YDS: 'g_payd', KICK_PTS: 'g_kick',
}

function Pct({ label, hits, n }) {
  if (!n) return null
  const pct = Math.round((100 * hits) / n)
  const col = pct >= 60 ? C.green : pct >= 45 ? C.yellow : C.red
  return (
    <div style={{
      flex: 1, minWidth: 62, textAlign: 'center', padding: '5px 4px', borderRadius: 7,
      background: `${col}12`, border: `1px solid ${col}40`,
    }}>
      <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, color: col }}>
        {hits}/{n}
      </div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>{pct}%</div>
    </div>
  )
}

export default function HitRate({ log, market, defaultBar }) {
  const presets = PRESETS[market] || [defaultBar]
  const [line, setLine] = useState(
    presets.includes(defaultBar - 0.5) ? defaultBar - 0.5 : presets[Math.floor(presets.length / 2)])
  const [span, setSpan] = useState(10)

  const key = STAT_KEY[market]

  const stats = useMemo(() => {
    const all = log || []
    const at = (arr) => [arr.filter((g) => Number(g[key]) > line).length, arr.length]
    const bySeason = {}
    for (const g of all) (bySeason[g.s] ||= []).push(g)
    return {
      l5: at(all.slice(-5)), l10: at(all.slice(-10)), l20: at(all.slice(-20)),
      seasons: Object.entries(bySeason).map(([s, arr]) => [s, at(arr)]).sort(),
    }
  }, [log, line, key])

  if (!log?.length) return null

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, margin: '16px 0 7px', flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        }}>HIT RATE — OVER {line}</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {presets.map((l) => (
            <button key={l} onClick={() => setLine(l)} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '2px 7px', borderRadius: 6,
              border: `1px solid ${l === line ? C.green : C.border}`,
              background: l === line ? `${C.green}30` : 'transparent',
              color: l === line ? C.green : C.text3,
            }}>{l}</button>
          ))}
          <span style={{ width: 6 }} />
          {[5, 10, 20].map((n) => (
            <button key={n} onClick={() => setSpan(n)} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '2px 7px', borderRadius: 6,
              border: `1px solid ${n === span ? C.cyan : C.border}`,
              background: n === span ? `${C.cyan}30` : 'transparent',
              color: n === span ? C.cyan : C.text3,
            }}>L{n}</button>
          ))}
        </div>
      </div>

      <AgainstTheBar log={log} statKey={key} bar={line} span={span} height={54} />

      <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
        {stats.seasons.map(([s, [h, n]]) => <Pct key={s} label={s} hits={h} n={n} />)}
        <Pct label="L5" hits={stats.l5[0]} n={stats.l5[1]} />
        <Pct label="L10" hits={stats.l10[0]} n={stats.l10[1]} />
        <Pct label="L20" hits={stats.l20[0]} n={stats.l20[1]} />
      </div>
    </>
  )
}
