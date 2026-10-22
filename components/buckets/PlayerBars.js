'use client'
import { useMemo, useState } from 'react'
import Sparkline, { GameStrip } from '../Sparkline'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/legs'
import { tensIn } from '../../lib/nba/ddtd'
import Tap from '../Tap'
import { Kicker, Pills, fmtTip, gameDay } from './ui'
import { useBucketsDefPos } from '../../lib/nba/useBuckets'
import { posOf, POS_WORD } from '../../lib/nba/defPos'

// 🏀 THE BARS, GAME BY GAME -- MOONSHOT's strip (components/Sparkline.js
// Sparkline + GameStrip: a game a mark, filled when he cleared the bar, the
// active run brighter, every mark its game) on each BUCKETS market's own bar,
// from his game log. Then his games against his next opponent. Regular season
// and playoffs only; preseason is camp minutes.
//
// 2026-10-21 (Donovan's PropFinder screenshots; stats first, score second): each tile
// carries the chance behind the result (FGA behind points, 3PA behind threes, else his
// minutes) and the opponent's rank among the 30 at giving that stat up to his position
// (G/F/C, buckets_defpos season table; only when it is the log's own season). Lit = a
// top-10 giver. The D pills keep
// only the games against soft or tough defences. Potential assists / rebound chances
// wait on the bot (BOT-DATA-REQUESTS.md, NBA chances).
const CHANCE = { pts: ['fga', 'FGA'], '3pm': ['tpa', '3PA'] }
const RANK_KEY = { pts: 'pts', reb: 'reb', ast: 'ast', '3pm': 'tpm', pra: 'pra' }
const SOFT = 10
const D_OPTS = [{ key: 'all', text: 'Every D' }, { key: 'soft', text: `Top-${SOFT} givers` }, { key: 'tough', text: `Bottom ${SOFT}` }]
const MARKETS = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td'].map((k) => ({ k, bar: NBA_MARKETS[k].bar, label: NBA_MARKETS[k].label, val: (g) => (k === 'dd' || k === 'td' ? tensIn(g) : k === 'pra' ? (g.pts ?? 0) + (g.reb ?? 0) + (g.ast ?? 0) : k === '3pm' ? g.tpm : g[k]) }))
const md = (iso) => { try { return new Date(`${gameDay(iso)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) } catch { return '' } }

export default function PlayerBars({ log = [], logSeason = '', pos = '', nextGame = null, onOpenTeam = null }) {
  const [k, setK] = useState('pts')
  const [dv, setDv] = useState('all')
  const { data: dp } = useBucketsDefPos(null)
  const m = MARKETS.find((x) => x.k === k)
  const games = useMemo(() => log.filter((g) => g.seasonType === 2 || g.seasonType === 3).slice().reverse(), [log])  // oldest -> newest
  // rank 1 = gave up the most of this stat to his position; null for DD / TD, an unknown position, or another season's table
  const p = posOf(pos)
  const table = p && dp?.seasonLabel && dp.seasonLabel === logSeason ? dp.byPos?.[p]?.Season : null
  const rankOf = (abbrev) => (table && RANK_KEY[k] ? table[abbrev]?.r?.[RANK_KEY[k]] ?? null : null)
  const [ck, cw] = CHANCE[k] || ['min', 'MIN']
  const all = games.map((g) => { const v = m.val(g), rk = rankOf(g.opp), c = g[ck]; return { date: md(g.date), opp: g.opp, home: g.atVs !== '@', v: v ?? '—', on: v != null && v >= m.bar, sub: c != null ? `${ck === 'min' ? '' : 'of '}${c} ${cw}` : '', rk, soft: rk != null && rk <= SOFT } })
  const ranked = all.some((s) => s.rk != null)
  const d = ranked ? dv : 'all'
  const strip = d === 'soft' ? all.filter((s) => s.soft) : d === 'tough' ? all.filter((s) => s.rk != null && s.rk > 30 - SOFT) : all
  let run = 0
  for (let i = all.length - 1; i >= 0 && all[i].on; i--) run++  // his real run, not the filtered one
  const rate = (list) => { const n = list.length, h = list.filter((s) => s.on).length; return n ? `${h} of ${n} (${Math.round((100 * h) / n)}%)` : '—' }
  const vs = nextGame ? all.filter((s) => s.opp === nextGame.opp) : []
  if (!games.length) return null
  return (
    <section>
      <Kicker>THE BARS, GAME BY GAME · {logSeason}</Kicker>
      <Pills ariaLabel="Market" value={k} onChange={setK} options={MARKETS.map((x) => ({ key: x.k, text: x.label }))} />
      {ranked ? <div style={{ marginTop: 6 }}><Pills ariaLabel="Opponent defence" value={d} onChange={setDv} options={D_OPTS} /></div> : null}
      <div style={{ display: 'grid', gap: 8, marginTop: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 12, color: C.text2 }}>
          <span>LAST 10 <b style={{ color: C.text }}>{rate(strip.slice(-10))}</b></span>
          <span>SEASON <b style={{ color: C.text }}>{rate(strip)}</b></span>
          {run > 1 ? <span style={{ color: C.purple }}>ON A {run}-GAME RUN</span> : null}
        </div>
        {/* 25 marks fit a 360 phone (25 x 9 px); the labelled strip below scrolls in its own box */}
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}><Sparkline strip={strip} run={d === 'all' ? run : 0} max={25} size={7} /></div>
        {strip.length ? <GameStrip strip={strip} max={15} hi={C.purple} /> : <span style={{ fontSize: 12, color: C.text3 }}>No games against these defences yet.</span>}
        {ranked ? <span style={{ fontSize: 11, color: C.text3 }}>#N D = that club's rank at giving this up to {POS_WORD[p]?.toLowerCase()}, {logSeason}, of 30 (1 = the most).</span> : null}
        {nextGame ? (
          <div style={{ fontSize: 12, color: C.text2, display: 'grid', gap: 6 }}>
            <span>NEXT: {nextGame.home ? 'vs' : '@'} <Tap onClick={onOpenTeam ? () => onOpenTeam(nextGame.opp) : null}><b style={{ color: C.text }}>{nextGame.opp}</b></Tap>, {fmtTip(nextGame.start)} · his games against them this log: <b style={{ color: C.text }}>{vs.length ? rate(vs) : 'none'}</b></span>
            {vs.length ? <GameStrip strip={vs} max={10} hi={C.purple} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
