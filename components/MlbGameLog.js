'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, teamAbbrs } from '../lib/gamelogs'
import DenseTable from './DenseTable'
import { TeamNav } from '../lib/teamNav'
import { teamKey } from '../lib/mlbTeams'

// GAME LOG (2026-10-07, Donovan: "give the MLB card a plain game-by-game table").
// Every game this season, newest first, one row each: the date, who, how it
// ended for his club, and his box-score line. The same table components/lamp
// tabs/Player.js and components/nfl/NflGameLog.js draw for their sports, in
// MOONSHOT's own DenseTable (skin v2, product accent, columns in groups).
//
// NO NEW CALL. The rows are the live StatsAPI game log the props grid, the
// streaks and the EV Log already read: lib/gamelogs.js thresholdRates(pid),
// cached per player for the session, postseason included. The club code comes
// from the same teams lookup (teamAbbrs) the grid uses -- the game log itself
// only names the opponent. Nothing is guessed: a game the log gives no result
// for shows a dash, and a game with no at-bats shows no average.
//
// The game's AVG is hits over at-bats THAT game (a 2-for-5 is .400), not his
// season line.

// postseason round, from the log's own gameType (the call asks for R,F,D,L,W); blank for the regular season
const ROUND = { F: 'WC', D: 'DS', L: 'LCS', W: 'WS' }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}` : String(iso || '—')
}

// The card sits OUTSIDE the dashboard's TeamNav provider (components/Dashboard.js wraps only the tab pages),
// so this table brings its own team door: the same address the card's club codes already open
// (PlayerModal clubLink): the team page, with Back returning to this tab.
const openClub = (code) => { const k = teamKey(code); if (k) { try { window.location.hash = `sport=mlb&tab=team&team=${k}` } catch { /* no window */ } } }

export default function MlbGameLog({ pid }) {
  const [data, setData] = useState(undefined)
  const [abbrs, setAbbrs] = useState(null)

  useEffect(() => {
    let alive = true
    setData(undefined)
    if (!pid) { setData(null); return undefined }
    thresholdRates(pid).then((d) => { if (alive) setData(d || null) })
    teamAbbrs().then((m) => { if (alive) setAbbrs(m || null) })
    return () => { alive = false }
  }, [pid])

  const rows = useMemo(() => (data?.logAll || []).map((g, i) => {
    const code = abbrs?.[g.oppId] || ''
    return {
      _key: `${g.gamePk || g.iso}-${i}`,
      date: g.iso, dateText: dateLabel(g.iso),
      // the club code (@ when away), else the name the log gave, else a dash: never blank
      opp: code ? `${g.home ? '' : '@'}${code}` : (g.opp || '—'),
      res: g.win === true ? 'W' : g.win === false ? 'L' : null,
      rd: ROUND[g.gt] || '',
      pa: g.pa, h: g.h, hr: g.hr, rbi: g.rbi, r: g.r, bb: g.bb, k: g.k, tb: g.tb,
      gavg: g.ab > 0 ? g.h / g.ab : null,
    }
  }), [data, abbrs])

  if (data === undefined) return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading his game log…</div>
  if (!rows.length) {
    return <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>No games logged for him yet this season.</div>
  }

  const cols = [
    { key: 'dateText', label: 'Date', group: 'Game', w: 58, heat: false, sticky: true, bold: true },
    // the club code is a club link through the table's own team door (components/table/v2.js teamCodeOf:
    // a column named opp* holding "CHC" or "@CHC"); the opponent is quiet text, not a logo
    { key: 'opp', label: 'Opp', group: 'Game', w: 58, heat: false },
    { key: 'res', label: 'Res', group: 'Game', w: 38, heat: false },
    { key: 'rd', label: 'Rd', group: 'Game', w: 36, heat: false, title: 'Postseason round: WC wild card, DS division series, LCS league series, WS World Series. Blank in the regular season.' },
    { key: 'pa', label: 'PA', group: 'Box', w: 38, dp: 0 },
    { key: 'h', label: 'H', group: 'Box', w: 36, dp: 0 },
    { key: 'hr', label: 'HR', group: 'Box', w: 38, dp: 0 },
    { key: 'rbi', label: 'RBI', group: 'Box', w: 40, dp: 0 },
    { key: 'r', label: 'R', group: 'Box', w: 34, dp: 0 },
    { key: 'bb', label: 'BB', group: 'Box', w: 38, dp: 0 },
    { key: 'k', label: 'K', group: 'Box', w: 34, dp: 0, invert: true },
    { key: 'tb', label: 'TB', group: 'Box', w: 38, dp: 0 },
    { key: 'gavg', label: 'AVG', group: 'Game line', w: 52, dp: 3, title: 'Hits over at-bats in THAT game, not his season average.' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Game log</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} games · newest first · live from the league
        </span>
      </div>
      <TeamNav.Provider value={openClub}>
      <DenseTable
        rows={rows}
        columns={cols}
        initialSort={null}
        maxRows={10}
        maxHeight={9999}
        caption="Every game he has played this season, regular season and postseason (Rd marks the postseason round). Opp is the club he faced, @ when away. Res is how his club's game ended. AVG is that one game's hits over at-bats."
      />
      </TeamNav.Provider>
    </div>
  )
}
