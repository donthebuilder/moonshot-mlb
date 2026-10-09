'use client'
import { useHashFilter } from '../../../lib/filterHash'
import { nhlMug } from '../../../lib/nhl/format'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import LampTable from '../LampTable'
import { AngleRow, Segmented, PillRow } from '../../Filters'
import BoardTopBar from '../../BoardTopBar'
import FiltersDrawer, { DrawerSection, drawerChip } from '../../FiltersDrawer'
import { TIME_WINDOWS, inWindow } from '../../BoardFilters'
import RangeDual from '../../RangeDual'
import GoalWatch from '../GoalWatch'
import GoalCompare from '../GoalCompare'
import MobileFold, { useIsPhone } from '../../MobileFold'
import LedgerChip from '../../LedgerChip'
import CardButton from '../../CardButton'
import { downloadLampBoardCard } from '../shareCard'
import WatchChip from '../../WatchChip'
import HowToRead from '../../HowToRead'
import { LampCards, PctBars, countOf } from '../LampCard'
import { alpha } from '../../../lib/scales'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, StaleSeasonNote, fmtDay, fmtPuckDrop, fmtSec, zoneAbbrev, shiftDay, STATUS, CalledChip, readHashParam, writeHashParam } from '../ui'
import { withNhlFullSet } from '../../../lib/nhl/boardColumns'
import { useWhySheet, whyColumn } from '../../WhySheet'
import { MatchLogos } from '../../TeamMark'
import LAMP_BT from '../../../lib/nhl/angleBacktest.json'
import { localTime } from '../../../lib/localTime'

// 🏒 THE LAMP GOAL BOARD (lamp-goal-v1) — the product's first signal page.
// Per game: every scored skater ranked, the top skater on each TEAM CALLED, the rest ON
// THE BOARD, the unscored roster men NOT ON THE BOARD with the reason
// printed. Three words, same meaning as MOONSHOT and TUDDY.
//
// LOCKED vs PREVIEW is printed on every game in capitals: a PREVIEW is the
// same arithmetic run now, before the lock window, and is not a call; a
// LOCKED board is what the record holds (the last write before puck drop,
// app/api/lamp/tick). After the final the GOALS column fills and a hit
// lights the lamp. Every number is a field or a percentile of a field.
// The three words live in ../ui (STATUS), shared with the goal lists.
export { STATUS }

// HOW TO READ THIS, LAMP's words (components/HowToRead.js draws them; the same
// component as MOONSHOT's and TUDDY's boards). Describes the page; no hit rates.
const HOW_NOTES = [
  { title: 'Rank in his game', text: 'LAMP ranks each game on its own, #1 first. The top skater on each team is the call, two in every game.' },
  { title: 'The player', text: 'Tap a name to open his page: his shots, goals and ice time.' },
  { title: 'Goal score', text: 'Three ranks averaged against tonight\u2019s skaters: shots, goals and ice time per game over his last 82 games, 0\u2013100. A ranking, not a percent.' },
  { title: 'The call', text: 'CALLED means he\u2019s the top skater on his team in his game (the shots and points boards call three a game). ON THE BOARD means he\u2019s scored but not called. Calls lock before puck drop.' },
  { title: 'Game', text: 'His game and puck drop, in your time zone.' },
]
const HOW_STEPS = [
  { icon: '👆', text: 'Tap a name to open his page.' },
  { icon: '★', text: 'Add him to your watchlist.' },
  { icon: '✅', text: 'After the game, every call is graded under Results.' },
]

// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
// The score's own parts per market (r.pct keys, percentiles 0-100).
const BAND_DEFS = {
  GOAL: [{ key: 'shotsPg', label: 'Shots / GP' }, { key: 'goalsPg', label: 'Goals / GP' }, { key: 'toi', label: 'Ice time' }],
  SOG: [{ key: 'shotsPg', label: 'Shots / GP' }, { key: 'toi', label: 'Ice time' }, { key: 'oppSaPg', label: 'Opp shots allowed' }],
  PTS: [{ key: 'ptsPg', label: 'Points / GP' }, { key: 'toi', label: 'Ice time' }, { key: 'oppGaPg', label: 'Opp goals allowed' }],
  AST: [{ key: 'astPg', label: 'Assists / GP' }, { key: 'toi', label: 'Ice time' }, { key: 'oppGaPg', label: 'Opp goals allowed' }],
}

