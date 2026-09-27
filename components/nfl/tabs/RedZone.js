'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import NflTable from '../NflTable'
import RedZoneField from '../RedZoneField'
import PageHeader from '../../PageHeader'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect } from '../../Filters'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'

// 🎯 RED ZONE (2026-09-27, Donovan: "yes all that").
//
// Who gets the ball close to the end zone, ranked. Nothing new is computed
// off the field: every number is already in nfl_week.json, per player --
//   stats.RZ   red-zone touches per game          (research_columns' own words)
//   stats.GL   goal-line touches per game (inside-10 targets, inside-5 carries)
//   stats.xTD  expected TDs per game from field position
//   stats.TD   actual TDs per game;  stats.TDoE  expected minus actual
//   scores.TD  the TD model's score this week (the same number the Board shows)
//
// TEAM SHARE is the one derived column: his RZ per game divided by the sum of
// RZ per game over every player on his team the payload carries an RZ for.
// That is the share among the players the bot tracks -- a lineman's or a
// QB-sneak's touch isn't in it -- and the column's title says so rather than
// calling it "the team's red-zone share".
//
// WHICH GAMES. The per-player stats are the bot's trailing form this season
// (weeks before this one). A man with too few games of his own carries last
// season's per-game rate instead and is stamped `carryover` -- those rows are
// dimmed and the note says so. (Not `stat_season`: that field is the context
// tables' season, not the player rows'.)

const buildColumns = (watchlist) => [
  { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
    onAction: (row) => watchlist.toggle(row) },
  { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 148 },
  { key: 'team', label: 'Team', heat: false, w: 46 },
  { key: 'position', label: 'Pos', heat: false, w: 40 },
  { key: 'opp', label: 'Opp', heat: false, w: 46 },
  { key: 'rz', label: 'RZ/G', w: 48, dp: 1, title: 'Red-zone touches per game' },
  { key: 'share', label: 'TM SHARE', w: 66, dp: 0, title: 'His share of the red-zone touches of every player the bot tracks on his team (%)' },
  { key: 'gl', label: 'GL/G', w: 46, dp: 1, title: 'Goal-line touches per game: inside-10 targets, inside-5 carries' },
  { key: 'xtd', label: 'xTD/G', w: 52, dp: 2, title: 'Expected touchdowns per game from field position' },
  { key: 'td', label: 'TD/G', w: 46, dp: 2, title: 'Actual touchdowns per game' },
  { key: 'tdoe', label: 'TDoE', w: 48, dp: 2, title: 'Expected minus actual -- positive means he is due' },
  { key: 'score', label: 'TD SCORE', w: 64, dp: 0, title: "This week's TD model score (the Board's number)" },
]

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

export default function RedZone({ data, matchup = null, onPlayerClick }) {
  const watchlist = useNflWatchlist(data)
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('all')
  const [position, setPosition] = useState('all')

  const rows = useMemo(() => {
    const tracked = (data?.players || []).filter((p) => num(p.stats?.RZ) !== null && !p.on_bye)
    const teamRz = {}
    for (const p of tracked) teamRz[p.team] = (teamRz[p.team] || 0) + num(p.stats.RZ)
    return tracked.filter((p) => num(p.stats.RZ) > 0).map((p) => ({
      player_id: p.player_id,
      name: p.name,
      team: p.team,
      position: p.position,
      opp: p.opp || '',
      rz: num(p.stats.RZ),
      share: teamRz[p.team] > 0 ? (100 * num(p.stats.RZ)) / teamRz[p.team] : null,
      gl: num(p.stats.GL),
      xtd: num(p.stats.xTD),
      td: num(p.stats.TD),
      tdoe: num(p.stats.TDoE),
      score: num(p.scores?.TD),
      watched: watchlist.isPinned(p.player_id) ? 1 : 0,
      _raw: p,
    }))
  }, [data, watchlist])

  const filterOptions = useMemo(() => {
    const countBy = (key) => rows.reduce((acc, r) => { if (r[key]) acc[r[key]] = (acc[r[key]] || 0) + 1; return acc }, {})
    const teams = countBy('team')
    const positions = countBy('position')
    return {
      teams: [{ key: 'all', label: 'All teams', count: rows.length }, ...Object.keys(teams).sort().map((key) => ({ key, label: key, count: teams[key] }))],
      positions: [{ key: 'all', label: 'All positions', count: rows.length }, ...Object.keys(positions).sort().map((key) => ({ key, label: key, count: positions[key] }))],
    }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((r) => (
      (team === 'all' || r.team === team)
      && (position === 'all' || r.position === position)
      && (!needle || r.name.toLowerCase().includes(needle))
    ))
  }, [rows, query, team, position])

  if (!rows.length) {
    return (
      <div style={{ padding: 26, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: TYPE.body }}>
        Waiting on the bot's next publish -- red-zone usage ships with nfl_week.json.
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · RED ZONE"
        title="Who gets the ball near the end zone"
        note={<>Red-zone and goal-line touches per game this season, with this week&apos;s opponent. Touches close to the line are where touchdowns come from.</>}
        theme={C}
        numFont={NUM_FONT}
        accent={C.green}
      />

      {/* THE LAST 20 YARDS, drawn (BATCH-FACES step 9) -- the table below is unchanged. */}
      <RedZoneField data={data} matchup={matchup} onPlayerClick={onPlayerClick} />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2,
      }}>
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={team} options={filterOptions.teams} onChange={setTeam} />
          <FilterSelect label="Position" value={position} options={filterOptions.positions} onChange={setPosition} />
        </FilterBar>
        <ActiveFilters
          shown={filtered.length}
          total={rows.length}
          filters={[
            query && { key: 'query', label: `Name: ${query}`, onClear: () => setQuery('') },
            team !== 'all' && { key: 'team', label: `Team: ${team}`, onClear: () => setTeam('all') },
            position !== 'all' && { key: 'position', label: `Position: ${position}`, onClear: () => setPosition('all') },
          ]}
          onClearAll={() => { setQuery(''); setTeam('all'); setPosition('all') }}
        />
      </div>

      <NflTable
        rows={filtered}
        columns={buildColumns(watchlist)}
        initialSort="rz"
        faceOf={(r) => (r._raw?.espn_id ? { sport: 'nfl', espnId: String(r._raw.espn_id), name: r._raw.name } : null)}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw, 'TD') : null}
        maxRows={rows.length}
        dimRow={(r) => r._raw?.carryover || r._raw?.low_sample}
      />

      <div style={{ marginTop: 10, padding: '10px 13px', border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.text3, fontSize: TYPE.micro, lineHeight: 1.6 }}>
        TM SHARE counts only the players the bot tracks on his team, so it is his share of those
        players&apos; red-zone touches, not of every snap inside the 20. Players on bye are left out.
        Dimmed rows: too few games this season, so the numbers are last season&apos;s per-game rate or a small sample.
      </div>
    </div>
  )
}
