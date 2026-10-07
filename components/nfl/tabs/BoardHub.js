'use client'
import LedgerChip from '../../LedgerChip'
import { useHashFilter } from '../../../lib/filterHash'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, MARKETS } from '../../../lib/nfl/theme'
import { PillRow } from '../../Filters'
import { alpha } from '../../../lib/scales'
import BoardTopBar from '../../BoardTopBar'
import { nflGameOptions } from '../NflBoardExtras'
import Touchdowns, { tdPool } from './Touchdowns'
import HowToRead from '../../HowToRead'
import { STATUS_WORD } from '../../../lib/callStatus'
import Boards from './Boards'
import Picks from './Picks'
import { tdStatusFor } from '../../../lib/nfl/tdStatus'
import { useGameCalls } from '../GameCalls'
import { useIsPhone } from '../../MobileFold'

// 🃏 THE BOARD, ONE PAGE (2026-09-26, Donovan picked option (b) in
// .claude-notes/TUDDY-FOUR-PAGES.md). Board (the TD list) and Boards (the
// same list, one market at a time) were the same page twice -- same 313
// players, same order, same cards on Anytime TD -- and Picks, the one page
// that says CALLED, sat two taps away. Now one page:
//
//   market   Anytime TD first, then every market the model scores
//   CALLED   the bot's five for that market with their record, and your
//            picks against it (the Picks page, scoped to the market)
//   BOARD    everyone the model scored, ranked (Anytime TD keeps its compare
//            tool and confidence filters; other markets show Boards' cards)
//
// The Board (`research`) stays its own page: a table of every number is a
// different shape of thing. Old links still land: #tab=boards opens BOARD,
// #tab=picks opens CALLED. Market and view ride in the hash (m=, view=).
const VIEWS = [
  { key: 'called', label: 'Called', title: "The bot's calls for this market, graded" },
  { key: 'board', label: 'Board', title: 'Everyone the model scored, ranked' },
]
const readHash = () => { try { return new URLSearchParams(window.location.hash.slice(1)) } catch { return new URLSearchParams() } }

// HOW TO READ THIS, TUDDY's words (components/HowToRead.js draws them; the
// same component MOONSHOT's HR board uses). Describes the page; no hit rates.
// The two status words come from lib/callStatus STATUS_WORD, never typed here.
const HOW_NOTES = [
  { title: 'Board rank', text: 'His place on this week\u2019s touchdown board, #1 first, ranked by the model\u2019s touchdown score.' },
  { title: 'The player', text: 'Tap a name to open his card, with the full picture behind the score.' },
  { title: 'TD score', text: 'How good this week looks for him to score a touchdown, 0\u2013100. It\u2019s a ranking, not a percent: the week\u2019s #1 always sits near 80.' },
  { title: 'The bot\u2019s call', text: `${STATUS_WORD.called} means he\u2019s one of the bot\u2019s five touchdown picks this week. ${STATUS_WORD.board} means he\u2019s in the top third of the board.` },
  { title: 'Game', text: 'His opponent and kickoff. The picks lock at kickoff, and nothing changes after.' },
]
const HOW_STEPS = [
  { icon: '👆', text: 'Tap a name to open his card.' },
  { icon: '★', text: 'Add him to your watchlist.' },
  { icon: '✅', text: 'After the games, every call is graded under Called.' },
]
const CALL_WORDS = { called: STATUS_WORD.called, board: STATUS_WORD.board }   // lib/callStatus.js (R2)