export default function Board({ onOpenPlayer, onOpenGame, onOpenTeam, date = null, setDate = () => {}, market: marketTab = null, onMarket = null }) {
  // The market lives in the address (#...&m=sog) so a shared link opens the
  // same board; GOAL is the default and writes nothing.
  // THE SHOTS SLOT (2026-09-28, nav like MOONSHOT's): the bar's Shots tab
  // passes market="SOG"; the market pills tell the shell (onMarket) so the
  // bar lights the slot you are actually on. Old #tab=board&m=sog links still
  // open the shots board.
  const [market, setMarketRaw] = useState(() => { if (marketTab) return marketTab; const m = String(readHashParam('m') || '').toUpperCase(); return MARKETS.some((x) => x.key === m) ? m : 'GOAL' })
  useEffect(() => { if (marketTab) setMarketRaw(marketTab) }, [marketTab])
  const setMarket = (m) => { setMarketRaw(m); writeHashParam('m', m === 'GOAL' ? null : m.toLowerCase()); onMarket?.(m) }
  const M = marketOf(market)
  // ONE READ PER MARKET (2026-10-08): each chip carries its count (skaters with a score for that market), as TUDDY's do
  const bGoal = useLampBoard(date, 'GOAL'), bSog = useLampBoard(date, 'SOG'), bPts = useLampBoard(date, 'PTS'), bAst = useLampBoard(date, 'AST')
  const boardsBy = { GOAL: bGoal, SOG: bSog, PTS: bPts, AST: bAst }
  const { data, error, loading } = boardsBy[market] || bGoal
  const marketCounts = useMemo(() => Object.fromEntries(MARKETS.map((m) => {
    const d = boardsBy[m.key]?.data
    return [m.key, d ? (d.games || []).filter((g) => !g.noMarketLock).reduce((n, g) => n + g.rows.filter((r) => r.status !== 'off' && r.score != null && Number.isFinite(Number(r.score))).length, 0) : null]
  })), [bGoal.data, bSog.data, bPts.data, bAst.data]) // eslint-disable-line react-hooks/exhaustive-deps
  // TEST is a small tag inside the chip, not a longer label: the record rule (no record until 30 graded nights) stays printed
  const marketOptions = MARKETS.map((m) => ({ key: m.key, count: marketCounts[m.key] ?? undefined, title: m.label.replace(' \u00b7 TEST', '') + (m.test ? ' (a test: no record until 30 graded nights)' : ''),
    label: <>{m.short}{m.test ? <span style={{ marginLeft: 6, padding: '1px 4px', borderRadius: 4, border: `1px solid ${C.border2}`, color: C.text3, font: `800 9px/1.2 ${NUM_FONT}`, letterSpacing: '.06em' }}>TEST</span> : null}</>, }))
  const games = data?.games || []
  const lockedN = games.filter((g) => g.locked).length
  const calledN = games.reduce((n, g) => n + g.rows.filter((r) => r.status === 'called').length, 0)
  const shown = data?.date || date
  // ── FILTERS, MOONSHOT'S SET (2026-09-27, board filters plan, LAMP 1-5) ──
  // BY GAME (the layout Donovan likes, unchanged) or ALL GAMES (one table,
  // every scored skater tonight ranked by score). One filter row + one Angle
  // row cut both views. Every test reads a field the row already carries.
  // Opens on ALL GAMES (2026-09-29, Donovan: "boards nhl need to open to all
  // games"); By game is one tap away.
  const phone = useIsPhone()
  const [opts, setOpts] = useState(false)
  const [view, setView] = useState('all')
  const [q, setQ] = useState('')
  const [team, setTeam] = useHashFilter('fteam')
  const [pos, setPos] = useState('all')
  const [gameF, setGameF] = useHashFilter('fgame')
  const [calledOnly, setCalledOnly] = useState(false)
  // LIST | CARDS (2026-09-28, plan C2): MOONSHOT's and TUDDY's toggle. List leads.
  const [layout, setLayout] = useState('list')
  const [angle, setAngle] = useState(null)
  // ── MOONSHOT'S DRAWER (2026-09-28, Donovan: "on the boards we can toggle
  // teams, games, multi filters, all type filters -- use MLB as the base,
  // USE THE COMPONENTS"). LAMP had the top bar, angles, Pos and Called only
  // but no ▤ Filters drawer. It now has MOONSHOT's (components/FiltersDrawer)
  // with MOONSHOT's sections, filled from fields every row already carries:
  //   score range   r.score, 0-100
  //   bands         the score's own parts, r.pct (percentiles, 0-100):
  //                 GOAL shots/GP, goals/GP, ice time; SHOTS shots/GP, ice
  //                 time, opponent shots allowed -- several at once, an AND
  //   games         several at once (MOONSHOT's Game chips)
  //   puck drop     MOONSHOT's own time windows (BoardFilters TIME_WINDOWS)
  //   PP goals      a minimum on r.ppg
  const [scoreMin, setScoreMin] = useState(0)
  const [scoreMax, setScoreMax] = useState(100)
  const [bands, setBands] = useState([])   // [{ key, min, max }]
  const [gameSel, setGameSel] = useState([])
  const [timeWindow, setTimeWindow] = useState('all')
  const [minPpg, setMinPpg] = useState(0)
  const flat = useMemo(() => games.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.filter((r) => r.status !== 'off').map((r) => ({ r, g }))), [games])
  // The row the "How to read this" picture draws: tonight's real top goal
  // score. Its label is the row's own status (goalModel scoreNight), never
  // re-derived here.
  const howRow = useMemo(() => {
    if (market !== 'GOAL') return null
    let best = null
    for (const x of flat) if (!best || (x.r.score ?? -1) > (best.r.score ?? -1)) best = x
    if (!best) return null
    const { r, g } = best
    const home = g.game.home.abbrev === r.team
    return {
      sport: 'nhl', photo: nhlMug(g.game.season, r.team, r.playerId), team: r.team, opp: null, name: r.name, rank: r.rank ?? 1,
      caption: 'One row from tonight\u2019s board, taken apart.',
      score: { label: 'Goal', value: r.score, dp: 0 },
      pick: r.status === 'off' ? null : STATUS[r.status], pickNone: STATUS.off,
      fifth: { label: 'Game', value: `${home ? 'vs' : '@'} ${home ? g.game.away.abbrev : g.game.home.abbrev} \u00b7 ${fmtPuckDrop(g.game.startUtc)} ${zoneAbbrev()}` },
    }
  }, [flat, market])
  const angles = useMemo(() => lampAngles(flat, market), [flat, market])
  const angleTest = angle ? angles.find((a) => a.key === angle)?.test : null
  const needle = q.trim().toLowerCase()
  const kept = flat.filter((x) => {
    const { r, g } = x
    if (team && r.team !== team) return false
    if (pos !== 'all' && (pos === 'D' ? r.pos !== 'D' : r.pos === 'D')) return false
    if (gameF && String(g.game.id) !== gameF) return false
    if (calledOnly && r.status !== 'called') return false
    if (needle && !String(r.name || '').toLowerCase().includes(needle)) return false
    if (angleTest && !angleTest(x)) return false
    if ((r.score ?? 0) < scoreMin || (r.score ?? 0) > scoreMax) return false
    for (const b of bands) { const v = r.pct?.[b.key]; if (v == null || v < b.min || v > b.max) return false }
    if (gameSel.length && !gameSel.includes(String(g.game.id))) return false
    if (!inWindow(g.game.startUtc ? new Date(g.game.startUtc).getHours() : null, timeWindow)) return false
    if (minPpg && (r.ppg ?? 0) < minPpg) return false
    return true
  })
  const keepIds = new Set(kept.map(({ r, g }) => `${g.game.id}|${r.playerId}`))
  const drawerOn = scoreMin > 0 || scoreMax < 100 || bands.length > 0 || gameSel.length > 0 || timeWindow !== 'all' || minPpg > 0
  const filtering = Boolean(team) || pos !== 'all' || Boolean(gameF) || calledOnly || Boolean(needle) || Boolean(angle) || drawerOn
  // A filter the day no longer has stays in the select, named (the Controls.js pattern, 2026-10-05):
  // a stale #fteam / #fgame matched nothing while the select read "All".
  const teams = [...new Set([...flat.map(({ r }) => r.team), ...(team && data ? [team] : [])])].sort()
  const chips = [
    angle ? { key: 'angle', label: angles.find((a) => a.key === angle)?.label || angle, onClear: () => setAngle(null) } : null,
    pos !== 'all' ? { key: 'pos', label: pos === 'D' ? 'Defence' : 'Forwards', onClear: () => setPos('all') } : null,
    calledOnly ? { key: 'called', label: 'Called only', onClear: () => setCalledOnly(false) } : null,
  ].filter(Boolean)
  const gameOptions = games.filter((g) => !g.noMarketLock).map((g) => ({ key: String(g.game.id), label: `${g.game.away.abbrev} @ ${g.game.home.abbrev}` }))
  if (gameF && data && !gameOptions.some((o) => o.key === gameF)) gameOptions.unshift({ key: gameF, label: 'Game not on this slate' })
  const bandDefs = BAND_DEFS[market] || BAND_DEFS.GOAL
  const toggleBand = (k) => setBands((bs) => (bs.some((b) => b.key === k) ? bs.filter((b) => b.key !== k) : [...bs, { key: k, min: 50, max: 100 }]))
  const setBand = (k, min, max) => setBands((bs) => bs.map((b) => (b.key === k ? { ...b, min, max } : b)))
  const drawerChips = [
    scoreMin > 0 || scoreMax < 100 ? { key: 'score', label: `Score ${scoreMin}–${scoreMax}`, onClear: () => { setScoreMin(0); setScoreMax(100) } } : null,
    ...bands.map((b) => ({ key: `band-${b.key}`, label: `${bandDefs.find((d) => d.key === b.key)?.label || b.key} ${b.min}–${b.max}`, onClear: () => toggleBand(b.key) })),
    ...gameSel.map((id) => ({ key: `game-${id}`, label: gameOptions.find((o) => o.key === id)?.label || id, onClear: () => setGameSel((s) => s.filter((x) => x !== id)) })),
    timeWindow !== 'all' ? { key: 'time', label: TIME_WINDOWS.find((w) => w.key === timeWindow)?.label || timeWindow, onClear: () => setTimeWindow('all') } : null,
    minPpg > 0 ? { key: 'ppg', label: `PP goals ${minPpg}+`, onClear: () => setMinPpg(0) } : null,
  ].filter(Boolean)
  const clearAll = () => { setAngle(null); setPos('all'); setCalledOnly(false); setScoreMin(0); setScoreMax(100); setBands([]); setGameSel([]); setTimeWindow('all'); setMinPpg(0) }
  // MOONSHOT'S ORDER (2026-09-27, Donovan: "doesn't feel anything like the mlb
  // pages"): the search / team / game bar first, the market as the parent
  // pills under it, the day, the angle row, then the night's header and the
  // boards. Was: header, market buttons, day buttons, banner, then a row of
  // small grey selects.
  const angleDef = angle ? angles.find((a) => a.key === angle) : null
  const viewSwitch = <Segmented value={view} onChange={setView}
    options={[{ key: 'game', label: 'By game', title: 'Each game, its two calls (one per team) on top' }, { key: 'all', label: 'All games', title: 'Every scored skater tonight, one ranked table' }]} />
  const layoutSwitch = <Segmented value={layout} onChange={setLayout}
    options={[{ key: 'list', label: '☰ List', title: 'One sortable table per game' }, { key: 'cards', label: '▦ Cards', title: 'The card board' }]} />
  // the day, and Called only beside it: one row, the same two buttons on every Rankings page
  const dayRow = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
      <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
      <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
      <NavBtn onClick={() => setCalledOnly((v) => !v)} strong={calledOnly} title="Only the called skaters.">{calledOnly ? '✓ Called only' : 'Called only'}</NavBtn>
    </div>)
  const drawerSections = (<>
    <DrawerSection label="Position">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
        {[['all', 'All'], ['F', 'Forwards'], ['D', 'Defence']].map(([k, l]) => <button key={k} type="button" onClick={() => setPos(k)} style={drawerChip(pos === k)}>{l}</button>)}
      </div>
    </DrawerSection>
    <DrawerSection label={`Score · ${M.label || market}`}>
      <div style={{ fontSize: 12, fontFamily: NUM_FONT, color: C.text, marginTop: 2 }}>{scoreMin}–{scoreMax}</div>
      <RangeDual min={0} max={100} step={1} low={scoreMin} high={scoreMax} onLow={setScoreMin} onHigh={setScoreMax} label="Score" />
    </DrawerSection>
    <DrawerSection label="Bands · what this score is made of" hint="Percentiles among tonight's skaters, 0-100. Several at once must all clear.">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
        {bandDefs.map((d) => <button key={d.key} type="button" onClick={() => toggleBand(d.key)} style={drawerChip(bands.some((b) => b.key === d.key))}>{d.label}</button>)}
      </div>
      {bands.map((b) => (
        <div key={b.key} style={{ marginTop: 9 }}>
          <div style={{ fontSize: 12, color: C.ice, fontWeight: 800, fontFamily: NUM_FONT }}>{bandDefs.find((d) => d.key === b.key)?.label} {b.min}–{b.max}</div>
          <RangeDual min={0} max={100} step={1} low={b.min} high={b.max} onLow={(v) => setBand(b.key, Math.min(v, b.max), b.max)} onHigh={(v) => setBand(b.key, b.min, Math.max(v, b.min))} label={b.key} />
        </div>
      ))}
    </DrawerSection>
    {gameOptions.length > 1 && (
      <DrawerSection label="Game" hint="Several at once. Stacks with the game picker above -- that one runs first.">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
          {gameOptions.map((o) => <button key={o.key} type="button" onClick={() => setGameSel((s) => (s.includes(o.key) ? s.filter((x) => x !== o.key) : [...s, o.key]))} style={drawerChip(gameSel.includes(o.key))}>{o.label}</button>)}
        </div>
      </DrawerSection>
    )}
    <DrawerSection label="Puck drop">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
        {TIME_WINDOWS.map((w) => <button key={w.key} type="button" onClick={() => setTimeWindow(w.key)} style={drawerChip(timeWindow === w.key)}>{w.label}</button>)}
      </div>
    </DrawerSection>
    <DrawerSection label={`Min power-play goals ${minPpg || '—'}`}>
      <input type="range" min={0} max={20} step={1} value={minPpg} onChange={(e) => setMinPpg(Number(e.target.value))} style={{ width: '100%', accentColor: C.ice }} aria-label="Minimum power-play goals" />
    </DrawerSection>
  </>)
  // 📸 the top of this ranking as a PNG (fix15), in the Filters row beside Ledger and Watchlist: the rows the table shows, best score first
  const shareBtn = kept.length ? <CardButton sport="nhl" label="Download this ranking as an image"
    onDownload={() => downloadLampBoardCard([...kept].sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)).slice(0, 9), { market, date: shown || '', total: kept.length })} /> : null
  const nActive = chips.length + drawerChips.length
  const drawerProps = {
    active: nActive > 0, activeCount: nActive,
    activeFilters: [...chips, ...drawerChips].map((c) => ({ key: c.key, label: c.label, onRemove: c.onClear })),
    reset: clearAll, shown: kept.length, total: flat.length, accent: C.ice, accentInk: C.bg,
    poolTitle: "Skaters on tonight's board that clear the filters. Stacks with the team and game above.", emptyNote: 'Nothing clears every filter at once. Loosen one.',
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* THE WATCH BOX LEADS THE PAGE (2026-10-07, Donovan: back-to-back / watch box "to the top"): MOONSHOT's B2B Watch sits first */}
      {data && market === 'GOAL' && <GoalWatch flat={flat} onOpenPlayer={onOpenPlayer} date={shown} />}
      {phone ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, color: C.text2, fontSize: 13, lineHeight: 1.3 }}>Every skater tonight, #1 down. Tap a header to sort.{M.test ? ' A test.' : ''}</div>
          {howRow && <HowToRead id="nhl-goal-board" accent={C.ice} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />}
        </div>
      ) : (<>
      <BoardTopBar query={q} setQuery={setQ} placeholder="Search skater or team…"
        team={team} setTeam={setTeam} teams={teams} teamLabel="🏒 All teams"
        game={gameF} setGame={setGameF} games={gameOptions} gameLabel="All games" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />
        {data && <span style={{ marginLeft: 'auto' }}>{viewSwitch}</span>}
      </div>
      {dayRow}
      </>)}
      {/* THE FILTERS ROW, ONE FOR BOTH (2026-10-08, TUDDY's anatomy): Filters / Ledger / Watchlist beside the market chips on a phone; the
          angle chips, Called only, the layout and Position sit in the drawer's lead and sections, in the same places BUCKETS' are. */}
      {phone ? (
        <FiltersDrawer ledger="nhl" share={shareBtn} compact {...drawerProps}
          beside={<div style={{ flex: 1, minWidth: 0 }}><PillRow tall value={market} options={marketOptions} onChange={setMarket} /></div>}
          lead={(<div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <BoardTopBar inDrawer query={q} setQuery={setQ} placeholder="Search skater or team…"
              team={team} setTeam={setTeam} teams={teams} teamLabel="🏒 All teams"
              game={gameF} setGame={setGameF} games={gameOptions} gameLabel="All games" />
            {data && <span>{viewSwitch}</span>}
            {dayRow}
            {data && <AngleRow defs={angles} pool={flat} value={angle} onChange={setAngle} accent={C.ice} className="lamp-angle-row" hideEmpty />}
            {angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
            {layoutSwitch}
          </div>)}>
          {drawerSections}
        </FiltersDrawer>
      ) : (
        data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AngleRow defs={angles} pool={flat} value={angle} onChange={setAngle} accent={C.ice} className="lamp-angle-row" hideEmpty />
          {angleDef && <p style={{ margin: 0, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{angleDef.title}</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              {howRow && <HowToRead id="nhl-goal-board" accent={C.ice} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />}
              {layoutSwitch}
            </span>
          </div>
          <FiltersDrawer ledger="nhl" share={shareBtn} {...drawerProps}>{drawerSections}</FiltersDrawer>
        </div>)
      )}
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="per-game stats" />}
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="tonight’s board" /> : null}
      {data && !data.dbReady && <div style={{ color: C.amber, fontSize: 11 }}>The saved record is not available right now. Boards still preview, but nothing locks.</div>}
      {!phone && (
      <PageHeader eyebrow={M.eyebrow} title={shown ? fmtDay(shown) : 'Tonight'}
        note={`Every skater tonight, #1 down.${/TEST/.test(M.eyebrow) ? ' A test: no record until 30 graded nights.' : ''}`}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: `${lockedN}/${games.length}`, label: 'LOCKED', tone: lockedN === games.length && games.length ? C.teal : C.text2 }, { value: calledN, label: 'CALLED', tone: C.ice }] : null} />
      )}
      {view === 'all' && flat.length > 0 && (() => { const pv = kept.filter(({ g }) => !g.graded && !g.locked && !g.setting).length; return pv > 0 ? (
        <div style={{ color: C.amber, font: `800 12px/1.5 ${NUM_FONT}`, letterSpacing: '.06em' }}>
          {pv === kept.length ? 'EVERY GAME IS STILL PREVIEW — NOT A CALL YET' : `${pv} OF ${kept.length} ROWS ARE PREVIEW — NOT A CALL YET`}
        </div>) : null })()}
      {data && games.length === 0 && <EmptyState title="NO GAMES ON THIS DATE" note="No NHL games on this date." />}
      {view === 'all' && flat.length > 0 && (
        kept.length ? (layout === 'cards'
          ? <LampCards market={market} onOpen={onOpenPlayer} items={[...kept].sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)).map(({ r, g }, i) => ({ key: `${g.game.id}|${r.playerId}`, r, g, rank: i + 1, facts: factsOf(g, r) }))} />
          : <AllGamesTable kept={kept} market={market} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />)
          : <EmptyState title="NOTHING MATCHES" note="Clear a filter above." />
      )}
      {view === 'game' && games.map((g) => (g.noMarketLock
        ? (filtering ? null : <EmptyState key={g.game.id} title={`${g.game.away.abbrev} @ ${g.game.home.abbrev} · NO ${M.label} LOCK`} note={`No call: it locked before the ${M.label} board existed.`} />)
        : (!filtering || g.rows.some((r) => keepIds.has(`${g.game.id}|${r.playerId}`)))
          ? <GameBoard key={g.game.id} g={g} market={market} layout={layout} keep={filtering ? keepIds : null} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />
          : null))}
      {view === 'game' && filtering && flat.length > 0 && !kept.length && <EmptyState title="NOTHING MATCHES" note="Clear a filter above." />}
      {/* ⚖️ COMPARE TWO (2026-10-03): MOONSHOT's compare, below the board and
          folded on a phone, the way MOONSHOT's Props and TUDDY's Boards place it. */}
      {market === 'GOAL' && flat.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <MobileFold title="⚖️ Compare two skaters" summary="side by side, with a verdict" accent={C.ice}>
            <GoalCompare rows={flat.map(({ r }) => r)} onOpenPlayer={onOpenPlayer} />
          </MobileFold>
        </div>
      )}
      <SourceLine>Where this comes from: the NHL’s own player and team stats (this season and last), the posted lineups, and the final box scores for grading. A locked row is never rewritten.</SourceLine>
    </div>
  )
}

