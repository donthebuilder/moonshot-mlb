'use client'
import ProjectedView, { sortClick } from './slate/ProjectedView'
import { alpha } from '../lib/scales'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamOf, oppOf, n, clean, playerId } from '../lib/player'
import { isLeaky, LEAGUE_HR9 } from '../lib/hr9'
import { penStatsFor } from '../lib/bullpen'
import { useClubHr } from '../lib/clubHr'
import { slateExpHr, gameExpHr, clubExpHr } from '../lib/teamHr'
import { projectPool, projectionPublished } from '../lib/projection'

// Projected output by game — expected COUNT, not a score.
//
// Ported from the Streamlit Games tab. The distinction it exists to make:
// every other number on this site is a rank, and a 78 only means "above a 62".
// These are projections. Each hitter's board score is mapped through the rate
// that its band ACTUALLY produced across 34 graded days, then summed over the
// lineup. So a cell reads "this game projects 2.4 home runs", which is a claim
// that can be wrong — unlike a score, which can't.
//
// CALIB is copied verbatim from streamlit_app.py. Do not tune these by hand:
// they're observed rates from the graded archive, and editing them turns a
// measurement back into a guess.
// ── THE COUNT COLUMNS WERE PROBABILITIES (fixed 2026-08-16) ───────────────
//
// Donovan: "i notice like even for the team bases they are low or dont make
// good sense so some thing has to be off."
//
// He was reading a real impossibility off the screen. CALIB used to hold
// per-hitter PROBABILITIES and the table summed them and called the sum a
// count:
//
//     Proj hits   summed P(1+ hit) = 65.8%  ->  ~11.2 a game
//     Proj bases  summed P(2+ TB)  = 40.9%  ->  ~6.9 a game
//
// "PROJ BASES 6.9" therefore meant "6.9 hitters should record two or more
// total bases", not 6.9 bases — printed under a header reading expected COUNT,
// beside 11.3 hits. A game cannot produce more hits than bases. Every hit is
// at least one base.
//
// The model now lives in lib/projection.js and produces real expected counts
// off each hitter's OWN season line (AVG, ISO, walk rate, HR rate), adjusted
// by his band and scaled by expected PA from his lineup slot, with the
// arithmetic invariants enforced rather than hoped for. That file carries the
// full derivation, including why the archive could not be the base.
//
// Checked against reality: 16.1 hits / 27.1 TB / 2.08 HR / 74.4 PA per game,
// against an MLB norm near 17.0 / 27.6 / 2.5 / 76. Zero invariant violations.
// And the spread across games went from 0.9 hits (the old model was nearly
// flat — it barely discriminated at all) to 2.7.
//
// HR is the team model (below): a club's own rate, not a sum over hitters.
const COUNT_COLUMNS = [
  ['Proj hits', 'hits', 'expected hits, both lineups'],
  ['Proj TB', 'tb', 'expected total bases — always at least the hits'],
  ['Proj HRR', 'hrr', 'expected hits + runs + RBI'],
]
const COLUMNS = ['Proj HR', ...COUNT_COLUMNS.map((c) => c[0])]

// ── PROJ HR IS A TEAM MODEL NOW (2026-10-08, owner decision) ─────────────
//
// Proj HR used to be a sum over hitters: each tracked bat's chance (score band
// blended with the ISO band, form, park, arm, slot) added up. A game's number
// then moved with who happened to be on the sheet. The decision, every sport:
// the "expected" figure of a game comes from a TEAM model and the game is both
// clubs. lib/teamHr.js owns it (club HR rate x expected PA x the opposing
// starter's HR-allowed rate x park x weather, all shrunk to the league), with
// its derivation and the held-out check; lib/clubHr.js loads the one league
// table it reads. Header, Home, the Parks board and this table all read that
// one source. The old hitter-sum model is gone from here (see git history).
//
// Nothing about a hitter, a pick, a score or a board order moves: this table
// only labels games and clubs.
export function slateProjHr(players, table, pens = null) {
  return slateExpHr(players, table, { pens })
}

