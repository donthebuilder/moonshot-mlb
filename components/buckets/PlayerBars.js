'use client'
import { useMemo, useState } from 'react'
import PropBars from '../player/PropBars'
import SplitChips from '../player/SplitChips'
import { tagGames, barChips, applyChips, marginOf, chipKey } from '../../lib/barFilters'
import { minutesInBlowouts } from '../../lib/blowout'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { propLanesOf } from '../../lib/propLanes'
import { useBucketsDefPos } from '../../lib/nba/useBuckets'
import { posView, posKeyFor } from '../../lib/nba/defPos'
import Tap from '../Tap'
import { Kicker, Pills, fmtTip, gameDay } from './ui'

// 🏀 THE BARS (2026-10-21, Donovan: "id rather see bars kinda like propfinder and why arent those just combined into one").
// One section where THE BARS strip and the PROPS matrix used to be two: the market chips carry his hit rate in the
// window you picked, the line chips move the line, one bar a game (components/player/PropBars.js), and the window chips
// under it (L5 / L10 / L20 / season / vs tonight's club) say how often he cleared it. Regular season and playoffs only;
// preseason is camp minutes. Under each bar: his minutes (stats first). Hollow bar = the chance behind the result in the
// same unit (3PA behind 3PM now; potential assists / rebound chances wait on the bot, BOT-DATA-REQUESTS.md "NBA chances").
// R:N = the opponent's rank of 30 at giving the stat up to his position (G/F/C, buckets_defpos season table, only when it
// is the log's own season); lit = a top-10 giver. The split chips (components/player/SplitChips + lib/barFilters, shared)
// filter his games first; the window chips then count the newest N of what is left.
// BUCKETS' lanes with bars, from the one list per sport (lib/propLanes.js, 2026-10-22), in the shape this page reads
const MARKETS = propLanesOf('nba').filter((l) => l.bars !== false).map((l) => ({ k: l.key, label: l.label, lines: l.lines, first: l.first, val: l.stat, chance: l.chance, rank: l.rank, word: l.word }))
const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Season', Infinity]]
const SOFT = 10
const md = (iso) => { try { return new Date(`${gameDay(iso)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) } catch { return '' } }
const pct = (ok, n) => (n ? Math.round((100 * ok) / n) : null)

export default function PlayerBars({ log = [], logSeason = '', pos = '', pos5 = null, blow = null, blowLog = [], seasonYears = null, nextGame = null, onOpenTeam = null }) {
  const [k, setK] = useState('pts')
  const [lines, setLines] = useState({})
  const [win, setWin] = useState('L10')
  const [picked, setPicked] = useState({})
  const [pin, setPin] = useState(null)   // a tapped bar: its game's line under the chart
  const { data: dp } = useBucketsDefPos(null)
  const m = MARKETS.find((x) => x.k === k)
  const line = lines[k] ?? m.first
  const games = useMemo(() => log.filter((g) => g.seasonType === 2 || g.seasonType === 3).slice().reverse(), [log])  // oldest -> newest
  // PG..C once the five-position table is ready this season, else G / F / C (lib/nba/defPos posView)
  const view = posView(dp)
  const p = posKeyFor(dp, pos, pos5)
  const table = p && dp?.seasonLabel && dp.seasonLabel === logSeason ? view.table?.[p]?.Season : null
  const rankOf = (mk, abbrev) => (table && mk.rank ? table[abbrev]?.r?.[mk.rank] ?? null : null)
  const cleared = (mk, ln, g) => { const v = mk.val(g); return v != null && v >= ln }

  // THE FILTERS first (lib/barFilters: home/away, won/lost, B2B/rested, close/blowout, minutes, soft/tough D, playoffs),
  // then the window takes the newest N of what is left -- "L10" with Away picked = his last 10 road games
  const ranked = games.some((g) => rankOf(m, g.opp) != null)
  const chips = barChips({ soft: SOFT, hasRank: ranked, hasPlayoff: games.some((g) => g.seasonType === 3) })
  const kept = (mk) => applyChips(tagGames(games, { day: (g) => gameDay(g.date), home: (g) => (g.atVs === '@' ? false : g.atVs ? true : null),
    win: (g) => (g.result === 'W' ? true : g.result === 'L' ? false : null), min: (g) => g.min, margin: (g) => marginOf(g.score),
    rank: (g) => rankOf(mk, g.opp), playoff: (g) => g.seasonType === 3 }), chips, picked).map((t) => t.g)
  const windowGames = (w, mk = m) => { const xs = kept(mk); return w === 'H2H' ? xs.filter((g) => nextGame && g.opp === nextGame.opp) : xs.slice(-(WINDOWS.find(([x]) => x === w)?.[1] ?? 10)) }
  const picks = chips.filter((c) => picked[c.group] === c.key).map((c) => c.text)
  const rate = (mk, ln, list) => { const xs = list.filter((g) => mk.val(g) != null); const ok = xs.filter((g) => cleared(mk, ln, g)).length; return { ok, n: xs.length } }

  const shown = windowGames(win)
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
        const r = rate(x, lines[x.k] ?? x.first, windowGames(win, x))
        return { key: x.k, text: `${x.label} ${r.n ? `${pct(r.ok, r.n)}%` : '—'}` }
      })} />
      {m.lines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>LINE</span>
          <Pills ariaLabel={`${m.label} line`} value={line} onChange={(l) => setLines((st) => ({ ...st, [k]: l }))} options={m.lines.map((l) => ({ key: l, text: `${l}+` }))} />
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <SplitChips chips={chips} picked={picked} onChange={setPicked} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />
      </div>
      <div style={{ marginTop: 10 }}>
        {bars.length
          ? <PropBars games={bars} line={line} C={C} NUM_FONT={NUM_FONT} accent={C.purple} selected={pin} onSelect={setPin} />
          : <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{win === 'H2H' ? `No games against ${nextGame?.opp} in this log.` : `No ${picks.join(' · ').toLowerCase()} games in this log.`}</p>}
      </div>
      {(() => {
        const g = pin ? shown.find((x) => x.id === pin) : null
        if (!g) return null
        return (
          <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, font: `600 12px/1.5 ${NUM_FONT}`, color: C.text2, border: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <b style={{ color: C.text }}>{md(g.date)} {g.atVs === '@' ? '@' : 'vs'} {g.opp}</b>
            <span>{g.pts ?? '—'} PTS</span><span>{g.reb ?? '—'} REB</span><span>{g.ast ?? '—'} AST</span><span>{g.tpm ?? '—'} 3PM</span>{g.min != null ? <span>{g.min} MIN</span> : null}
            <button type="button" onClick={() => setPin(null)} aria-label="Unpin the game" style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, background: 'none', border: 'none', color: C.text3, cursor: 'pointer', font: 'inherit' }}>✕</button>
          </div>
        )
      })()}
      {/* window chips: how often he cleared this line, each window */}
      <div role="group" aria-label="Window" style={{ display: 'grid', gridTemplateColumns: `repeat(${winOpts.length}, minmax(0, 1fr))`, gap: 4, marginTop: 8 }}>
        {winOpts.map((w) => {
          const r = rate(m, line, windowGames(w)), on = w === win
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
      <p style={{ margin: '8px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.4 }}>
        Lit = cleared {line}+ · under each bar: his minutes{m.chance ? ' · hollow = 3PA' : ''}{ranked ? ` · R = how much that club gives up to ${view.words[p]?.toLowerCase()}, of 30` : ''}
        <br />{chipKey({ soft: SOFT, hasRank: ranked })}
      </p>
      {nextGame ? (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text2 }}>NEXT: {nextGame.home ? 'vs' : '@'} <Tap onClick={onOpenTeam ? () => onOpenTeam(nextGame.opp) : null}><b style={{ color: C.text }}>{nextGame.opp}</b></Tap>, {fmtTip(nextGame.start)}</p>
      ) : null}
      {/* 💨 BLOWOUT WATCH (lib/blowout.js): the book's spread tonight, then what lopsided games did to HIS minutes */}
      {blow?.watch ? (() => {
        // both seasons (this one is short early on), regular season + playoffs, said so in the line
        const mb = minutesInBlowouts('nba', blowLog.filter((g) => g.seasonType === 2 || g.seasonType === 3))
        const yrs = seasonYears ? [seasonYears.prev, seasonYears.cur].filter(Boolean).join(' + ') : ''
        return (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text2, lineHeight: 1.45 }}>
            <b style={{ color: C.amber }}>BLOWOUT WATCH</b> · the book has {blow.fav} by {blow.spread} ({blow.at}+ = watch)
            {mb ? <> · his {mb.at}+ margin games{yrs ? ` (${yrs})` : ''}: <b style={{ color: C.text, fontFamily: NUM_FONT }}>{mb.blowMin} min</b> ({mb.blowN}) vs <b style={{ color: C.text, fontFamily: NUM_FONT }}>{mb.restMin}</b> the rest</> : null}
          </p>
        )
      })() : null}
    </section>
  )
}
