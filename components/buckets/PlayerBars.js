'use client'
import { useMemo, useState } from 'react'
import Sparkline, { GameStrip } from '../Sparkline'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/legs'
import { tensIn } from '../../lib/nba/ddtd'
import Tap from '../Tap'
import { Kicker, Pills, fmtTip, gameDay } from './ui'

// 🏀 THE BARS, GAME BY GAME -- MOONSHOT's strip (components/Sparkline.js
// Sparkline + GameStrip: a game a mark, filled when he cleared the bar, the
// active run brighter, every mark its game) on each BUCKETS market's own bar,
// from his game log. Then his games against his next opponent. Regular season
// and playoffs only; preseason is camp minutes.
const MARKETS = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td'].map((k) => ({ k, bar: NBA_MARKETS[k].bar, label: NBA_MARKETS[k].label, val: (g) => (k === 'dd' || k === 'td' ? tensIn(g) : k === 'pra' ? (g.pts ?? 0) + (g.reb ?? 0) + (g.ast ?? 0) : k === '3pm' ? g.tpm : g[k]) }))
const md = (iso) => { try { return new Date(`${gameDay(iso)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) } catch { return '' } }

export default function PlayerBars({ log = [], logSeason = '', nextGame = null, onOpenTeam = null }) {
  const [k, setK] = useState('pts')
  const m = MARKETS.find((x) => x.k === k)
  const games = useMemo(() => log.filter((g) => g.seasonType === 2 || g.seasonType === 3).slice().reverse(), [log])  // oldest -> newest
  const strip = games.map((g) => { const v = m.val(g); return { date: md(g.date), opp: g.opp, home: g.atVs !== '@', v: v ?? '—', on: v != null && v >= m.bar } })
  let run = 0
  for (let i = strip.length - 1; i >= 0 && strip[i].on; i--) run++
  const rate = (list) => { const n = list.length, h = list.filter((s) => s.on).length; return n ? `${h} of ${n} (${Math.round((100 * h) / n)}%)` : '—' }
  const vs = nextGame ? strip.filter((s) => s.opp === nextGame.opp) : []
  if (!games.length) return null
  return (
    <section>
      <Kicker>THE BARS, GAME BY GAME · {logSeason}</Kicker>
      <Pills ariaLabel="Market" value={k} onChange={setK} options={MARKETS.map((x) => ({ key: x.k, text: x.label }))} />
      <div style={{ display: 'grid', gap: 8, marginTop: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 12, color: C.text2 }}>
          <span>LAST 10 <b style={{ color: C.text }}>{rate(strip.slice(-10))}</b></span>
          <span>SEASON <b style={{ color: C.text }}>{rate(strip)}</b></span>
          {run > 1 ? <span style={{ color: C.purple }}>ON A {run}-GAME RUN</span> : null}
        </div>
        {/* 25 marks fit a 360 phone (25 x 9 px); the labelled strip below scrolls in its own box */}
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}><Sparkline strip={strip} run={run} max={25} size={7} /></div>
        <GameStrip strip={strip} max={15} />
        {nextGame ? (
          <div style={{ fontSize: 12, color: C.text2, display: 'grid', gap: 6 }}>
            <span>NEXT: {nextGame.home ? 'vs' : '@'} <Tap onClick={onOpenTeam ? () => onOpenTeam(nextGame.opp) : null}><b style={{ color: C.text }}>{nextGame.opp}</b></Tap>, {fmtTip(nextGame.start)} · his games against them this log: <b style={{ color: C.text }}>{vs.length ? rate(vs) : 'none'}</b></span>
            {vs.length ? <GameStrip strip={vs} max={10} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
