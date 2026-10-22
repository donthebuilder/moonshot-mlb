'use client'
import { useMemo, useState } from 'react'
import PropBars from '../player/PropBars'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { tensIn } from '../../lib/nba/ddtd'
import { useBucketsDefPos } from '../../lib/nba/useBuckets'
import { posOf, POS_WORD } from '../../lib/nba/defPos'
import Tap from '../Tap'
import { Kicker, Pills, fmtTip, gameDay } from './ui'

// 🏀 THE BARS (2026-10-21, Donovan: "id rather see bars kinda like propfinder and why arent those just combined into one").
// One section where THE BARS strip and the PROPS matrix used to be two: the market chips carry his hit rate in the
// window you picked, the line chips move the line, one bar a game (components/player/PropBars.js), and the window chips
// under it (L5 / L10 / L20 / season / vs tonight's club) say how often he cleared it. Regular season and playoffs only;
// preseason is camp minutes. Under each bar: his minutes (stats first). Hollow bar = the chance behind the result in the
// same unit (3PA behind 3PM now; potential assists / rebound chances wait on the bot, BOT-DATA-REQUESTS.md "NBA chances").
// R:N = the opponent's rank of 30 at giving the stat up to his position (G/F/C, buckets_defpos season table, only when it
// is the log's own season); lit = a top-10 giver, and the D pills keep only those games.
const MARKETS = [
  { k: 'pts', label: 'PTS', lines: [10, 15, 20, 25, 30], first: 15, val: (g) => g.pts, rank: 'pts' },
  { k: 'reb', label: 'REB', lines: [4, 6, 8, 10], first: 6, val: (g) => g.reb, rank: 'reb' },
  { k: 'ast', label: 'AST', lines: [3, 5, 8], first: 5, val: (g) => g.ast, rank: 'ast' },
  { k: '3pm', label: '3PM', lines: [1, 2, 3, 4], first: 2, val: (g) => g.tpm, chance: (g) => g.tpa, rank: 'tpm' },
  { k: 'pra', label: 'PRA', lines: [20, 25, 30, 35, 40], first: 25, val: (g) => (g.pts == null ? null : (g.pts ?? 0) + (g.reb ?? 0) + (g.ast ?? 0)), rank: 'pra' },
  { k: 'dd', label: 'DD', lines: [2], first: 2, val: (g) => tensIn(g), word: 'cats at 10+' },
  { k: 'td', label: 'TD', lines: [3], first: 3, val: (g) => tensIn(g), word: 'cats at 10+' },
]
const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Season', Infinity]]
const SOFT = 10
const D_OPTS = [{ key: 'all', text: 'Every D' }, { key: 'soft', text: `Top-${SOFT} givers` }, { key: 'tough', text: `Bottom ${SOFT}` }]
const md = (iso) => { try { return new Date(`${gameDay(iso)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) } catch { return '' } }
const pct = (ok, n) => (n ? Math.round((100 * ok) / n) : null)

export default function PlayerBars({ log = [], logSeason = '', pos = '', nextGame = null, onOpenTeam = null }) {
  const [k, setK] = useState('pts')
  const [lines, setLines] = useState({})
  const [win, setWin] = useState('L10')
  const [dv, setDv] = useState('all')
  const { data: dp } = useBucketsDefPos(null)
  const m = MARKETS.find((x) => x.k === k)
  const line = lines[k] ?? m.first
  const games = useMemo(() => log.filter((g) => g.seasonType === 2 || g.seasonType === 3).slice().reverse(), [log])  // oldest -> newest
  const p = posOf(pos)
  const table = p && dp?.seasonLabel && dp.seasonLabel === logSeason ? dp.byPos?.[p]?.Season : null
  const rankOf = (mk, abbrev) => (table && mk.rank ? table[abbrev]?.r?.[mk.rank] ?? null : null)
  const cleared = (mk, ln, g) => { const v = mk.val(g); return v != null && v >= ln }

  // the window's games for a market, newest last; 'H2H' = his games against tonight's club
  const windowGames = (w) => (w === 'H2H' ? games.filter((g) => nextGame && g.opp === nextGame.opp) : games.slice(-(WINDOWS.find(([x]) => x === w)?.[1] ?? 10)))
  const ranked = games.some((g) => rankOf(m, g.opp) != null)
  const d = ranked ? dv : 'all'
  const inD = (g) => { const rk = rankOf(m, g.opp); return d === 'all' || (d === 'soft' ? rk != null && rk <= SOFT : rk != null && rk > 30 - SOFT) }
  const rate = (mk, ln, list) => { const xs = list.filter((g) => mk.val(g) != null); const ok = xs.filter((g) => cleared(mk, ln, g)).length; return { ok, n: xs.length } }

  const shown = windowGames(win).filter(inD)
  const bars = shown.map((g) => {
    const v = m.val(g), rk = rankOf(m, g.opp), c = m.chance ? m.chance(g) : null
    return { key: g.id, v, c, rk, soft: rk != null && rk <= SOFT, on: cleared(m, line, g), top: md(g.date), bot: <>{g.atVs === '@' ? '@' : ''}<Tap onClick={onOpenTeam && g.opp ? () => onOpenTeam(g.opp) : null}>{g.opp || ''}</Tap></>, sub: g.min != null ? `${g.min}m` : '',
      title: `${md(g.date)} ${g.atVs === '@' ? '@' : 'vs'} ${g.opp}: ${v ?? '—'} ${m.word || m.label}${c != null ? ` of ${c} 3PA` : ''}${g.min != null ? `, ${g.min} min` : ''}` }
  })
  if (!games.length) return null
  const winOpts = [...WINDOWS.map(([w]) => w), ...(nextGame ? ['H2H'] : [])]
  return (
    <section aria-label="The bars">
      <Kicker>THE BARS · {logSeason}</Kicker>
      {/* market chips with his hit rate at that market's line in the window you picked */}
      <Pills ariaLabel="Market" value={k} onChange={setK} options={MARKETS.map((x) => {
        const r = rate(x, lines[x.k] ?? x.first, windowGames(win).filter(inD))
        return { key: x.k, text: `${x.label} ${r.n ? `${pct(r.ok, r.n)}%` : '—'}` }
      })} />
      {m.lines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>LINE</span>
          <Pills ariaLabel={`${m.label} line`} value={line} onChange={(l) => setLines((st) => ({ ...st, [k]: l }))} options={m.lines.map((l) => ({ key: l, text: `${l}+` }))} />
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {bars.length
          ? <PropBars games={bars} line={line} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />
          : <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{win === 'H2H' ? `No games against ${nextGame?.opp} in this log.` : 'No games against these defences yet.'}</p>}
      </div>
      {/* window chips: how often he cleared this line, each window */}
      <div role="group" aria-label="Window" style={{ display: 'grid', gridTemplateColumns: `repeat(${winOpts.length}, minmax(0, 1fr))`, gap: 4, marginTop: 8 }}>
        {winOpts.map((w) => {
          const r = rate(m, line, windowGames(w).filter(inD)), on = w === win
          return (
            <button key={w} type="button" onClick={() => setWin(w)} aria-pressed={on}
              style={{ minHeight: 44, borderRadius: 8, border: `1px solid ${on ? C.purple : C.border}`, background: on ? C.bg3 : 'transparent', color: C.text, font: `700 11px/1.2 ${NUM_FONT}`, padding: '4px 2px', cursor: 'pointer' }}>
              <div style={{ color: on ? C.purple : C.text3, fontSize: 10 }}>{w === 'Season' ? 'SZN' : w}</div>
              <div>{r.n ? `${r.ok}/${r.n}` : '—'}</div>
              <div style={{ color: C.text2, fontSize: 10 }}>{r.n ? `${pct(r.ok, r.n)}%` : ''}</div>
            </button>
          )
        })}
      </div>
      {ranked ? <div style={{ marginTop: 8 }}><Pills ariaLabel="Opponent defence" value={d} onChange={setDv} options={D_OPTS} /></div> : null}
      <p style={{ margin: '8px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.4 }}>
        Lit = cleared {line}+ · under each bar: his minutes{m.chance ? ' · hollow = 3PA' : ''}{ranked ? ` · R = how much that club gives up to ${POS_WORD[p]?.toLowerCase()}, of 30` : ''}
      </p>
      {nextGame ? (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text2 }}>NEXT: {nextGame.home ? 'vs' : '@'} <Tap onClick={onOpenTeam ? () => onOpenTeam(nextGame.opp) : null}><b style={{ color: C.text }}>{nextGame.opp}</b></Tap>, {fmtTip(nextGame.start)}</p>
      ) : null}
    </section>
  )
}
