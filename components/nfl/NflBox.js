'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { fetchNfl, nflFantasyStatsPaths, nflFantasyStatsLooksReal } from '../../lib/nfl/dataSource'
import NflTable from './NflTable'

// 📋 BOX SCORES (now the open half of the Games page) — TUDDY'S SIDE OF PATH TO VICTORY B10m.
//
// MOONSHOT could grade a pick against a box score and show you who was at
// the plate, and could not show you a box score (components/tabs/Boxes.js,
// 2026-08-15) -- TUDDY had the same gap for football, never fixed. The
// audit (moonshot-b10-clone-list-audit-2026-09-14.md) called this "cheap:
// the data pipeline exists, it's just never been surfaced as its own nav
// page" and pointed at lib/nfl/liveSlate.js -- checked, and that one turns
// out NOT to be it: liveSlate.js's box only ever covers games CURRENTLY in
// the 'in' state (its own pull() only fetches a summary for
// `games.filter(g => g.state === 'in')`), and its snapshot is a whole new
// Map every poll -- so the moment a game goes final, its box falls out of
// the snapshot entirely. Fine for the Live tab's job (grading a pick while
// the game is still on) and useless for a page whose whole point is
// checking last night's, or this morning's, final line.
//
// THE REAL SOURCE: nfl_fantasy_stats.json (lib/nfl/dataSource.js's own
// header, 2026-09-14) -- the bot's FRANCHISE live-scoring feed, published
// every 15 min in game windows, and it keeps every game of the CURRENT
// week's box regardless of whether that game is still going, because
// FRANCHISE needs final Week 1 numbers just as much as live ones. Same
// "current week only, no per-week archive" limit lib/tuddyLedger.js already
// discloses for NOT ON BOARD -- this page can't show a PAST week's box
// either, and says so rather than guessing or going blank.
//
// WHAT'S NOT IN IT: nfl_fantasy_stats.json carries exactly the counting
// stats the bot scores fantasy points on -- yards, touchdowns,
// interceptions, receptions, made kicks -- and nothing else. No pass
// attempts/completions, no rush attempts, no targets. A real box score has
// those; this feed doesn't, so this page doesn't invent them. If a fuller
// box ever matters more than this, the fix is a bot-side one (publish more
// columns), not a client-side guess.
//
// NAMES AND TEAMS come from the roster the site already fetches for every
// other tab (`data`, nfl_week.json's own `players[]`) -- nfl_fantasy_stats
// itself is keyed by gsis id only, with no name field of its own.

const CATS = [
  {
    key: 'passing', label: 'Passing', sort: 'passing_yards',
    has: (s) => s.passing_yards || s.passing_touchdowns || s.interceptions,
    columns: [
      { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
      { key: 'passing_yards', label: 'YDS', w: 50, dp: 0 },
      { key: 'passing_touchdowns', label: 'TD', w: 40, dp: 0 },
      { key: 'interceptions', label: 'INT', w: 40, dp: 0, invert: true },
    ],
  },
  {
    key: 'rushing', label: 'Rushing', sort: 'rushing_yards',
    has: (s) => s.rushing_yards || s.rushing_touchdowns,
    columns: [
      { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
      { key: 'rushing_yards', label: 'YDS', w: 50, dp: 0 },
      { key: 'rushing_touchdowns', label: 'TD', w: 40, dp: 0 },
    ],
  },
  {
    key: 'receiving', label: 'Receiving', sort: 'receiving_yards',
    has: (s) => s.receptions || s.receiving_yards || s.receiving_touchdowns,
    columns: [
      { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
      { key: 'receptions', label: 'REC', w: 44, dp: 0 },
      { key: 'receiving_yards', label: 'YDS', w: 50, dp: 0 },
      { key: 'receiving_touchdowns', label: 'TD', w: 40, dp: 0 },
    ],
  },
  {
    key: 'kicking', label: 'Kicking', sort: 'extra_points',
    has: (s) => s.extra_points || s.field_goals_0_39 || s.field_goals_40_49 || s.field_goals_50_plus,
    columns: [
      { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
      { key: 'extra_points', label: 'XP', w: 40, dp: 0 },
      { key: 'field_goals_0_39', label: 'FG <40', w: 58, dp: 0 },
      { key: 'field_goals_40_49', label: 'FG 40-49', w: 70, dp: 0 },
      { key: 'field_goals_50_plus', label: 'FG 50+', w: 58, dp: 0 },
    ],
  },
]

function DefRow({ abbr, d }) {
  if (!d) return null
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontFamily: NUM_FONT, fontSize: TYPE.micro, flexWrap: 'wrap' }}>
      <b style={{ width: 34, color: C.text2 }}>{abbr}</b>
      <span>{d.def_sacks || 0} SK</span>
      <span>{d.def_interceptions || 0} INT</span>
      <span>{d.def_fumble_recoveries || 0} FR</span>
      <span>{d.def_touchdowns || 0} TD</span>
      <span>{d.def_safeties || 0} SFTY</span>
      <span style={{ color: C.text3 }}>{d.points_allowed ?? '—'} PA</span>
    </div>
  )
}

function TeamDefenseStrip({ away, home, defense }) {
  const d1 = defense?.[away]
  const d2 = defense?.[home]
  if (!d1 && !d2) return null
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', marginTop: 4,
      background: C.bg3, borderRadius: 8, border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Team defense
      </div>
      <DefRow abbr={away} d={d1} />
      <DefRow abbr={home} d={d2} />
    </div>
  )
}

