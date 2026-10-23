'use client'
import { useMemo, useState } from 'react'
import PropBars from '../player/PropBars'
import SplitChips from '../player/SplitChips'
import { tagGames, barChips, applyChips, marginOf, chipKey } from '../../lib/barFilters'
import { minutesInBlowouts } from '../../lib/blowout'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { propLanesOf } from '../../lib/propLanes'
import { SEGMENTS, segmentLine } from '../../lib/nba/quarters'
import { FLAT_CHIP_CLASS, flatChip } from '../../lib/chips'
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
// QUARTER SPLITS (2026-10-22, lib/nba/quarters.js): the same bars for one quarter or half. Counted from the play-by-play
// (buckets_quarters); a game with no period rows on file is left out, never drawn as a zero. DD / TD are whole-game markets.
// The lines are the ones a quarter / half prop is offered around, to tap through; nothing is fitted.
const SEG_LINES = {
  q: { pts: [[3, 5, 7, 9], 5], reb: [[1, 2, 3, 4], 2], ast: [[1, 2, 3], 1], '3pm': [[1, 2], 1], pra: [[6, 8, 10, 12], 8] },
  h: { pts: [[6, 10, 12, 15], 10], reb: [[2, 3, 4, 5], 3], ast: [[2, 3, 4], 2], '3pm': [[1, 2, 3], 1], pra: [[12, 15, 18, 20], 15] },
}
const SEG_VAL = { pts: (q) => q.pts, reb: (q) => q.reb, ast: (q) => q.ast, '3pm': (q) => q.tpm, pra: (q) => q.pts + q.reb + q.ast }
const segMarkets = (seg) => {
  const band = SEG_LINES[seg[0]]
  return MARKETS.filter((x) => SEG_VAL[x.k]).map((x) => ({ ...x, lines: band[x.k][0], first: band[x.k][1], rank: null,
    val: (g) => (g._q ? SEG_VAL[x.k](g._q) : null), chance: x.k === '3pm' ? (g) => g._q?.tpa ?? null : undefined }))
}
const SOFT = 10
const md = (iso) => { try { return new Date(`${gameDay(iso)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) } catch { return '' } }
const pct = (ok, n) => (n ? Math.round((100 * ok) / n) : null)

export default function PlayerBars({ log = [], logSeason = '', pos = '', pos5 = null, blow = null, blowLog = [], seasonYears = null, nextGame = null, quarters = null, onOpenTeam = null }) {
  const [k, setK] = useState('pts')
  const [lines, setLines] = useState({})
  const [win, setWin] = useState('L10')
  const [picked, setPicked] = useState({})
  const [pin, setPin] = useState(null)   // a tapped bar: its game's line under the chart
  const [seg, setSeg] = useState('full')   // the whole game, or one quarter / half (QUARTER SPLITS)
  const { data: dp } = useBucketsDefPos(null)
  const all = useMemo(() => log.filter((g) => g.seasonType === 2 || g.seasonType === 3).slice().reverse(), [log])  // oldest -> newest
  // his period rows by game ({ gameId: { period: row } }); the chips draw only when some of his games have them
  const qByGame = useMemo(() => Object.fromEntries(Object.entries(quarters || {}).map(([id, rs]) => [id, Object.fromEntries(rs.map(([pr, pts, reb, ast, tpm, tpa]) => [pr, { pts, reb, ast, tpm, tpa }]))])), [quarters])
  const hasQ = all.some((g) => qByGame[g.id])
  const segOn = seg !== 'full' && hasQ
  const games = useMemo(() => (segOn ? all.filter((g) => qByGame[g.id]).map((g) => ({ ...g, _q: segmentLine(qByGame[g.id], seg) })) : all), [all, segOn, seg, qByGame])
  const markets = segOn ? segMarkets(seg) : MARKETS
  const m = markets.find((x) => x.k === k) || markets[0]
  const lineKey = (mk) => `${segOn ? seg[0] : 'full'}:${mk.k}`
  const line = lines[lineKey(m)] ?? m.first
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
      title: `${md(g.date)} ${g.atVs === '@' ? '@' : 'vs'} ${g.opp}${segOn ? ` (${SEGMENTS.find((x) => x.k === seg).label})` : ''}: ${v ?? '—'} ${m.word || m.label}${c != null ? ` of ${c} 3PA` : ''}${g.min != null ? `, ${g.min} min in the game` : ''}` }
  })
  if (!games.length) return null
  const winOpts = [...WINDOWS.map(([w]) => w), ...(nextGame ? ['H2H'] : [])]
  return (
    <section aria-label="The bars">
      <Kicker>THE BARS · {logSeason}</Kicker>
      {/* market chips with his hit rate at that market's line in the window you picked */}
      <Pills ariaLabel="Market" value={m.k} onChange={setK} options={markets.map((x) => {
        const r = rate(x, lines[lineKey(x)] ?? x.first, windowGames(win, x))
        return { key: x.k, text: `${x.label} ${r.n ? `${pct(r.ok, r.n)}%` : '—'}` }
      })} />
      {m.lines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>LINE</span>
          <Pills ariaLabel={`${m.label} line`} value={line} onChange={(l) => setLines((st) => ({ ...st, [lineKey(m)]: l }))} options={m.lines.map((l) => ({ key: l, text: `${l}+` }))} />
        </div>
      )}
      {hasQ ? (
        <div role="group" aria-label="Part of the game" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          {SEGMENTS.map((x) => (
            <button key={x.k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={seg === x.k} onClick={() => { setSeg(x.k); setPin(null) }}
              style={flatChip(seg === x.k, C.purple, C, NUM_FONT)}>{x.label}</button>
          ))}
        </div>
      ) : null}
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
            {(() => { const L = g._q || g; return <>{segOn ? <span style={{ color: C.purple }}>{SEGMENTS.find((x) => x.k === seg).label}</span> : null}<span>{L.pts ?? '—'} PTS</span><span>{L.reb ?? '—'} REB</span><span>{L.ast ?? '—'} AST</span><span>{L.tpm ?? '—'} 3PM</span></> })()}{g.min != null ? <span>{g.min} MIN{segOn ? ' (game)' : ''}</span> : null}
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
        Lit = cleared {line}+{segOn ? ` in ${SEGMENTS.find((x) => x.k === seg).label}` : ''} · under each bar: his minutes{segOn ? ' (whole game)' : ''}{m.chance ? ' · hollow = 3PA' : ''}{ranked ? ` · R = how much that club gives up to ${view.words[p]?.toLowerCase()}, of 30` : ''}
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