// 🎛 THE FILTERS (2026-08-15, Donovan: "we talked about how we'd like to
// click filters to see the projected bases and such").
//
// A projection over the whole lineup answers "what does this game produce".
// These answer the question a bettor actually has — what does the TOP of the
// order produce, what do the confirmed bats produce, what happens in the
// launch pads — and every column recomputes live, because the model is a
// per-hitter sum and a sum can be taken over any subset.
//
// The normalisers recompute over the same pool, which is the part that has to
// be right: form and park are divided by the POOL's mean, so a filtered view
// stays internally calibrated instead of quietly inheriting the whole slate's
// average and drifting.
const LENSES = [
  { key: 'set', label: '✓ Lineups in', hit: (p) => p?.lineup_confirmed === true,
    tip: 'Only hitters in a confirmed lineup — a projection over an unconfirmed one is a guess about who plays.' },
  { key: 'top5', label: 'Top 5 spots', hit: (p) => n(p?.lineup_spot, 99) <= 5,
    tip: 'Only the top five lineup spots — the bats that get the extra trip.' },
  { key: 'pad', label: '🌋 Launch pads', hit: (p) => n(p?.park_hr_factor, 1) >= 1.05,
    tip: "Only hitters in a park that adds home runs (factor 1.05 and up), before weather." },
  // A chip called "Leaky arms" has to mean what leaky means everywhere else,
  // so the cut and the sentence both come from lib/hr9.js now. It used to say
  // 1.30 while the game card called 1.30 ordinary.
  { key: 'leak', label: '🩹 Leaky arms', hit: (p) => isLeaky(n(p?.pitcher_hr9, 0)),
    tip: `Only hitters facing a starter at or over the ${LEAGUE_HR9.toFixed(2)} league HR/9 line.` },
  { key: 'hot', label: '🔥 Hot bats', hit: (p) => n(p?.last5_hr, 0) >= 1,
    tip: 'Only hitters with a home run in their last five games.' },
  // 2026-08-30, Donovan: "projected output needs more/better filters."
  // Three more, same shape as the five above -- a boolean over the same
  // per-hitter fields the model already reads, nothing new fetched.
  { key: 'cold', label: '🧊 Due (cold)', hit: (p) => n(p?.last5_hr, 0) === 0 && n(p?.games_since_last_hr, 0) >= 5,
    tip: "The mirror of Hot bats — no homer in the last five games and it's been 5+ games since the last one. A drought, not a projection." },
  { key: 'weather', label: '🌬 Weather boost', hit: (p) => {
      const wpct = n(p?.weather_hr_effect_pct, NaN)
      if (p?.weather_has_data && Number.isFinite(wpct)) return wpct >= 3
      return /out/i.test(clean(p?.wind_direction_label ?? p?.weather_wind_direction_label, ''))
    },
    tip: 'Only games where the published weather read is adding homers — wind blowing out or a +3% or better effect.' },
  { key: 'watch', label: '⭐ My watchlist', hit: () => false,
    tip: 'Only hitters on your watchlist.' },
]