// THE BOARD, MADE TO POP (lamp research step 1, 2026-09-26). Same structure
// Donovan likes -- grouped by game, the called skaters on top -- drawn the way
// MOONSHOT's Picks reads: the table is LampTable (DenseTable), SCORE and the
// three legs heat-shaded on MOONSHOT's own heat scale (2026-09-28: was LAMP's
// ice ramp, which ended in goal-light red -- red read as bad; a high score now
// looks the same on all three boards), a called row carries a stripe
// and a filled CALLED chip, and "shots 95th · goals 96th · ice time 69th"
// is three small bars (the same three percentiles, r.pct). Nothing new is
// computed here; every cell is a field the board already had.
const PREVIEW_ROWS = 8

// A side's spot for a skater's club (mine) or tonight's opponent (!mine).
export const spotOf = (g, team, mine) => {
  if (!g.spots) return null
  const home = g.game.home.abbrev === team
  return mine ? (home ? g.spots.home : g.spots.away) : (home ? g.spots.away : g.spots.home)
}
export const pct1 = (v) => (v == null ? null : (v * 100).toFixed(1))
export const ppVsPk = (us, them) => (pct1(us?.ppPct) && pct1(them?.pkPct) ? `${pct1(us.ppPct)} v ${pct1(them.pkPct)}` : null)
export const restWord = (s) => (s?.b2b ? 'B2B' : s?.rest != null ? `${s.rest}d` : null)
const factsOf = (g, r) => ({ pp: pct1(spotOf(g, r.team, true)?.ppPct), pk: pct1(spotOf(g, r.team, false)?.pkPct), rest: restWord(spotOf(g, r.team, true)) })