export default function BoardHub({ slate, data, logs, matchup, odds, oddsStatus, picks, results, liveSnap = null, onPlayerClick, initialView = 'board', onTitle = null, onView = null }) {
  const phone = useIsPhone()
  const [opts, setOpts] = useState(false)
  const [market, setMarket] = useState('TD')
  const [view, setViewRaw] = useState(initialView)
  // THE BAR'S TWO SLOTS (2026-09-28, nav like MOONSHOT's): Props opens CALLED,
  // Boards opens BOARD -- one hub, kept mounted so its market and filters
  // survive the switch. The Board / Called pills tell the shell (onView) so
  // the bar lights the slot you are on.
  useEffect(() => { setViewRaw(initialView) }, [initialView])
  const setView = (v) => { setViewRaw(v); onView?.(v) }
  // THE TOP BAR (2026-09-27): search, team and GAME, owned here so every
  // market's board reads the same three (MOONSHOT's Controls, one level up).
  const [query, setQuery] = useState('')
  const [team, setTeam] = useHashFilter('fteam')
  const [game, setGame] = useHashFilter('fgame')
  // m= / view= are read on mount AND when the address changes under the mounted hub (Back,
  // a pasted link). The write below is a replaceState that fires no event, and it only
  // runs when market / view change, so the two cannot chase each other.
  useEffect(() => {
    const sync = () => {
      const h = readHash()
      const m = h.get('m'), v = h.get('view')
      if (MARKETS.some(([k]) => k === m)) setMarket(m)
      if (VIEWS.some((x) => x.key === v)) { setViewRaw(v); onView?.(v) }
    }
    sync()
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page takes its m= / view= with it.
  useEffect(() => () => {
    try { const h = readHash(); h.delete('m'); h.delete('view'); window.history.replaceState(null, '', `#${h.toString()}`) } catch { /* ignore */ }
  }, [])
  // Keep the address in step so a shared link opens this exact view.
  useEffect(() => {
    try {
      const h = readHash()
      h.set('m', market); h.set('view', view)
      window.history.replaceState(null, '', `#${h.toString()}`)
    } catch { /* ignore */ }
  }, [market, view])

  // Each pill counts what its Board view lists: the TD board shows every
  // scored player; Boards leaves low samples out until you ask for them.
  // The tab's title says which market and view (the Anytime TD board keeps
  // the registry's own). Reported up; NflDashboard owns the one title hook.
  useEffect(() => {
    const label = (MARKETS.find(([k]) => k === market) || [])[1] || market
    // Ordinary words lowercase, abbreviations kept: "anytime TD", "defense/ST TD".
    const words = label.split(/(\s+|\/)/).map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join('')
    onTitle?.(view === 'board' && market === 'TD' ? null : `NFL ${words} ${view === 'called' ? 'calls, graded' : 'board'} \u00b7 TUDDY`)
  }, [market, view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onTitle?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Object.fromEntries(MARKETS.map(([k]) => [k, (k === 'TD' ? (slate?.players || []) : (data?.players || [])).filter((p) => Number.isFinite(p.scores?.[k]) && (k === 'TD' || !p.low_sample)).length]))
  const marketOptions = MARKETS.map(([key, label]) => ({ key, label, count: counts[key] }))
  const teams = useMemo(() => [...new Set((slate?.players || data?.players || []).map((p) => p.team).filter(Boolean))].sort(), [slate, data])
  const games = useMemo(() => nflGameOptions(slate?.games || data?.games), [slate, data])
  const top = { query, team, game }
  // The row the "How to read this" picture draws: this week's real #1 on the
  // TD board (tdPool, the board's own order). Its label comes from
  // tdCallStatus -- on the bot's card (picks.card.TD) = CALLED, top third =
  // ON THE BOARD -- never re-derived here.
  // ONE CALL RULE (10-05): the TD ladder, then the game's call -- the board's Status
  // column, this example row and Home's TONIGHT strip all read lib/nfl/tdStatus
  const gameCalls = useGameCalls()
  const tdStatus = useMemo(() => tdStatusFor({ picksCard: picks?.card, gameCalls, games: slate?.games, board: tdPool(slate).rows }), [picks, gameCalls, slate])
  const howRow = useMemo(() => {
    const rows = tdPool(slate).rows
    const p = rows[0]
    if (!p) return null
    const rung = (picks?.card?.TD?.rungs || []).find((r) => String(r.player_id) === String(p.player_id)) || null
    const status = tdStatus.statusOf(p)   // the ladder, then his game's call (lib/nfl/tdStatus, 10-05)
    const g = (slate?.games || []).find((x) => x.home === p.team || x.away === p.team)
    return {
      sport: 'nfl', espnId: p.espn_id, team: p.team, opp: null, name: p.name, rank: 1,  // the Game mark says vs / @
      caption: 'One row from this week\u2019s board, taken apart.',
      eyebrow: 'Live from this week\u2019s board',
      score: { label: 'TD', value: p.scores.TD, dp: 0 },
      pick: CALL_WORDS[status] ? `${CALL_WORDS[status]}${rung?.rank ? ` \u00b7 #${rung.rank}` : ''}` : null,
      pickNone: STATUS_WORD.off,
      fifth: { label: 'Game', value: [p.opp ? `${g?.home === p.team ? 'vs' : '@'} ${p.opp}` : null, g?.detail].filter(Boolean).join(' \u00b7 ') || 'TBD' },
    }
  }, [slate, picks, tdStatus])
  return (
    <div>
      {/* ONE PAGE (2026-10-06): the old Boards and Rankings pages are this page. Who is ranked, why, and what to check next. */}
      {phone ? (<>
        {/* PHONE (2026-10-06): the table first. One line, one control row; the rest is behind Filters. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.3, color: C.text2 }}>Who we rank this week, and why.</div>
          {view === 'board' && market === 'TD' && howRow && <HowToRead id="nfl-td-board" accent={C.green} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => setOpts((v) => !v)} aria-expanded={opts} style={{ flex: '0 0 auto', minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body, fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap', border: `1px solid ${opts || query || team !== 'all' && team || game ? C.green : C.border}`, background: opts ? alpha(C.green, 0.14) : 'transparent', color: opts ? C.green : C.text3 }}>▤ Filters{(query || (team && team !== 'all') || game) ? ' ·' : ''}</button>
          <LedgerChip sport="nfl" />
          <div style={{ flex: 1, minWidth: 0 }}><PillRow value={market} options={marketOptions} onChange={setMarket} /></div>
        </div>
        {opts && (
          <BoardTopBar query={query} setQuery={setQuery} placeholder="Search player or team…"
            team={team} setTeam={setTeam} teams={teams} teamLabel="🏈 All teams"
            game={game} setGame={setGame} games={games} gameLabel="All games" />
        )}
      </>) : (<>
      <p style={{ margin: '0 0 10px', fontSize: TYPE.body, lineHeight: 1.45, color: C.text2 }}>Who we rank this week, and why. Tap the Why on any row for the numbers behind it.</p>
      {(
        <BoardTopBar query={query} setQuery={setQuery} placeholder="Search player or team…"
          team={team} setTeam={setTeam} teams={teams} teamLabel="🏈 All teams"
          game={game} setGame={setGame} games={games} gameLabel="All games" />
      )}
      {/* The parent tier, MOONSHOT's Boards / Power pills: a shade bigger than
          the market pills under the rule, so "which page" and "which market"
          read apart by shape. Was a bordered box with a sentence in it. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4, paddingBottom: 7, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        {VIEWS.slice().reverse().map((v) => (
          // 'Called' is Props now (2026-10-04, Donovan: merge TUDDY's Called view into
          // Props): the pill takes you there; an old #view=called link still renders here.
          <button key={v.key} type="button" onClick={() => (v.key === 'called' ? (window.location.hash = '#sport=nfl&tab=picks') : setView(v.key))} title={v.key === 'called' ? "The bot's calls for every market, on Props" : v.title} style={{
            padding: '7px 16px', minHeight: 36, borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body, fontWeight: 900, fontFamily: NUM_FONT,
            whiteSpace: 'nowrap', letterSpacing: '.02em',
            border: `1px solid ${view === v.key ? C.green : C.border}`,
            background: view === v.key ? alpha(C.green, 0.14) : 'transparent',
            color: view === v.key ? C.green : C.text3,
          }}>{v.key === 'board' ? 'Board' : 'Called'}</button>
        ))}
        {/* HOW TO READ THIS (2026-10-01): in the pill row's spare room, so it
            costs no line. TD board only -- the notes describe the TD score. */}
        {view === 'board' && market === 'TD' && howRow && (
          <span style={{ marginLeft: 'auto', paddingRight: 6, fontSize: TYPE.body }}>
            <HowToRead id="nfl-td-board" accent={C.green} row={howRow} notes={HOW_NOTES} steps={HOW_STEPS} />
          </span>
        )}
      </div>
      <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />
      </>)}
      {view === 'called'
        ? <Picks picks={picks} results={results} data={data} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} logs={logs} market={market} hideMarketPicker top={top} />
        : market === 'TD'
          ? <Touchdowns data={slate} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick} oddsStatus={oddsStatus} logs={logs} top={top} results={results} liveSnap={liveSnap} statusOf={tdStatus.statusOf} showOpts={!phone || opts} />
          : <Boards data={data} logs={logs} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} market={market} hideMarketPicker top={top} showOpts={!phone || opts} />}
    </div>
  )
}
