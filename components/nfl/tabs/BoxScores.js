'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { fetchNfl, nflFantasyStatsPaths, nflFantasyStatsLooksReal } from '../../../lib/nfl/dataSource'
import DenseTable from '../../DenseTable'
import { Empty } from '../../ui'

// 📋 BOX SCORES — TUDDY'S SIDE OF PATH TO VICTORY B10m.
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

function statusOf(g) {
  if (g.completed || g.state === 'post') return { text: 'FINAL', tone: C.text3 }
  if (g.state === 'in') return { text: 'LIVE', tone: C.green }
  const t = g.kickoff ? new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Scheduled'
  return { text: t, tone: C.text3 }
}

function DefRow({ abbr, d }) {
  if (!d) return null
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontFamily: NUM_FONT, fontSize: 10, flexWrap: 'wrap' }}>
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
      <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>
        Team defense
      </div>
      <DefRow abbr={away} d={d1} />
      <DefRow abbr={home} d={d2} />
    </div>
  )
}

function GameBox({ game, byTeam, defense, open, onToggle, onPlayerClick }) {
  const st = statusOf(game)
  const away = byTeam.get(game.away) || []
  const home = byTeam.get(game.home) || []
  const pool = useMemo(() => [...away, ...home], [away, home])
  const anyStats = pool.length > 0

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', cursor: 'pointer' }}
      >
        <div style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 12 }}>
          {game.away} <span style={{ color: C.text3, fontWeight: 700 }}>{game.away_score ?? ''}</span>
          {' @ '}
          {game.home} <span style={{ color: C.text3, fontWeight: 700 }}>{game.home_score ?? ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: st.tone }}>{st.text}</span>
          <span style={{ color: C.text3, fontSize: 11 }}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '0 13px 12px', borderTop: `1px solid ${C.border}` }}>
          {!anyStats ? (
            <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
              {game.state === 'pre'
                ? "Hasn't kicked off yet."
                : "No box in this feed yet for this game — check back once the bot's next 15-minute publish lands."}
            </div>
          ) : (
            <div style={{ paddingTop: 8 }}>
              {CATS.map((cat) => {
                const rows = pool.filter((p) => cat.has(p)).sort((a, b) => (b[cat.sort] || 0) - (a[cat.sort] || 0))
                if (!rows.length) return null
                return (
                  <div key={cat.key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                      {cat.label}
                    </div>
                    <DenseTable
                      rows={rows}
                      columns={cat.columns}
                      onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw, cat.key === 'passing' ? 'PASS_YDS' : cat.key === 'rushing' ? 'RUSH_YDS' : cat.key === 'receiving' ? 'REC_YDS' : 'KICK_PTS') : null}
                      maxHeight={9999}
                      dense
                    />
                  </div>
                )
              })}
              <TeamDefenseStrip away={game.away} home={game.home} defense={defense} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BoxScores({ data, onPlayerClick }) {
  const [stats, setStats] = useState(undefined) // undefined = loading, null = unreachable
  const [open, setOpen] = useState(() => new Set())

  useEffect(() => {
    let alive = true
    fetchNfl(nflFantasyStatsPaths(), nflFantasyStatsLooksReal)
      .then((j) => { if (alive) setStats(j || null) })
      .catch(() => { if (alive) setStats(null) })
    return () => { alive = false }
  }, [])

  // gsis id -> the full slate player record, so a row click hands
  // onPlayerClick the same shape every other tab already does.
  const roster = useMemo(() => {
    const map = new Map()
    for (const p of data?.players || []) {
      const pid = p?.player_id != null ? String(p.player_id) : null
      if (pid) map.set(pid, p)
    }
    return map
  }, [data])

  const byTeam = useMemo(() => {
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
  }, [stats, roster])

  const games = useMemo(
    () => (stats?.games || []).slice().sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)),
    [stats],
  )

  const toggle = (id) => setOpen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Box Scores</h1>
        <p style={{ margin: '4px 0 0', color: C.text3, fontSize: 10.5, lineHeight: 1.5, maxWidth: 640 }}>
          Week {stats?.week ?? '—'} — every game, passing / rushing / receiving / kicking, off the bot&apos;s own
          live scoring feed. It refreshes every 15 minutes in game windows and only ever covers the current week —
          a past week&apos;s box isn&apos;t available here, the same limit the Tuddy Ledger discloses for its own
          NOT ON BOARD count. Attempts, completions, carries and targets aren&apos;t published in this feed yet —
          only the stats the bot already scores fantasy points on.
        </p>
      </div>
      {stats === undefined && <Empty text="Loading this week's games…" />}
      {stats === null && <Empty text="LIVE DATA DELAYED — couldn't reach this week's box scores." />}
      {stats && !games.length && <Empty text="No games published for this week yet." />}
      {stats && games.map((g) => (
        <GameBox
          key={g.game_id}
          game={g}
          byTeam={byTeam}
          defense={stats.defense}
          open={open.has(g.game_id)}
          onToggle={() => toggle(g.game_id)}
          onPlayerClick={onPlayerClick}
        />
      ))}
    </div>
  )
}
