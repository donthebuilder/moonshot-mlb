'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, MARKETS } from '../../../lib/nfl/theme'
import { PillRow } from '../../Filters'
import { alpha } from '../../../lib/scales'
import BoardTopBar from '../../BoardTopBar'
import { nflGameOptions } from '../NflBoardExtras'
import Touchdowns from './Touchdowns'
import Boards from './Boards'
import Picks from './Picks'

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

export default function BoardHub({ slate, data, logs, matchup, odds, oddsStatus, picks, results, onPlayerClick, initialView = 'board', onTitle = null }) {
  const [market, setMarket] = useState('TD')
  const [view, setView] = useState(initialView)
  // THE TOP BAR (2026-09-27): search, team and GAME, owned here so every
  // market's board reads the same three (MOONSHOT's Controls, one level up).
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('')
  const [game, setGame] = useState('')
  useEffect(() => {
    const h = readHash()
    if (MARKETS.some(([k]) => k === h.get('m'))) setMarket(h.get('m'))
    if (VIEWS.some((v) => v.key === h.get('view'))) setView(h.get('view'))
  }, [])
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
  return (
    <div>
      {view === 'board' && (
        <BoardTopBar query={query} setQuery={setQuery} placeholder="Search player or team…"
          team={team} setTeam={setTeam} teams={teams} teamLabel="🏈 All teams"
          game={game} setGame={setGame} games={games} gameLabel="All games" />
      )}
      {/* The parent tier, MOONSHOT's Boards / Power pills: a shade bigger than
          the market pills under the rule, so "which page" and "which market"
          read apart by shape. Was a bordered box with a sentence in it. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4, paddingBottom: 7, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        {VIEWS.slice().reverse().map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)} title={v.title} style={{
            padding: '7px 16px', minHeight: 36, borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body, fontWeight: 900, fontFamily: NUM_FONT,
            whiteSpace: 'nowrap', letterSpacing: '.02em',
            border: `1px solid ${view === v.key ? C.green : C.border}`,
            background: view === v.key ? alpha(C.green, 0.14) : 'transparent',
            color: view === v.key ? C.green : C.text3,
          }}>{v.key === 'board' ? 'Board' : 'Called'}</button>
        ))}
      </div>
      <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />
      {view === 'called'
        ? <Picks picks={picks} results={results} data={data} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} logs={logs} market={market} hideMarketPicker />
        : market === 'TD'
          ? <Touchdowns data={slate} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick} oddsStatus={oddsStatus} logs={logs} top={top} />
          : <Boards data={data} logs={logs} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} market={market} hideMarketPicker top={top} />}
    </div>
  )
}