/** The open half of a Games-page row: the category tables and both defenses.
 *  Moved here from the old Box Scores page when Scores and Box Scores merged
 *  (2026-09-29, queue batch 8). The row itself is components/GameRow.js. */
export function NflBox({ game, byTeam, defense, onPlayerClick, watchlist }) {
  const away = byTeam.get(game.away) || []
  const home = byTeam.get(game.home) || []
  const pool = [...away, ...home]
  const watchColumn = { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
    onAction: (row) => watchlist.toggle(row) }
  if (!pool.length) {
    return (
      <div style={{ fontSize: TYPE.body, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
        {game.state === 'pre'
          ? "Hasn't kicked off yet."
          : "No box in this feed yet for this game — check back once the bot's next 15-minute publish lands."}
      </div>
    )
  }
  return (
    <div style={{ paddingTop: 8 }}>
      {CATS.map((cat) => {
        const rows = pool.filter((p) => cat.has(p)).sort((a, b) => (b[cat.sort] || 0) - (a[cat.sort] || 0))
          .map((p) => ({ ...p, watched: watchlist.isPinned(p.id) ? 1 : 0 }))
        if (!rows.length) return null
        return (
          <div key={cat.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>
              {cat.label}
            </div>
            <NflTable
              rows={rows}
              columns={[watchColumn, ...cat.columns]}
              onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw, cat.key === 'passing' ? 'PASS_YDS' : cat.key === 'rushing' ? 'RUSH_YDS' : cat.key === 'receiving' ? 'REC_YDS' : 'KICK_PTS') : null}
              maxHeight={9999}
              dense
            />
          </div>
        )
      })}
      <TeamDefenseStrip away={game.away} home={game.home} defense={defense} />
    </div>
  )
}

/** The bot's live-scoring feed (one week: the latest played or playing), fetched
 *  only once `want` turns true -- a visit that never opens a box never pays
 *  for it. stats: undefined = not asked / loading, null = unreachable. */
export function useNflBoxFeed(data, want) {
  const [stats, setStats] = useState(undefined)
  // A ref, not state: flipping state here re-ran the effect, and its cleanup
  // dropped the fetch it had just started.
  const asked = useRef(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  useEffect(() => {
    if (!want || asked.current) return
    asked.current = true
    fetchNfl(nflFantasyStatsPaths(), nflFantasyStatsLooksReal)
      .then((j) => { if (alive.current) setStats(j || null) })
      .catch(() => { if (alive.current) setStats(null) })
  }, [want])

  // gsis id -> the full slate player record, so a row click hands
  // onPlayerClick the same shape every other tab already does.
  const byTeam = useMemo(() => {
    const roster = new Map()
    for (const p of data?.players || []) {
      const pid = p?.player_id != null ? String(p.player_id) : null
      if (pid) roster.set(pid, p)
    }
    const map = new Map()
    if (!stats?.players) return map
    for (const [pid, line] of Object.entries(stats.players)) {
      const player = roster.get(pid)
      const team = player?.team
      if (!team) continue
      const arr = map.get(team) || []
      arr.push({ id: pid, name: player?.name || pid, team, ...line, _raw: player || { player_id: pid, name: pid, team } })
      map.set(team, arr)
    }
    return map
  }, [stats, data])

  return { stats, byTeam }
}
