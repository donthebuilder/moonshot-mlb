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
// 2026-08-13, third pass, same message: "the bbe on the at ple need to beale
// to filter by outss singles barrelies hr hhs ev on100 deep outs. things
// like that just something intutive do all that." Two pill rows, AND-ed
// together, the same "site pill language" EVLog.js's own comment names it —
// rounded, orange-gradient when active — borrowed wholesale rather than
// inventing a third look for the same idea:
//
//   RESULT   single-select, like EVLog's Arm/Bats toggles — what the plate
//             appearance actually was. "Out" catches everything here that
//             wasn't a hit (a fielding error included — he didn't get a hit
//             either way), which is what makes a plain "outs" button possible
//             instead of five separate ones (groundout/flyout/lineout/
//             forceout/popup) nobody asked to tell apart.
//   QUALITY  multi-select, OR not AND — the same three tags already sitting
//             in the table as flag columns (HH/BRL/DEEP), plus one new one
//             (100+ EV, a stricter bar than the 95+ every row here already
//             cleared just to exist). Checking two reads as "either."
//
// Both filters read off fields the row already carries — nothing new
// fetched, same "costs nothing new" rule the rest of this file follows.
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

// ── FILTERS ──────────────────────────────────────────────────────────────
// EXPORTED (2026-08-14, At The Plate rebuild Pass 3) so the spray chart's
// tonight-only filters speak the exact same Result/Quality language as this
// log. Two surfaces offering different category sets for the same balls is
// the drift the pick-buckets export already exists to prevent — one
// definition, two callers, same rule here.
export const OUTCOME_TABS = [
  { key: 'all', label: 'All' },
  { key: 'hr', label: 'HR' },
  { key: '3b', label: '3B' },
  { key: '2b', label: '2B' },
  { key: '1b', label: '1B' },
  { key: 'out', label: 'Out' },
]
// Matches the SAME raw event string SHORT() above pattern-matches against —
// "Home Run" / "Single" / "Double" / "Triple" are MLB's own field values,
// unchanged by SHORT for anything but Home Run's all-caps treatment.
// Everything that isn't one of those four is bucketed Out, deliberately —
// see the header comment for why that's the honest simplification, not a
// missing case.
export const outcomeOf = (event) => {
  const e = String(event || '').toLowerCase().trim()
  if (e === 'home run') return 'hr'
  if (e === 'triple') return '3b'
  if (e === 'double') return '2b'
  if (e === 'single') return '1b'
  return 'out'
}

export const QUALITY_TABS = [
  { key: 'hh', label: '🔥 HH', title: "95+ mph off the bat — Statcast's own hard-hit line" },
  { key: 'barrel', label: '💎 BRL', title: 'A real barrel — the EV / launch-angle combo behind .500+ AVG, 1.500+ SLG' },
  { key: 'ev100', label: '⚡ 100+', title: '100+ mph off the bat — a stricter bar than the 95+ hard-hit gate every row here already cleared' },
  { key: 'deepFly', label: '📏 DEEP', title: 'A fly ball hit 370+ ft that did not land for a hit' },
]

// The site's pill language, per EVLog.js's own comment: rounded, tinted
// orange-gradient when active. Module-level, same as COLUMNS/SHORT above —
// none of these depend on props or state, so no reason to rebuild them
// every render the way EVLog builds its copies inline.
const seg = (active) => ({
  padding: '4px 11px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
  background: active ? 'linear-gradient(135deg, #f97316, #ea6a0a)' : 'transparent',
  color: active ? '#1a0d02' : C.text2,
  fontFamily: NUM_FONT, borderRadius: 999,
  boxShadow: active ? '0 0 10px rgba(249,115,22,.35)' : 'none',
  transition: 'background .12s',
})
const groupBox = {
  display: 'flex', gap: 2, borderRadius: 999, padding: 2,
  border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.025)',
}
const cluster = { display: 'flex', alignItems: 'center', gap: 5 }
const clusterLbl = {
  fontSize: 8, color: C.text3, textTransform: 'uppercase',
  letterSpacing: '.09em', fontWeight: 800, whiteSpace: 'nowrap',
}

export default function BattedBallLog({ players = [], onPlayerClick, limit = 30 }) {
  const [rows, setRows] = useState([])
  const [hasGames, setHasGames] = useState(false)
  const [outcomeSel, setOutcomeSel] = useState('all')
  const [qualitySel, setQualitySel] = useState(new Set())

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

  // Filters apply to the RAW rows (before the display map below), since
  // that's where .event / .hh / .barrel / .deepFly / .ev already live in
  // their honest form — filtering the mapped table rows would mean matching
  // against SHORT()'s display text instead of the real event string.
  const filteredRows = useMemo(() => rows.filter((r) => {
    if (outcomeSel !== 'all' && outcomeOf(r.event) !== outcomeSel) return false
    if (qualitySel.size) {
      const hit = (qualitySel.has('hh') && r.hh)
        || (qualitySel.has('barrel') && r.barrel)
        || (qualitySel.has('deepFly') && r.deepFly)
        || (qualitySel.has('ev100') && (r.ev || 0) >= 100)
      if (!hit) return false
    }
    return true
  }), [rows, outcomeSel, qualitySel])

  // DenseTable wants flat, display-ready rows — one map, once, rather than
  // every column reaching back into the raw feed shape. `id` rides along
  // unrendered (it's not in COLUMNS) purely so the row-click handler below
  // can look the real player back up.
  const tableRows = useMemo(() => filteredRows.map((r) => ({
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
  })), [filteredRows])

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
        <>
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center',
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 11px',
          }}>
            <div style={cluster} className="chip-row">
              <span style={clusterLbl}>Result</span>
              <div style={groupBox}>
                {OUTCOME_TABS.map((t) => (
                  <button key={t.key} style={seg(outcomeSel === t.key)} onClick={() => setOutcomeSel(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={cluster} className="chip-row">
              <span style={clusterLbl}>Quality</span>
              <div style={groupBox}>
                {QUALITY_TABS.map((t) => {
                  const on = qualitySel.has(t.key)
                  return (
                    <button
                      key={t.key}
                      title={t.title}
                      style={seg(on)}
                      onClick={() => setQualitySel((s) => {
                        const next = new Set(s)
                        if (next.has(t.key)) next.delete(t.key); else next.add(t.key)
                        return next
                      })}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <span style={{ fontSize: 10, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT }}>
              {filteredRows.length} of {rows.length} shown
            </span>
          </div>

          {!filteredRows.length ? (
            <div style={{ fontSize: 10, color: C.text3, fontStyle: 'italic' }}>
              Nothing tonight matches that combination — try widening it.
            </div>
          ) : (
            <DenseTable
              rows={tableRows}
              columns={COLUMNS}
              onRowClick={(row) => { const p = byId.get(row.id); if (p) onPlayerClick?.(p) }}
              initialSort={null}
              maxHeight={380}
              caption="Every live and final batted ball tonight that cleared a bar — 95+ mph, a real barrel, or a fly ball hit 370+ ft that still got caught. Sorted most-notable first: home runs, then barrels / deep fly outs / extra-base hits, then everything else that qualified — EV only breaks ties inside a tier. Result and Quality filter above; click a header to sort what's left, a row to open his card."
            />
          )}
        </>
      )}
    </div>
  )
}