// The LEGS bars are PctBars (../LampCard), shared with the Cards view.

// LAMP v2 (2026-09-27): the board reads one market at a time. GOAL is the
// original; SOG is lamp-sog-v1 (3+ shots on goal). Same table, same words.
const MARKETS = [
  { key: 'GOAL', label: 'GOAL', short: 'GOAL', eyebrow: 'LAMP · RANKINGS · GOAL', note: 'Who we rank tonight, and why. One called per team in every game, locked before puck drop, graded after. Score = mean of three percentile ranks tonight: shots, goals, ice time per game over his last 82 NHL games.', result: 'GOALS', log: 'lamp_goal_log' },
  { key: 'SOG', label: 'SHOTS 3+', short: 'SHOTS 3+', eyebrow: 'LAMP · RANKINGS · SHOTS', note: 'Who we rank tonight, and why. Three called per game for 3+ shots on goal, locked before puck drop, graded after. Score = mean of three percentile ranks tonight: shots per game over his last 82, ice time, and how many shots his opponent allows per 60.', result: 'SOG', log: 'lamp_prop_log' },
  // POINTS and ASSISTS (2026-10-02, Donovan: "the new markets"): locked and graded every night since
  // 10-01 (lamp-pts / lamp-ast), shown as a TEST until each has 30 graded nights (the record rule)
  { key: 'PTS', label: 'POINTS 1+ · TEST', short: 'POINTS 1+', test: true, eyebrow: 'LAMP · RANKINGS · POINTS · TEST', note: 'Who we rank tonight, and why. A TEST: three called per game for 1+ point, locked before puck drop, graded after; no record is printed until 30 graded nights. Score = mean of three percentile ranks tonight: points per game over his last 82, ice time, and how many goals his opponent allows.', result: 'PTS', log: 'lamp_prop_log' },
  { key: 'AST', label: 'ASSISTS 1+ · TEST', short: 'ASSISTS 1+', test: true, eyebrow: 'LAMP · RANKINGS · ASSISTS · TEST', note: 'Who we rank tonight, and why. A TEST: three called per game for 1+ assist, locked before puck drop, graded after; no record is printed until 30 graded nights. Score = mean of three percentile ranks tonight: assists per game over his last 82, ice time, and how many goals his opponent allows.', result: 'AST', log: 'lamp_prop_log' },
]
// The SCORE header's ⓘ, per market (it had none, so no explanation and no
// picture). The legs are the models' own: lib/nhl/goalModel.js and
// lib/nhl/sogModel.js (BAND_DEFS above names the same three per market).
const SCORE_TITLE = {
  GOAL: 'Tonight\u2019s goal score: three ranks against tonight\u2019s skaters, averaged \u2014 shots, goals and ice time per game over his last 82 games. Higher ranks better.',
  SOG: 'Tonight\u2019s shots score: shots and ice time per game, and how many shots his opponent allows, each ranked against tonight\u2019s skaters. Higher ranks better.',
  PTS: 'Tonight\u2019s points score (a TEST): points and ice time per game, and how many goals his opponent allows, each ranked against tonight\u2019s skaters. Higher ranks better.',
  AST: 'Tonight\u2019s assists score (a TEST): assists and ice time per game, and how many goals his opponent allows, each ranked against tonight\u2019s skaters. Higher ranks better.',
}
const SCORE_ART = { GOAL: 'nhl-goal' }   // components/ScoreArt.js
const marketOf = (k) => MARKETS.find((m) => m.key === k) || MARKETS[0]
// each market's own rate columns, read off its legs (one lookup, both tables)
const RATE_COLS = {
  GOAL: [{ key: 'spg', label: 'S/GP', leg: 'shotsPg', dp: 2, w: 44 }, { key: 'gpg', label: 'G/GP', leg: 'goalsPg', dp: 2, w: 44 }],
  SOG: [{ key: 'spg', label: 'S/GP', leg: 'shotsPg', dp: 2, w: 44 }, { key: 'osa', label: 'OPP SA/60', leg: 'oppSaPg', dp: 1, w: 62 }],
  PTS: [{ key: 'ptspg', label: 'P/GP', leg: 'ptsPg', dp: 2, w: 44 }, { key: 'oga', label: 'OPP GA/GP', leg: 'oppGaPg', dp: 2, w: 66 }],
  AST: [{ key: 'apg', label: 'A/GP', leg: 'astPg', dp: 2, w: 44 }, { key: 'oga', label: 'OPP GA/GP', leg: 'oppGaPg', dp: 2, w: 66 }],
}
const rateCols = (market) => (RATE_COLS[market] || RATE_COLS.GOAL).map(({ key, label, dp, w }) => ({ key, label, primary: true, dp, w }))
const rateVals = (r, market) => Object.fromEntries((RATE_COLS[market] || RATE_COLS.GOAL).map((c) => [c.key, r.legs ? r.legs[c.leg] ?? null : null]))

