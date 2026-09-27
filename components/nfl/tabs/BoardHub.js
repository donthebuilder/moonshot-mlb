'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import { PillRow, Segmented } from '../../Filters'
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

export default function BoardHub({ slate, data, logs, matchup, odds, oddsStatus, picks, results, onPlayerClick, initialView = 'board' }) {
  const [market, setMarket] = useState('TD')
  const [view, setView] = useState(initialView)
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
  const counts = Object.fromEntries(MARKETS.map(([k]) => [k, (k === 'TD' ? (slate?.players || []) : (data?.players || [])).filter((p) => Number.isFinite(p.scores?.[k]) && (k === 'TD' || !p.low_sample)).length]))
  const marketOptions = MARKETS.map(([key, label]) => ({ key, label, count: counts[key] }))
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Segmented label="Show" value={view} options={VIEWS} onChange={setView} />
          {view === 'board' && <span style={{ color: C.text3, font: `700 10px/1.4 ${NUM_FONT}` }}>Ranked by the model’s own score for this market. The calls are under Called.</span>}
        </div>
        <PillRow label="Market" value={market} options={marketOptions} onChange={setMarket} />
      </div>
      {view === 'called'
        ? <Picks picks={picks} results={results} data={data} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} logs={logs} market={market} hideMarketPicker />
        : market === 'TD'
          ? <Touchdowns data={slate} matchup={matchup} odds={odds} onPlayerClick={onPlayerClick} oddsStatus={oddsStatus} />
          : <Boards data={data} logs={logs} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} market={market} hideMarketPicker />}
    </div>
  )
}
