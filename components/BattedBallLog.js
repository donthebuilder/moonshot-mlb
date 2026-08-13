'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchLiveSlate } from '../lib/liveSlate'
import { fetchBattedBallLog } from '../lib/livePitches'
import DenseTable from './DenseTable'

// 📡 BATTED BALL LOG — the loudest contact on today's slate, everyone's.
//
// 2026-08-13, Donovan, after the 🔥 Hardest hit toggle shipped as a mode on
// JustNow: "i'd like to see hh deep fly out barrels distance and ev... just
// like how we can see the live spray the live ev... bbes from the game...
// basically a whole new reconstruction of the at the plate page... i don't
// like how the top of the page looks right before the lineups."
//
// Two things changed from that toggle:
//   1. ITS OWN SECTION, not a mode buried under a button. JustNow asks "what
//      happened to MY guys" and this asks "who's squaring the ball up
//      anywhere on the slate" — different questions, so now they're two
//      labelled sections instead of one rail quietly meaning different things
//      depending on which pill was last tapped.
//   2. THREE TAGS, not one number. 🔥 hard-hit, 💎 barrel and 📏 deep fly out
//      each get their own gate in fetchBattedBallLog() — a ball can earn any
//      combination of the three — plus real distance and exit velo on every
//      row, not just the EV that used to be the whole story.
//
// 2026-08-13, second pass, on the card-rail version this shipped as: "i dont
// like the design of the page how its like side ways... i wan a simple chart
// or spreadsheet of the bbes tonight, just like how the ev log.js [does it]."
// So: a DenseTable, not a scroll rail — the same component EVLog uses for a
// hitter's season. Same idiom, too: EVLog doesn't colour its Result column by
// outcome — the signal lives entirely in flag columns (BRL/HH/HR), plain text
// everywhere else — so DEEP gets a fourth flag column here rather than a
// fourth colour competing with the other three. It also buys sortable columns
// for free (click EV, click Dist, click a flag) — something the card rail
// never had.
//
// COSTS NOTHING NEW. Same feedFor() cache fetchSkinEvents and the old
// fetchHardHitLog already shared — this is a different read of a feed
// something on the page was already pulling, not a new fetch. Raising the
// default limit from 12 (sized for a row of cards) to 30 (sized for a
// scrolling table) is free for the same reason: it only changes where
// fetchBattedBallLog slices an array it already built.
const SHORT = (e) => String(e || '')
  .replace(/^Home Run$/i, 'HOME RUN')
  .replace(/^Strikeout.*/i, 'struck out')
  .replace(/^Groundout$/i, 'grounded out')
  .replace(/^Flyout$/i, 'flied out')
  .replace(/^Lineout$/i, 'lined out')
  .replace(/^Pop Out$/i, 'popped out')
  .replace(/^Forceout$/i, 'forced out')
  .replace(/^Sac Fly.*/i, 'sac fly')
  .replace(/^Field Error$/i, 'reached on error')
  .toLowerCase()
  .replace(/^home run$/, 'HOME RUN')

const COLUMNS = [
  { key: 'name', label: 'Batter', heat: false, w: 116, sticky: true, bold: true },
  { key: 'inn', label: 'Inn', heat: false, w: 32, mono: true, dim: true },
  { key: 'event', label: 'Result', heat: false, w: 108, dim: true },
  { key: 'ev', label: 'EV', w: 44, dp: 1 },
  { key: 'dist', label: 'Dist', w: 44, dp: 0 },
  {
    key: 'la', label: 'Angle', w: 44, dp: 0,
    title: 'Launch angle. Not good-or-bad on its own — 70° is a popup, not a barrel.',
  },
  {
    key: 'hh', label: 'HH', flag: true, mark: '●', w: 28,
    title: "95+ mph off the bat — Statcast's own hard-hit line",
  },
  {
    key: 'barrel', label: 'BRL', flag: true, mark: '●', w: 28,
    title: 'A real barrel — the exit velo / launch angle combo that has historically produced .500+ AVG, 1.500+ SLG',
  },
  {
    key: 'deepFly', label: 'DEEP', flag: true, mark: '▲', w: 34,
    title: 'A fly ball hit 370+ feet that did not land for a hit — well-struck enough to travel, caught anyway',
  },
  { key: 'hr', label: 'HR', flag: true, mark: '★', w: 28 },
  { key: 'pitcher', label: 'Pitcher', heat: false, w: 106, dim: true },
]

export default function BattedBallLog({ players = [], onPlayerClick, limit = 30 }) {
  const [rows, setRows] = useState([])
  const [hasGames, setHasGames] = useState(false)

  // Most names in this log ARE on tonight's slate (that's most of the site's
  // player pool), but a few won't be — a stranger's teammate with no HR card
  // this slate, say. byId + the row-click guard below is the same rule
  // JustNow uses: open the real card when we have one, otherwise the row
  // still shows everything it knows but isn't a dead click into a blank
  // modal.
  const byId = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(Number(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  useEffect(() => {
    let alive = true
    let t = null
    const pull = async () => {
      const snap = await fetchLiveSlate().catch(() => null)
      if (!alive || !snap) return
      setHasGames((snap.games || []).some((g) => g.state === 'Live' || g.state === 'Final'))
      const ev = await fetchBattedBallLog(snap, limit).catch(() => [])
      if (!alive) return
      setRows(ev)
      const anyLive = snap.games?.some((g) => g.state === 'Live')
      clearInterval(t)
      // Matches the 45s feed-cache TTL, same cadence as JustNow — never asks
      // for bytes it wouldn't already get handed back from cache.
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 45000 : 180000)
    }
    pull()
    return () => { alive = false; clearInterval(t) }
  }, [limit])

  // DenseTable wants flat, display-ready rows — one map, once, rather than
  // every column reaching back into the raw feed shape. `id` rides along
  // unrendered (it's not in COLUMNS) purely so the row-click handler below
  // can look the real player back up.
  const tableRows = useMemo(() => rows.map((r) => ({
    _key: r.key,
    id: r.id,
    name: r.name,
    inn: `${/^top/i.test(r.half) ? '▲' : '▼'}${r.inning}`,
    event: SHORT(r.event),
    ev: r.ev || null,
    dist: r.dist || null,
    la: r.la != null ? r.la : null,
    hh: r.hh ? 1 : 0,
    barrel: r.barrel ? 1 : 0,
    deepFly: r.deepFly ? 1 : 0,
    hr: r.tone === 'hr' ? 1 : 0,
    pitcher: r.pitcher || '—',
  })), [rows])

  if (!rows.length && !hasGames) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📡 Batted balls</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          every live and final game tonight, loudest first
        </span>
      </div>

      {!rows.length ? (
        <div style={{ fontSize: 10, color: C.text3, fontStyle: 'italic' }}>
          Nothing loud yet tonight.
        </div>
      ) : (
        <DenseTable
          rows={tableRows}
          columns={COLUMNS}
          onRowClick={(row) => { const p = byId.get(row.id); if (p) onPlayerClick?.(p) }}
          initialSort={null}
          maxHeight={380}
          caption="Every live and final batted ball tonight that cleared a bar — 95+ mph, a real barrel, or a fly ball hit 370+ ft that still got caught. Sorted most-notable first: home runs, then barrels / deep fly outs / extra-base hits, then everything else that qualified — EV only breaks ties inside a tier. Click a header to sort a different way, a row to open his card."
        />
      )}
    </div>
  )
}