function columnsFor(g, onOpenTeam, market = 'GOAL') {
  const graded = g.graded
  const sog = market === 'SOG'
  return [
    { key: 'rank', label: '#', heat: false, mono: true, w: 28,
      fmt: (v, r) => (r.status === 'called'
        ? <span title={STATUS.called} style={{ display: 'inline-block', minWidth: 16, textAlign: 'center', background: C.ice, color: C.bg, font: `900 10px/16px ${NUM_FONT}`, borderRadius: 4 }}>{v}</span>
        : v) },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 170,
      fmt: (v, r) => <>{v}<span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></> },
    { key: 'team', label: 'TM', heat: false, mono: true, w: 40,
      fmt: (v) => <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTeam?.(v) }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{v}</button> },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 50, explain: SCORE_TITLE[market], art: SCORE_ART[market] || null, answers: market === 'GOAL' ? 'nhl-goal' : null },
    ...rateCols(market),
    { key: 'toi', label: 'TOI', primary: true, w: 48, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
    { key: 'pctl', label: 'LEGS', heat: false, w: 118, fmt: (v, r) => (r.status === 'called' ? <PctBars r={r._row} market={market} /> : null) },
    // Context columns (lamp research step 2): shown beside the score, never
    // in it. PP G is his season's power-play goals; PP v PK is his club's
    // power play against tonight's opponent's penalty kill; REST is full days
    // off before tonight (B2B = played yesterday).
    { key: 'ppg', label: 'PP G', primary: true, w: 44 },
    { key: 'ppvpk', label: 'PP v PK', heat: false, mono: true, w: 84, fmt: (v) => v || '—' },
    { key: 'rest', label: 'REST', heat: false, mono: true, w: 48, fmt: (v) => v || '—' },
    { answers: 'called', key: 'result', label: graded ? marketOf(market).result : 'STATUS', heat: false, w: 96, fmt: (v, r) => {
      const row = r._row
      if (graded) {
        if (row.dressed === false) return <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span>
        const n = countOf(row, market)
        return <>{row.status === 'called' ? <CalledChip /> : null}<span style={{ color: row.hit ? C.ice : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{n == null ? '\u2014' : <>{row.hit && <LampDot />}{n}</>}</span></>
      }
      return row.status === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[row.status]}</span>
    } },
  ]
}