// onOpenGame (2026-09-27, CLICK-EVERYTHING-PLAN): a game's label opens that game.
export default function ProjectedOutput({ games = [], players: allPlayers = [], watchIds = null, onOpenGame = null }) {
  const [lenses, setLenses] = useState(() => new Set())
  // 🔀 SORTABLE TABLE (2026-08-30, Donovan: "make it sortable and add
  // filters" -- the filters (LENSES below) already existed; this is the
  // missing half. Click a header to sort by it, click again to flip
  // direction. Defaults to Proj HR descending, same order the table has
  // always shipped in, so nothing changes for someone who never touches it.
  const [sortCol, setSortCol] = useState('Proj HR')
  const [sortDir, setSortDir] = useState('desc')
  const players = useMemo(() => {
    if (!lenses.size) return allPlayers
    const on = LENSES.filter((l) => lenses.has(l.key))
    // 'watch' has no static hit() -- it needs watchIds, which the lens table
    // above (a module-level const) can't close over. Checked separately so
    // adding it doesn't change the shape every other lens follows.
    const wantsWatch = lenses.has('watch')
    return (allPlayers || []).filter((p) =>
      on.every((l) => (l.key === 'watch' ? true : l.hit(p))) &&
      (!wantsWatch || watchIds?.has(playerId(p)))
    )
  }, [allPlayers, lenses, watchIds])
  const [by, setBy] = useState('game')

  // Opposing-pen stats, live from the MLB StatsAPI team `rp` split. Loaded
  // once per slate's teams; null until it arrives (the Adj column shows
  // when it does).
  const [pens, setPens] = useState(null)
  useEffect(() => {
    const teams = players.map((p) => oppOf(p)).filter(Boolean)
    if (!teams.length) return
    let alive = true
    penStatsFor(teams).then((m) => { if (alive) setPens(m) })
    return () => { alive = false }
  }, [players])

  // The league table the team model reads (one call, cached); null until it arrives.
  const club = useClubHr()

  const rows = useMemo(() => {
    // no league table yet (or the call failed): nothing is printed rather than a
    // number built on a guess; the panel appears the moment the table lands
    if (!club) return []
    const groups = new Map()

    if (by === 'game') {
      games.forEach((g) => {
        const gp = g.players || []
        if (!gp.length) return
        groups.set(`${g.away || '—'} @ ${g.home || '—'}`, gp)
      })
    } else {
      players.forEach((p) => {
        const t = teamOf(p)
        if (!t) return
        if (!groups.has(t)) groups.set(t, [])
        groups.get(t).push(p)
      })
    }

    return [...groups.entries()].map(([label, pool]) => {
      const values = {}
      // HR is the TEAM MODEL (lib/teamHr.js): a game is both clubs, a team is that
      // club in its game(s). The three count columns still come from
      // lib/projection.js. In the By-team view a lens decides WHICH clubs show; the
      // club's number is the club's, not a sum over the hitters the lens kept.
      const hrOf = (m) => (by === 'game'
        ? gameExpHr(pool, club, { pens: m })?.total
        : clubExpHr(label, pool, club, { pens: m }))
      values['Proj HR'] = hrOf(null) ?? 0
      const proj = projectPool(pool)
      COUNT_COLUMNS.forEach(([col, key]) => { values[col] = proj[key] })

      // ADJ HR -- the same team model with the opposing pen's live StatsAPI HR/9
      // (shrunk, 100 pseudo-innings) standing in for the league-average relief
      // share of the game: the late-game term the starter-only figure never priced.
      // Present once the pens load; Proj HR is the club model, Adj HR is the club
      // model with the pen. (The old hand-layered park/weather/trend multipliers
      // are gone: park and weather are already inside both columns.)
      values['Adj HR'] = pens ? (hrOf(pens) ?? 0) : 0

      return { label, values, _count: pool.length, _pk: by === 'game' ? pool[0]?.game_pk ?? null : null }
    })
      .sort((a, b) => {
        const av = sortCol === 'label' ? a.label : a.values[sortCol]
        const bv = sortCol === 'label' ? b.label : b.values[sortCol]
        const cmp = sortCol === 'label' ? String(av).localeCompare(String(bv)) : (bv - av)
        return sortDir === 'asc' ? -cmp : cmp
      })
      // RANK IN THE LABEL (2026-08-08, "turn that up some more"): the table
      // is sorted by whatever column is active but nothing SAID so — a rank
      // number makes the ordering legible and gives the rows something to be
      // quoted by. Ranking now follows the live sort (2026-08-30), not
      // always Proj HR, so "#1" means #1 by whatever you clicked.
      .map((r, i) => ({ ...r, label: `${i + 1}.  ${r.label}` }))
  }, [games, players, by, pens, club, sortCol, sortDir])

  // THE VIEW IS SHARED NOW (2026-09-28): components/slate/ProjectedView.js
  // draws all of this, style for style, for TUDDY and LAMP too. MOONSHOT's
  // model, words and colours stay here.
  const cols = [...COLUMNS, ...(pens ? ['Adj HR'] : [])]
  return (
    <ProjectedView
      lenses={LENSES} active={lenses} setActive={setLenses} shownCount={players.length} totalCount={allPlayers.length} noun="hitters" sport="mlb"
      by={by} setBy={setBy}
      note={<>
        How it is built: each club&apos;s own HR rate per PA (shrunk toward the league) × the PA it
        takes × the opposing starter&apos;s HR-allowed rate × the park and the weather. A game is both clubs.
      </>}
      rows={rows} primary="Proj HR" adj="Adj HR" unit="HR" columns={cols} spreadBands
      sortCol={sortCol} sortDir={sortDir} onSort={sortClick(sortCol, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} tracked hitters · ${r.values['Proj hits'].toFixed(1)} hits · ${r.values['Proj TB'].toFixed(1)} total bases · ${r.values['Proj HRR'].toFixed(1)} H+R+RBI`}
      barsTitle={<>Proj HR by {by === 'game' ? 'game' : 'team'} — tonight&apos;s power, top to bottom</>}
      barsFoot={<>Bar length is Proj HR{pens ? <>; the <span style={{ color: C.amber }}>tick</span> marks Adj HR once the opposing pens load</> : ''} — same numbers as the table below, ordered top to bottom instead of read cell by cell.</>}
      footnote={<>
        PROJ HR IS A TEAM MODEL (2026-10-08) — each club&apos;s season home-run rate per plate appearance
        (pulled toward the league average, hard early in the year), its expected plate appearances, the
        opposing starter&apos;s HR-allowed rate (also shrunk), the park&apos;s HR factor at half weight and the
        published weather effect. It does not depend on which hitters are on the sheet. Adj HR is the same
        model with the opposing pen&apos;s live HR/9 in place of an average relief share. Hits, TB and HRR are
        still real expected counts built from each tracked hitter&apos;s own season line and lineup slot (TB
        ≥ hits is enforced on every row). A colored pill on Proj HR or Adj HR means that game sits clearly
        above (▲) or below (▼) tonight&apos;s own spread of that number, not a fixed threshold.
      </>}
      onOpenGame={onOpenGame} accent={C.orange} tick={C.amber}
      palette={{
        color: { hot: C.orange, warm: C.pillWarm, cool: C.pillCool, cold: C.pillCold },
        bg: { hot: `${C.orange}26`, warm: `${C.orange}14`, cool: alpha(C.blue, 31 / 255), cold: alpha(C.blue, 20 / 255) },
      }}
    />
  )
}
