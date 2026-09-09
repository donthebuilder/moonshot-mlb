'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// HitRate — every game against the line, as bars.
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
  const games = useMemo(() => (log || []).slice(-span), [log, span])

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
  const vals = games.map((g) => Number(g[key]) || 0)
  const max = Math.max(...vals, line * 1.35, 1)
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0

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
              background: l === line ? `${C.green}1c` : 'transparent',
              color: l === line ? C.green : C.text3,
            }}>{l}</button>
          ))}
          <span style={{ width: 6 }} />
          {[5, 10, 20].map((n) => (
            <button key={n} onClick={() => setSpan(n)} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '2px 7px', borderRadius: 6,
              border: `1px solid ${n === span ? C.cyan : C.border}`,
              background: n === span ? `${C.cyan}1c` : 'transparent',
              color: n === span ? C.cyan : C.text3,
            }}>L{n}</button>
          ))}
        </div>
      </div>

      {/* the bars, with the line drawn across them */}
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 3,
        height: 104, background: 'rgba(255,255,255,.02)',
        border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 8px 20px',
      }}>
        <div style={{
          position: 'absolute', left: 8, right: 8, bottom: `calc(20px + ${(line / max) * 84}px)`,
          height: 1, background: C.text2, zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', right: 10,
          bottom: `calc(22px + ${(line / max) * 84}px)`, zIndex: 3,
          fontFamily: NUM_FONT, fontSize: 8.5, color: C.text2,
        }}>avg {avg.toFixed(1)}</div>
        {games.map((g, i) => {
          const v = Number(g[key]) || 0
          const hit = v > line
          return (
            <div key={`${g.s}-${g.w}-${i}`} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end', height: '100%',
            }} title={`${g.s} wk ${g.w} vs ${g.opp}: ${v}`}>
              <span style={{
                fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900,
                color: hit ? C.green : C.text3, marginBottom: 2,
              }}>{Number.isInteger(v) ? v : v.toFixed(0)}</span>
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                height: `${Math.max(2, (v / max) * 84)}px`,
                background: hit ? `${C.green}cc` : `${C.red}66`,
              }} />
              <span style={{
                position: 'absolute', bottom: 5, fontSize: 7.5, color: C.text3,
                fontFamily: NUM_FONT,
              }}>{g.opp}</span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
        {stats.seasons.map(([s, [h, n]]) => <Pct key={s} label={s} hits={h} n={n} />)}
        <Pct label="L5" hits={stats.l5[0]} n={stats.l5[1]} />
        <Pct label="L10" hits={stats.l10[0]} n={stats.l10[1]} />
        <Pct label="L20" hits={stats.l20[0]} n={stats.l20[1]} />
      </div>
    </>
  )
}