// ═══ THE DASH SLATE TABLE, LAMP'S DEFINITION (2026-10-06) ═══════════════════
// One game, every skater, one table. The next sport copies these rules and
// swaps its own columns; the skin (components/table/v2.js) supplies the rest.
//   WHO IS IN IT   everyone on the board for the game, both clubs, in ONE
//                  table. No "show more" on a game's players: a long table
//                  scrolls inside its own box (maxHeight 480), like MOONSHOT's.
//                  Preview caps belong to the LIST of games, not to a game.
//   ORDER          what you scan first sits leftmost: rank, player (sticky),
//                  the score, then the result once the game is graded, then
//                  the rates (goals, shots, ice time), then power-play goals,
//                  then (before the game is graded) the status word, then the full set (withNhlFullSet): percentiles, sample,
//                  season line, form, matchup. Columns that are the same for
//                  every skater of a club (power play against penalty kill,
//                  rest) are NOT columns: they are the club's boxes above.
//   GROUPS         every column carries a group, in order: Call, Per game,
//                  PP, then the full set's.
//   WIDTH          a figure column is as wide as its figure: 44-56px; the
//                  name 170px; the status word 96px. No column is wider than
//                  its longest value, no empty space, nothing squeezed to "…".
//   TEXT AND ROW   the skin's: figures 11.5px (10px on a phone <= 430px, the
//                  phone-table exception), names 12.5px (11px phone), rows
//                  36px (32px phone). A figure never goes below 10px.
//   LOGOS          the club logo only in the club column (it tells you which
//                  side), folded under the name on a phone. Never beside a
//                  figure, never repeated in a header the card already shows.
//   HEAT           the skin's standouts at rest: in each stat column the top
//                  fifth glows in the product's accent, the bottom fifth
//                  recedes; the sorted column carries the whole ramp. No
//                  red or green.
//   SORT           the board's own rank by default; any header re-sorts, a
//                  second tap reverses, shift-tap adds a tiebreak.
//   STICKY         rank and name stay put while the figures scroll sideways.
//   PHONE          the table scrolls inside its own box, never the page; the
//                  club and position fold under the name. Tapping a row opens
//                  the skater.
function lampSlateColumns(g, market = 'GOAL', onOpenTeam) {
  const graded = g.graded
  const G = { call: { key: 'call', label: 'Call', order: 1 }, rate: { key: 'rate', label: 'Per game', order: 2 }, st: { key: 'st', label: 'PP', order: 3 } }
  const result = graded
    ? [{ answers: 'called', key: 'result', label: marketOf(market).result, heat: false, w: 78, group: G.call, fmt: (v, r) => {
        const row = r._row
        if (row.dressed === false) return <span style={{ color: C.text3, font: `800 11px/1 ${NUM_FONT}` }}>VOID</span>
        const n = countOf(row, market)
        return <>{row.status === 'called' ? <CalledChip /> : null}<span style={{ color: row.hit ? C.ice : C.text3, font: `900 13px/1 ${NUM_FONT}` }}>{n == null ? '\u2014' : <>{row.hit && <LampDot />}{n}</>}</span></>
      } }]
    : [{ answers: 'called', key: 'result', label: 'STATUS', heat: false, w: 104, group: G.call, fmt: (v, r) => (r._row.status === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>{STATUS[r._row.status]}</span>) }]
  return [
    { key: 'rank', label: '#', heat: false, mono: true, w: 30, group: G.call,
      fmt: (v, r) => (r.status === 'called'
        ? <span title={STATUS.called} style={{ display: 'inline-block', minWidth: 18, textAlign: 'center', background: C.ice, color: C.bg, font: `900 11px/18px ${NUM_FONT}`, borderRadius: 4 }}>{v}</span>
        : v) },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 170, group: G.call },
    { key: 'pos', label: 'POS', heat: false, mono: true, w: 44, group: G.call },
    { key: 'team', label: 'TEAM', heat: false, mono: true, w: 52, fold: false, group: G.call, fmt: (v) => v },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 56, group: G.call, explain: SCORE_TITLE[market], art: SCORE_ART[market] || null, answers: market === 'GOAL' ? 'nhl-goal' : null },
    ...(graded ? result : []),
    ...(RATE_COLS[market] || RATE_COLS.GOAL).map(({ key, label, dp, w }) => ({ key, label, primary: true, dp, w: Math.max(w, 56), group: G.rate })),
    { key: 'toi', label: 'TOI', primary: true, w: 56, group: G.rate, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
    { key: 'ppg', label: 'PP G', primary: true, w: 52, group: G.st, explain: 'Power-play goals this season.' },
    ...(graded ? [] : result),
  ]
}

// Exported (2026-09-28) for LAMP's Slate -- the same game board, not a copy.
// slate (2026-10-06): the Slate's game -- the whole table, no header strip of its own
// (the Slate's game header says who plays), no row cap; see lampSlateColumns above.
export function GameBoard({ g, onOpenPlayer, onOpenGame, onOpenTeam, market = 'GOAL', keep = null, layout = 'list', slate = false }) {
  const game = g.game
  const scored = g.rows.filter((r) => r.status !== 'off' && (!keep || keep.has(`${game.id}|${r.playerId}`)))
  const off = g.rows.filter((r) => r.status === 'off')
  const [showOff, setShowOff] = useState(false)
  const live = game.state === 'live'; const done = game.state === 'final'
  const ctx = g.rows[0]?.context || {}
  const stamp = g.graded ? 'GRADED' : g.locked ? 'LOCKED' : g.setting ? 'SETTING · LOCKS AT PUCK DROP' : 'PREVIEW · NOT A CALL'
  const stampTone = g.graded ? C.cream : g.locked ? C.teal : g.setting ? C.ice : C.amber
  // Rank order as the board gives it -- no initial sort, so no "sorted by"
  // line above the table (a phone row the old table didn't spend).
  const rows = [...scored].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map((r) => ({
    id: r.playerId, rank: r.rank, name: r.name, pos: r.pos, team: r.team, score: r.score,
    ...rateVals(r, market), toi: r.legs ? r.legs.toi : null,
    osa: r.legs ? r.legs.oppSaPg ?? null : null,
    pctl: r.status === 'called' ? 1 : 0, result: r.status, status: r.status, _row: r,
    ppg: r.ppg, ppvpk: ppVsPk(spotOf(g, r.team, true), spotOf(g, r.team, false)), rest: restWord(spotOf(g, r.team, true)),
  }))
  return (
    <section aria-label={`${game.away.abbrev} at ${game.home.abbrev}`} style={{ border: `1px solid ${C.border2}`, borderRadius: 12, background: C.bg2, padding: '8px 10px 10px' }}>
      {!slate && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" onClick={() => onOpenGame?.(game.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {/* logos only (Donovan 10-02); the codes ride the logos' title / alt */}
          <MatchLogos sport="nhl" away={game.away.abbrev} home={game.home.abbrev} px={24} gap={6} />
        </button>
        {done || live
          ? <span style={{ color: live ? C.lamp : C.text, font: `900 17px/1 ${NUM_FONT}` }}>{live && <LampDot />}{game.away.score}–{game.home.score}</span>
          : null}
        <span style={{ color: live ? C.lamp : done ? C.text2 : C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{game.statusLine || `${fmtPuckDrop(game.startUtc)} ${zoneAbbrev()}`}</span>
        <GameTypeChip label={game.gameTypeLabel} />
      </div>
      )}
      <div style={{ color: C.text3, fontSize: slate ? 12 : 10.5, lineHeight: 1.5, marginBottom: 8, fontFamily: NUM_FONT }}>
        {/* The stamp leads this line rather than wrapping the header onto a
            second one at 390px. */}
        <span style={{ color: C.bg, background: stampTone, font: `900 ${slate ? 11 : 8}px/1 ${NUM_FONT}`, letterSpacing: '.14em', borderRadius: 5, padding: '3px 6px', marginRight: 7, verticalAlign: '1px' }}>{stamp}</span>
        {/* SHORT (2026-10-04, Donovan: "all these words give me anxiety"): the
            stamp, when it locked, lineups, and once graded who was in net. Rest
            and opponent GA/GP were repeats of the table's own columns; the
            snapshot count told a reader nothing. */}
        {g.locked ? `Locked ${localTime(g.lockedAt, { zone: false })}`
          : g.setting ? `Updated ${localTime(g.lockedAt, { zone: false })} · final at puck drop` : `Locks from ${localTime(g.locksAtUtc, { zone: false })}`}
        {' · '}{g.lineupKnown ? 'lineups in' : 'no lineups yet'}{ctx.b2b ? ' · back-to-back' : ''}
        {g.net ? ` · in net: ${g.net}` : ''}
      </div>
      {scored.length === 0 ? <EmptyState title="NOBODY SCORED YET" note="No skater on either roster has ten NHL games on file." /> : layout === 'cards' ? (
        <LampCards market={market} onOpen={onOpenPlayer} items={rows.map((x) => ({ key: x.id, r: x._row, g, rank: x.rank, facts: { pp: pct1(spotOf(g, x.team, true)?.ppPct), pk: pct1(spotOf(g, x.team, false)?.pkPct), rest: x.rest } }))} />
      ) : (
        <LampTable {...withNhlFullSet(rows, slate ? lampSlateColumns(g, market, onOpenTeam) : columnsFor(g, onOpenTeam, market))} heatMode="primary"
          rowEdge={(r) => (r.status === 'called' ? C.ice : null)}
          faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(game.season, r._row?.team, r._row?.playerId), name: r._row?.name })}
          dimRow={(r) => g.graded && r._row.dressed === false}
          maxRows={slate ? 200 : PREVIEW_ROWS} maxHeight={slate ? 480 : 9999}
          onRowClick={(r) => onOpenPlayer?.(r.id)} />
      )}
      {off.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowOff((v) => !v)} aria-expanded={showOff} style={{ background: 'transparent', border: 'none', padding: slate ? '14px 0' : 0, minHeight: slate ? 44 : undefined, cursor: 'pointer', color: C.text3, font: `800 ${slate ? 12 : 9}px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
            NOT ON THE BOARD · {off.length} {showOff ? '▴' : '▾'}
          </button>
          {showOff && (
            <div style={{ marginTop: 6, color: C.text3, fontSize: slate ? 12 : 11, lineHeight: 1.6 }}>
              {off.map((r) => <div key={r.playerId}><b style={{ color: C.text2 }}>{r.name}</b> {r.team} · {r.reason}{g.graded && r.hit ? <span style={{ color: C.ice, fontFamily: NUM_FONT, marginLeft: 6 }}>scored{countOf(r, market) != null ? ` ${countOf(r, market)}` : ''}</span> : null}</div>)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── LAMP ANGLES (board filters plan, LAMP 3) ─────────────────────────────
// From fields every board row carries; each rule stated, nothing inferred.
//   Power play     his season's power-play goals > 0 (r.ppg)
//   Soft opponent  GOAL: his opponent's goals allowed per game in tonight's
//                  top third (r.context.oppGaPg); SHOTS: opponent shots
//                  allowed per 60 in the top third (r.legs.oppSaPg)
//   Rested edge    tonight's opponent is on a back-to-back (spots)
//   Big minutes    ice time per game in tonight's top quarter (r.legs.toi)
// NOT BUILT: "Hot" (a goal in his last 3) -- the board rows carry no recent-
// games field, and it is never guessed.
function cut(vals, q) { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) * q)] : Infinity }
export function lampAngles(flat, market) {
  const soft = market === 'SOG' ? (r) => r.legs?.oppSaPg : (r) => r.context?.oppGaPg
  const softCut = cut(flat.map(({ r }) => soft(r)), 2 / 3)
  const toiCut = cut(flat.map(({ r }) => r.legs?.toi), 0.75)
  // WEAK SPOT (2026-09-28, parity 00Q step 2): his opponent's penalty kill is
  // in tonight's weakest third and he has power-play goals -- the Slate's
  // weak-spot cards (components/lamp/LampWeakSpots.js), same rule.
  const pkOf = ({ r, g }) => Number(spotOf(g, r.team, false)?.pkPct)
  const seen = new Map()
  for (const x of flat) seen.set(`${x.g.game.id}|${x.r.team}`, pkOf(x))
  const pkCut = cut([...seen.values()], 1 / 3)
  // MEASURED (2026-10-05, Donovan: "needs to be ran for all sports and all props"): every rule below
  // replayed over the whole 2025-26 season as of each night (scripts/nhl/angle-backtest.mjs ->
  // lib/nhl/angleBacktest.json). A market shows only the angles that beat its own board rows; the
  // words quote the file. (Replaced the 10-01..10-04 TEST numbers.)
  const shotsPct = (r) => Number(r.pct?.shotsPg)
  const M = LAMP_BT.lastSeason.markets?.[market] || {}
  const said = (k) => (M[k] ? ` ${LAMP_BT.lastSeason.season} replayed night by night: ${M[k].hits.toLocaleString()} of ${M[k].n.toLocaleString()} (${M[k].rate}%); the board's rows ${M.board.rate}%.` : '')
  const defs = [
    { key: 'aligned', label: '◆ Aligned', title: `His opponent is soft (tonight\u2019s top third) and his shots per game are in tonight\u2019s top quarter.${said('aligned')}`, test: (x) => Number.isFinite(soft(x.r)) && soft(x.r) >= softCut && shotsPct(x.r) >= 75 },
    { key: 'hiconf', label: '🔒 High confidence', title: `Board score 85 or higher.${said('hiconf')}`, test: ({ r }) => Number(r.score) >= 85 },
    { key: 'weak', label: '★ Weak spot', title: `Power-play goals this season, against a penalty kill in tonight\u2019s weakest third.${said('weak')}`, test: (x) => Number(x.r.ppg) > 0 && Number.isFinite(pkOf(x)) && pkOf(x) <= pkCut },
    { key: 'pp', label: 'Power play', title: `Power-play goals this season.${said('pp')}`, test: ({ r }) => Number(r.ppg) > 0 },
    { key: 'soft', label: 'Soft opponent', title: `${market === 'SOG' ? 'His opponent allows shots per 60 in tonight\u2019s top third.' : 'His opponent allows goals per game in tonight\u2019s top third.'}${said('soft')}`, test: ({ r }) => Number.isFinite(soft(r)) && soft(r) >= softCut },
    { key: 'rested', label: 'Rested edge', title: `Tonight\u2019s opponent is on the second night of a back-to-back.${said('rested')}`, test: ({ r, g }) => Boolean(spotOf(g, r.team, false)?.b2b) },
    { key: 'mins', label: 'Big minutes', title: `Ice time per game in tonight\u2019s top quarter.${said('mins')}`, test: ({ r }) => Number.isFinite(r.legs?.toi) && r.legs.toi >= toiCut },
  ]
  return defs.filter((d) => M[d.key]?.verdict === 'edge')
}

// ALL GAMES (board filters plan, LAMP 1): every scored skater tonight, one
// table, ranked by score; the game is a column. Sort any header.
// MERGED WITH RANKINGS (2026-10-06, Donovan: "the rankings and the boards should be
// the same thing"): this is now also the old Rankings table -- his rank in his own
// game (CALLED is the top skater on his team there), the stamp of his game's lock
// (a PREVIEW is not a call), the goals he scored once graded, and a WHY on every row.
const STAMP = { graded: 'GRADED', locked: 'LOCKED', setting: 'SETTING', preview: 'PREVIEW' }
const stampOf = (g) => (g?.graded ? 'graded' : g?.locked ? 'locked' : g?.setting ? 'setting' : 'preview')
const STAMP_TONE = { graded: C.cream, locked: C.teal, setting: C.ice, preview: C.amber }
const LEG_FMT = { shotsPg: (v) => v.toFixed(1), goalsPg: (v) => v.toFixed(2), toi: (v) => fmtSec(v), oppSaPg: (v) => v.toFixed(1), ptsPg: (v) => v.toFixed(2), astPg: (v) => v.toFixed(2), oppGaPg: (v) => v.toFixed(2) }
const ordW = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
const GROUPS = { call: { key: 'call', label: 'Call', order: 0 }, signal: { key: 'signal', label: 'The signal', order: 1 }, shooter: { key: 'shooter', label: 'The shooter', order: 2 } }

const LEG_WORDS = { shotsPg: 'shots per game', goalsPg: 'goals per game', toi: 'ice time', oppSaPg: 'shots his opponent allows', ptsPg: 'points per game', astPg: 'assists per game', oppGaPg: 'goals his opponent allows' }
/** One plain sentence: his strongest part of the score, and where it ranks tonight. `short` is the table's line. */
export function plainWhy(r, market) {
  const defs = BAND_DEFS[market] || BAND_DEFS.GOAL
  const placed = defs.map((d) => ({ d, p: Number(r.pct?.[d.key]) })).filter((x) => Number.isFinite(x.p)).sort((a, b) => b.p - a.p)
  if (!placed.length) return { lead: r.reason || null, short: r.reason || '', watch: null }
  const top = placed[0]; const low = placed[placed.length - 1]
  const w = LEG_WORDS[top.d.key] || top.d.label.toLowerCase()
  return { lead: `His best part is ${w}: ${ordW(top.p)} percentile among tonight’s skaters.`, short: `Best part: ${w}, ${ordW(top.p)} percentile.`,
    watch: low !== top && low.p <= 25 ? `${LEG_WORDS[low.d.key] || low.d.label.toLowerCase()}, ${ordW(low.p)} percentile.` : null }
}
/** The sheet's item for one row: the board's own sentence, its numbers, and where to look next. */
export function whyItemFor(r, market, rank) {
  const defs = BAND_DEFS[market] || BAND_DEFS.GOAL
  const parts = defs.map((d) => {
    const v = r.legs?.[d.key]; const p = r.pct?.[d.key]
    if (!Number.isFinite(Number(v)) && !Number.isFinite(Number(p))) return null
    const f = LEG_FMT[d.key]
    return { label: d.label, text: `${Number.isFinite(Number(v)) && f ? f(Number(v)) : '—'}${Number.isFinite(Number(p)) ? ` · ${ordW(p)} percentile` : ''}`, pct: Number.isFinite(Number(p)) ? Number(p) : null }
  }).filter(Boolean)
  const id = r.playerId
  return {
    name: r.name, rank,
    lead: plainWhy(r, market).lead,
    watch: plainWhy(r, market).watch,
    parts,
    links: [
      { label: 'His page: season, last five, game log', href: `#sport=nhl&tab=player&player=${id}` },
      { label: 'Where he shoots from', href: `#sport=nhl&tab=shotmap&player=${id}` },
      { label: 'Who is hot: last 5 and 10 games', href: '#sport=nhl&tab=hotsticks' },
      { label: 'Tonight’s defences, ranked', href: '#sport=nhl&tab=matchups' },
    ],
  }
}

export function AllGamesTable({ kept, market, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { open, sheet } = useWhySheet({ theme: C, accent: C.ice, numFont: NUM_FONT })
  const rows = [...kept].sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)).map(({ r, g }, i) => ({
    id: r.playerId, rank: i + 1, name: r.name, pos: r.pos, team: r.team, game: `${g.game.away.abbrev}@${g.game.home.abbrev}`,
    score: r.score, ...rateVals(r, market), toi: r.legs ? r.legs.toi : null, gameRank: r.rank,
    osa: r.legs ? r.legs.oppSaPg ?? null : null, status: r.status, _row: r, _g: g,
  }))
  const columns = [
    { key: 'rank', label: '#', heat: false, mono: true, w: 30, group: GROUPS.call, title: 'His place on tonight’s board for this market, all games together.' },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 160, group: GROUPS.call, fmt: (v, r) => <>{v}<span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></> },
    { key: 'team', label: 'TM', heat: false, mono: true, w: 40, group: GROUPS.call, fmt: (v) => <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTeam?.(v) }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{v}</button> },
    // the matchup opens that game (the address says game=<id>), not the row's player card
    { key: 'game', label: 'GAME', heat: false, mono: true, w: 70, group: GROUPS.call, link: (r) => (onOpenGame && r._g?.game?.id ? () => onOpenGame(r._g.game.id) : null) },
    { answers: 'called', key: 'status', label: 'STATUS', heat: false, w: 118, group: GROUPS.call, statusCol: true, fmt: (v, r) => {
      const row = r._row
      return (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r._g?.graded
            ? (row.dressed === false ? <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span>
              : <><CalledChip />{' '}<span style={{ color: row.hit === true ? C.ice : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{countOf(row, market) == null ? '\u2014' : <>{row.hit === true && <LampDot />}{countOf(row, market)}</>}</span></>)
            : (v === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[v]}</span>)}
          <span style={{ color: STAMP_TONE[stampOf(r._g)], font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em', marginLeft: 5 }}>{STAMP[stampOf(r._g)]}</span>
        </span>
      )
    } },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 50, group: GROUPS.signal, explain: SCORE_TITLE[market], art: SCORE_ART[market] || null, answers: market === 'GOAL' ? 'nhl-goal' : null },
    whyColumn({ textOf: (r) => plainWhy(r._row, market).short, itemOf: (r) => whyItemFor(r._row, market, r.rank), open, theme: C, numFont: NUM_FONT, group: GROUPS.signal, w: 165 }),
    { key: 'gameRank', label: 'GAME #', heat: false, mono: true, w: 52, group: GROUPS.signal, title: 'His rank in his own game. CALLED is the top-scored skater on each team (three in a game on the shots, points and assists boards).' },
    ...rateCols(market).map((c) => ({ ...c, group: GROUPS.shooter })),
    { key: 'toi', label: 'TOI', primary: true, w: 48, group: GROUPS.shooter, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
  ]
  return (<>
    <LampTable {...withNhlFullSet(rows, columns)} heatMode="primary" statusOf={(r) => r.status}
      rowEdge={(r) => (r.status === 'called' ? C.ice : null)}
      faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(r._g.game.season, r._row?.team, r._row?.playerId), name: r._row?.name })}
      dimRow={(r) => r._g?.graded && r._row?.dressed === false}
      maxRows={12 /* 0g E3: tonight's top twelve by score, the rest behind "show N more" */} maxHeight={9999} onRowClick={(r) => onOpenPlayer?.(r.id)} />
    {sheet}
  </>)
}

export function NavBtn({ children, onClick, disabled, strong = false, ...rest }) {
  return <button type="button" {...rest} onClick={onClick} disabled={disabled} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2, color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1 }}>{children}</button>
}
