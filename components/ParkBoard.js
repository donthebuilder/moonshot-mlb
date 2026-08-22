'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../lib/player'
import { teamAbbrs } from '../lib/gamelogs'
import { fetchPenFatigue, penTier } from '../lib/bullpen'
import { fetchRestTravel } from '../lib/restTravel'
import { dataUrl } from '../lib/dataSource'
import { divChip, seqChip, SEQ_AUTO } from '../lib/scales'
import { projectPool, projectionPublished } from '../lib/projection'
import MobileFold from './MobileFold'

// WEATHER-PAGE MODE (2026-08-07, Donovan): one schedule call turns the park
// board into tonight's weather desk — live game status (delayed / postponed /
// suspended), first pitch, per-team lineup confirmation and a delay-risk
// read off the rain chance. Context lane only; nothing here feeds a score.
function useGameStatus(slateDate) {
  const [st, setSt] = useState({})
  useEffect(() => {
    let alive = true
    const load = () => {
      const day = slateDate || new Date().toLocaleDateString('en-CA')
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&fields=dates,games,gamePk,status,detailedState,abstractGameState`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return
          const m = {}
          ;(j?.dates?.[0]?.games || []).forEach((g) => {
            m[g.gamePk] = { detail: g?.status?.detailedState || '', state: g?.status?.abstractGameState || '' }
          })
          setSt(m)
        })
        .catch(() => {})
    }
    load()
    // Background tabs don't poll (2026-08-09 scan).
    const id = setInterval(() => { if (!document.hidden) load() }, 5 * 60_000) // weather desk cadence, not live-wire cadence
    return () => { alive = false; clearInterval(id) }
  }, [slateDate])
  return st
}

const timeText = (t) => {
  if (!t) return ''
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// "Luis García Jr." must not render as "Jr." — keep the suffix attached.
const SUFFIX = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv'])
const surname = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  if (parts.length >= 2 && SUFFIX.has(parts[parts.length - 1].toLowerCase())) {
    return parts.slice(-2).join(' ')
  }
  return parts.slice(-1)[0] || '?'
}

// 🏟 PARK BOARD — tonight's parks ranked by HR-friendliness (2026-08-07).
//
// Promoted out of the Longest board's footnote strip to the top of the Power
// page, where Donovan expected it. One honest edge number per park:
//   park term — (park HR factor − 1) × 100, the bot's own park number
//   weather   — the bot's weather_hr_effect_pct when published, else a
//               gentle wind/temp heuristic (±1 per mph out/in, +1 per ~7°F
//               over 70) so the board still ranks on thin payloads.
// It ranks cards and scores nothing. Each card names the two biggest
// distance threats in that building (by longest_hr_score) and clicking a
// card filters the Longest board to that game — click again to release.
//
// ── DEMOTED, NOT DELETED (2026-08-15) ────────────────────────────────────────
// Donovan: "i dont like the parks ranked like that at the top." Fair — this
// was the first thing on the Power page, so fifteen weather cards stood
// between him and the board he opened the tab for. It is now the THIRD LENS
// behind the page's one switch, and the page's lead sentence names tonight's
// friendliest and coldest buildings (off `parkRows` below, so the numbers
// cannot disagree) with this ladder one tap away. Nothing on any card was
// touched: every card, chip, tooltip and the Combined / Stadium / Weather
// switch are all still here, one click later than they used to be.

const wTemp = (p) => n(p?.weather_temp_f, n(p?.temp_f, 0))
const wWind = (p) => n(p?.weather_wind_mph, n(p?.wind_mph, 0))

// 🏟 THE PARK ARITHMETIC, EXTRACTED (2026-08-15).
//
// The Power page no longer OPENS on this board (Donovan: "i dont like the
// parks ranked like that at the top"), so its lead sentence names tonight's
// friendliest and coldest buildings before any table renders. That sentence
// has to agree with this board to the last percent, and the only way to
// guarantee that is to rank both off one function — a second copy of the
// park+weather sum in Power.js would have drifted the first time either side
// was touched.
//
// Pure, no hooks: one row per game_pk, each carrying its park term, its
// weather term and their sum, plus everything the cards read.
export function parkRows(players = []) {
  const map = new Map()
  players.forEach((p) => {
    const pk = p?.game_pk
    if (pk == null) return
    if (!map.has(pk)) {
      map.set(pk, {
        pk,
        venue: clean(p?.venue_name, ''),
        temp: wTemp(p),
        wind: wWind(p),
        windLabel: clean(p?.wind_direction_label, ''),
        parkHR: n(p?.park_hr_factor, n(p?.park_dist_factor, 0)),
        wxEff: n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, null)),
        roof: clean(p?.roof, ''),
        rain: n(p?.weather_precip_chance, n(p?.precip_chance, 0)) * 100,
        // 2026-08-09, Donovan: "parks should be more focused on the weather
        // and park conditions, emphasize that." These three were already in
        // the payload and the board never read them.
        //
        // UNITS (2026-08-15): weather_humidity is published as PERCENT (51,
        // not 0.51 — checked across the whole slate), and this card read it as
        // a fraction. Every game therefore scored as "humid", and the Air
        // tooltip printed "5100% humidity". Normalised here so the card is
        // right whichever spelling the bot sends; the reads below now compare
        // against percent thresholds.
        humidity: (() => {
          const h = n(p?.weather_humidity, null)
          return h == null ? null : (h > 0 && h <= 1 ? h * 100 : h)
        })(),
        feels: n(p?.weather_feels_like_f, null),
        windBoost: n(p?.weather_wind_boost, null),
        time: p?.game_time || null,
        matchup: `${teamOf(p) || '?'} vs ${oppOf(p) || '?'}`,
        bats: [],
        confByTeam: {},
      })
    }
    const g0 = map.get(pk)
    g0.bats.push(p)
    const tm = teamOf(p)
    if (tm && !(tm in g0.confByTeam)) g0.confByTeam[tm] = p?.lineup_confirmed !== false
  })
  const out = [...map.values()].filter((g) => g.venue || g.temp)
  const windOut = (g) => /out/i.test(g.windLabel) ? g.wind : /in\b/i.test(g.windLabel) ? -g.wind : 0
  out.forEach((g) => {
    const parkTerm = g.parkHR > 0 ? (g.parkHR - 1) * 100 : 0
    const wxTerm = g.wxEff != null ? g.wxEff : windOut(g) + (g.temp > 0 ? (g.temp - 70) / 7 : 0)
    // All three lenses computed once — the toggle below just picks which
    // one ranks the board (2026-08-15, from the park-factors site Donovan
    // sent: their Combined / Stadium Only / Weather Only switch, on ours).
    g.parkTerm = parkTerm
    g.wxTerm = wxTerm
    g.edge = parkTerm + wxTerm
    g.wxFromBot = g.wxEff != null
    g.threats = [...g.bats].sort((a, b) => n(b?.longest_hr_score, 0) - n(a?.longest_hr_score, 0)).slice(0, 2)
  })
  return out
}

// `fold` (2026-08-15): on the Power page this board is now one of three LENSES
// behind a single switch, so choosing "Parks" is already the open gesture —
// wrapping it in the phone fold on top of that would make a phone user tap
// twice to see the thing he just asked for. Every other mount keeps the fold.
export default function ParkBoard({ players = [], slateDate = '', activeVenue, onVenueClick, onPlayerClick, fold = true }) {
  const parks = useMemo(() => parkRows(players), [players])

  const statuses = useGameStatus(slateDate)
  // pen fatigue means 'threw YESTERDAY' — that claim is only true for a
  // today slate; on tomorrow's board the relevant night hasn't happened.
  const penApplies = !slateDate || slateDate <= new Date().toLocaleDateString('en-CA')

  // Bullpen fatigue, joined by abbreviation (slate rows carry abbrs, the
  // boxscores carry ids — teamAbbrs() is the bridge, already cached).
  const [penByAbbr, setPenByAbbr] = useState(null)
  useEffect(() => {
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([pen, abbrs]) => {
      const m = {}
      Object.entries(pen || {}).forEach(([tid, t]) => {
        const ab = abbrs?.[tid]
        if (ab) m[ab] = t
      })
      setPenByAbbr(m)
    }).catch(() => {})
  }, [])

  // 😴 rest & travel (audit #9): one schedule range call, flags per team.
  // Unlike pen fatigue this DOES apply to a tomorrow slate — the range just
  // shifts with the slate date. Context chips only; nothing is scored.
  const [restByAbbr, setRestByAbbr] = useState(null)
  useEffect(() => {
    const date = slateDate || new Date().toLocaleDateString('en-CA')
    Promise.all([fetchRestTravel(date), teamAbbrs()]).then(([rt, abbrs]) => {
      const m = {}
      rt.forEach((flags, tid) => {
        const ab = abbrs?.[tid]
        if (ab) m[ab] = flags
      })
      setRestByAbbr(m)
    }).catch(() => {})
  }, [slateDate])

  // 🏟 HOUSE HISTORY (2026-08-08, Donovan: "for the players in that park
  // too"). The bot's nightly context pack carries every slate player's HR
  // record at tonight's building (venue-ID matched). One fetch; each card
  // then names its bats with real history here. Date-gated: the pack is
  // today's slate, so tomorrow mode shows nothing rather than wrong parks.
  // Quiet until the first pack publishes — no file, no line, no fakes.
  const [housePack, setHousePack] = useState(null)
  useEffect(() => {
    fetch(dataUrl('current/context_pack_latest.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.players) setHousePack(j) })
      .catch(() => {})
  }, [])
  // strict date gate: the pack must be FOR the slate being viewed — a stale
  // pack quietly showing yesterday's parks would be worse than nothing
  const packApplies = housePack
    && housePack.slate_date === (slateDate || new Date().toLocaleDateString('en-CA'))

  // 2026-08-13, Donovan (screenshot feedback): "too many cards on screen at
  // once" + "packed with too much text." Each card already carries nine
  // stacked info blocks built up over a dozen prior feedback rounds — real
  // content, not fat to trim blind. Fifteen of them at once was the actual
  // problem. Six is enough to see both ends of tonight's range (the glowing
  // top-3 plus a bit of context) without the wall; the rest are a tap away.
  const DEFAULT_SHOWN = 6
  const [showAllParks, setShowAllParks] = useState(false)

  // 🔀 THE LENS. Combined ranks like always; Stadium ranks on the building
  // alone (structural, survives the season); Weather ranks on tonight alone
  // (expires at midnight). The big number on each card follows the lens, so
  // "which building is best" and "where is tonight's air best" are one tap
  // apart instead of one mental subtraction apart.
  //
  // HOOK ORDER (2026-08-15): this useState and the `ranked` memo below it used
  // to sit AFTER the `if (!parks.length) return null` guard. On a slate that
  // arrives a beat late — empty first render, populated second — React counted
  // a different number of hooks between the two renders and threw the tree
  // away. Both moved above the guard; neither changed otherwise.
  const [lens, setLens] = useState('both')

  // ── THE PROJECTED-OUTCOME LENS (2026-08-22) ──────────────────────────────
  //
  // Donovan: "Parks is cool but needs to be more based around the projected
  // outcome — weather-driven, mixed with a park/hitter table, or something
  // using projected output data: bases, HR, R, team K's."
  //
  // Every other lens on this board answers "what does the BUILDING do",
  // which is a property of the venue and identical every night. This one
  // answers "what is tonight's game projected to PRODUCE in it", which is the
  // question he is actually asking — and it needs the lineups, not the park.
  //
  // lib/projection.js already owns this and enforces the invariants (a game
  // cannot produce fewer bases than hits, or more homers than hits), so this
  // is a call rather than a new model.
  const proj = useMemo(() => {
    const out = {}
    parks.forEach((g) => { out[g.pk] = projectPool(g.bats) })
    return out
  }, [parks])
  const hasProj = useMemo(() => projectionPublished(parks.flatMap((g) => g.bats)), [parks])

  const lensVal = (g) => (
    lens === 'park' ? g.parkTerm
      : lens === 'wx' ? g.wxTerm
        : lens === 'proj' ? (proj[g.pk]?.hr ?? 0)
          : g.edge
  )
  const ranked = useMemo(() => [...parks].sort((a, b) => lensVal(b) - lensVal(a)), [parks, lens, proj])

  // The slate's own middle, so the projected lens has a real anchor rather
  // than an invented one. A projection is only interesting against the other
  // fourteen games tonight.
  const projMid = useMemo(() => {
    const v = parks.map((g) => proj[g.pk]?.hr ?? 0).filter((x) => x > 0).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : 0
  }, [parks, proj])

  // The distance-threat range, for the pills. A hitter's score is HIS number
  // and it now wears HIS colour instead of the park's.
  const threatRange = useMemo(() => {
    const v = parks.flatMap((g) => g.threats.map((p) => n(p?.longest_hr_score, 0))).filter((x) => x > 0)
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1]
  }, [parks])

  if (!parks.length) return null

  const visibleParks = showAllParks ? ranked : ranked.slice(0, DEFAULT_SHOWN)

  // ── THE BAND, NOW ON THE ONE DIVERGING SCALE (2026-08-22) ────────────────
  //
  // The icon ladder and the words are unchanged — they are the redundant,
  // colour-blind-safe half of this encoding and they were always the good
  // part. What changed is the colour underneath them.
  //
  // Before: five hard-coded hexes (#f97316 #fb923c #FCD34D #7dd3fc #38bdf8)
  // that no theme could reach, on a scale that was *shaped* like a diverging
  // scale without being one — the two warm bands and the amber middle sat at
  // three different hues, so "fair" read as a third verdict rather than as
  // the absence of one.
  //
  // Now: `edge` is what it always was — a signed percentage against a NEUTRAL
  // PARK IN NEUTRAL AIR — so it gets the diverging scale, anchored at 0,
  // saturating at ±12%, with a dead band that renders the middle quiet. Warm
  // = the building and the air are adding homers; cool = taking them away;
  // neutral = neither, and it should look like neither.
  const EDGE_CEIL = 12
  const bandOf = (edge) => {
    const meta = edge >= 10 ? { icon: '🌋', word: 'LAUNCH PAD' }
      : edge >= 5 ? { icon: '🔥', word: 'CARRIES' }
      : edge >= 0 ? { icon: '🌤', word: 'FAIR' }
      : edge >= -8 ? { icon: '🌬', word: 'HEAVY AIR' }
      : { icon: '🧊', word: 'ICE BOX' }
    return { ...meta, col: divChip(edge, { anchor: 0, ceiling: EDGE_CEIL, deadband: 0.08 }) }
  }

  // The projected lens is a COUNT, not a percentage, so it cannot share the
  // edge ladder — a count has no neutral at zero. Its anchor is the slate's
  // own median game, which is the only honest middle for "is this game
  // projected to produce more than the others tonight".
  const projBandOf = (hr) => {
    const d = projMid > 0 ? (hr - projMid) / projMid : 0
    const meta = d >= 0.30 ? { icon: '🌋', word: 'BIGGEST SLATE' }
      : d >= 0.12 ? { icon: '🔥', word: 'ABOVE SLATE' }
      : d >= -0.12 ? { icon: '🌤', word: 'SLATE AVERAGE' }
        : d >= -0.30 ? { icon: '🌬', word: 'BELOW SLATE' }
          : { icon: '🧊', word: 'QUIETEST' }
    return { ...meta, col: divChip(hr, { anchor: projMid, ceiling: Math.max(0.35, projMid * 0.6), deadband: 0.12 }) }
  }

  const bandFor = (g) => (lens === 'proj' ? projBandOf(lensVal(g)) : bandOf(lensVal(g)))

  // 📱 THE PHONE FOLD (2026-08-09, Donovan: "tonight's parks could be a drop
  // down on mobile, it's too long to scroll"). Fifteen cards are three tidy
  // rows on a desktop and fifteen full screens on a phone. The summary has to
  // carry the headline fact or the fold is just a wall with a door in it, so
  // it names the best air in the league tonight and by how much — which is
  // the one thing most people open this board for.
  const best = ranked[0]
  const foldSummary = `${parks.length} parks · best air ${best.edge > 0 ? '+' : ''}${best.edge.toFixed(0)}% ${best.venue || best.matchup}`

  const body = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🏟 Tonight&apos;s conditions</span>
        {/* Was a four-clause inventory of the card's contents. The cards say
            what they contain; the header only has to say the sort order and
            the one interaction that isn't obvious. */}
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}
          title="Ranked by park factor plus tonight's weather. Every card carries live game status, first pitch, rain risk and per-team lineup confirmation.">
          🌋 launch pads → 🧊 ice boxes · tap to filter
        </span>
        <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
          {[['both', 'Combined'], ['park', 'Stadium only'], ['wx', 'Weather only'],
            ...(hasProj ? [['proj', 'Projected HR']] : [])].map(([k, label]) => (
            <button key={k} onClick={() => setLens(k)} style={{
              fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, cursor: 'pointer',
              padding: '2px 8px', borderRadius: 999, letterSpacing: '.04em',
              border: `1px solid ${lens === k ? C.orange : C.border}`,
              background: lens === k ? 'rgba(249,115,22,.14)' : 'transparent',
              color: lens === k ? C.orange : C.text3,
            }}>{label}</button>
          ))}
        </span>
      </div>
      {/* EVEN ROWS (2026-08-08, Donovan): auto-fill grid stranded ragged
          rows once the featured card spanned two columns. Flex with grow —
          the same trick the game chips use — stretches every row edge to
          edge, and flex's default align-stretch keeps card heights even
          within each row. The featured #1 park earns extra width through a
          bigger basis instead of a grid span. */}
      {/* Top-3 breathe (2026-08-09). Same inline-keyframes trick LiveWire uses
          for wirePulse. The glow is an overlay rather than an animated
          box-shadow because the colour is per-band and keyframes can't take a
          runtime value — the overlay carries the band colour and only its
          opacity animates. Durations are staggered per rank so the three
          don't pulse in lockstep, which reads as a UI bug rather than as
          emphasis. Anyone who has asked their OS for less motion gets a
          static glow. */}
      <style>{
        '@keyframes parkGlow{0%,100%{opacity:.28}50%{opacity:1}}'
        + '@media (prefers-reduced-motion: reduce){.park-glow{animation:none!important;opacity:.6!important}}'
      }</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {visibleParks.map((g, i2) => {
          const band = bandFor(g)
          const pj = proj[g.pk]
          const isActive = activeVenue && g.venue === activeVenue
          const isTop = i2 < 3 && g.edge > 0
          const out = /out/i.test(g.windLabel)
          const wIn = /in\b/i.test(g.windLabel)
          // roofNote retired 2026-08-09 — the roof now has its own conditions cell
          return (
            <div
              key={g.pk}
              onClick={() => onVenueClick?.(isActive ? '' : g.venue)}
              title={`Park ${g.parkHR > 0 ? `×${g.parkHR.toFixed(2)}` : '—'} + ${g.wxFromBot ? "the bot's weather HR effect" : 'wind/temp heuristic (bot weather effect not published for this game)'} = ${g.edge > 0 ? '+' : ''}${g.edge.toFixed(0)}% vs neutral. Ranks this board, scores nothing.`}
              style={{
                cursor: 'pointer', position: 'relative', overflow: 'hidden', minWidth: 0,
                // maxWidth (2026-08-15, Donovan's screenshot): an orphan card on the
                // last flex row grew to the FULL row — one park stretched edge
                // to edge with its chips pulled comically wide. Growth is now
                // capped, so a lone straggler stays card-shaped.
                flex: `${i2 === 0 && g.edge > 0 ? 2 : 1} 1 ${i2 === 0 && g.edge > 0 ? 320 : 196}px`,
                maxWidth: i2 === 0 && g.edge > 0 ? 620 : 430,
                background: `linear-gradient(160deg, ${band.col}${isTop ? '2e' : '1a'} 0%, ${band.col}08 48%, ${C.bg2} 100%)`,
                border: `1px solid ${isActive ? band.col : `${band.col}${isTop ? '70' : '35'}`}`,
                borderRadius: 12, padding: '9px 11px 8px',
                boxShadow: isActive ? `0 0 18px ${band.col}44` : isTop ? `0 0 12px ${band.col}22` : 'none',
              }}
            >
              {isTop && (
                <div
                  className="park-glow"
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none',
                    boxShadow: `0 0 16px ${band.col}55, inset 0 0 26px ${band.col}1c`,
                    animation: `parkGlow ${(3.2 + i2 * 0.45).toFixed(2)}s ease-in-out infinite`,
                  }}
                />
              )}

              {/* rank badge — the old oversized watermark, cleaned up into a
                  quiet corner chip (refresh 2026-08-08) */}
              <div style={{
                position: 'absolute', top: 7, right: 8, fontFamily: NUM_FONT,
                fontSize: 8.5, fontWeight: 900, color: band.col, lineHeight: 1, pointerEvents: 'none',
                border: `1px solid ${band.col}45`, borderRadius: 999, padding: '2px 6px',
                background: `${band.col}12`, letterSpacing: '.02em',
              }}>#{i2 + 1}</div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 15 }}>{band.icon}</span>
                <span style={{ fontSize: 18, fontWeight: 900, fontFamily: NUM_FONT, color: band.col, letterSpacing: '-0.03em' }}>
                  {lens === 'proj'
                    ? lensVal(g).toFixed(1)
                    : `${lensVal(g) > 0 ? '+' : ''}${lensVal(g).toFixed(0)}%`}
                </span>
                <span style={{ fontSize: 7.5, fontWeight: 900, color: band.col, letterSpacing: '.08em', fontFamily: NUM_FONT, opacity: 0.85 }}>
                  {lens === 'proj' ? 'PROJ HR' : band.word}
                </span>
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.venue || g.matchup}
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginTop: 2, fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
                <span style={{ fontWeight: 800, color: C.text2 }}>{g.matchup}</span>
              </div>

              {/* ── 📐 WHAT IT IS PROJECTED TO PRODUCE (2026-08-22) ──────────
                  Donovan: Parks "needs to be more based around the projected
                  outcome… projected output data: bases, HR, R, team K's."

                  Everything above this line is a property of the BUILDING and
                  is the same every night. This line is a property of TONIGHT'S
                  TWO LINEUPS in it, which is what he is actually asking the
                  board. Counts, from lib/projection.js, which enforces that a
                  game cannot project fewer bases than hits.

                  Each figure is drawn against the SLATE MEDIAN — the only
                  honest anchor for "is this game bigger than the others
                  tonight" — with ▲/▼ carrying the sign so the read survives
                  greyscale. `pj.n` is the denominator and it is printed. */}
              {pj && pj.n > 0 && (
                <div
                  title={`Projected from ${pj.n} tracked bats across both lineups, ${pj.pa.toFixed(0)} expected plate appearances. Counts, not probabilities — and not park-adjusted, so read them next to the park number rather than through it.`}
                  style={{
                    display: 'flex', gap: 9, alignItems: 'baseline', marginTop: 4,
                    fontFamily: NUM_FONT, fontSize: 9, flexWrap: 'wrap',
                    borderTop: `1px solid ${C.border}`, paddingTop: 4,
                  }}
                >
                  <span style={{ color: C.text3, fontWeight: 800, letterSpacing: '.05em' }}>📐 PROJ</span>
                  {[
                    ['HR', pj.hr, projMid, Math.max(0.35, projMid * 0.6), 1],
                    ['bases', pj.tb, null, null, 0],
                    ['hits', pj.hits, null, null, 0],
                    ['HRR', pj.hrr, null, null, 0],
                  ].map(([label, v, anchor, ceil, dp]) => {
                    const col = anchor == null ? C.text2 : divChip(v, { anchor, ceiling: ceil, deadband: 0.12 })
                    const arrow = anchor == null ? '' : v > anchor * 1.12 ? '▲' : v < anchor * 0.88 ? '▼' : '·'
                    return (
                      <span key={label} style={{ color: C.text3, whiteSpace: 'nowrap' }}>
                        <b style={{ color: col, fontWeight: 800 }}>{v.toFixed(dp)}</b>
                        {arrow && arrow !== '·' && (
                          <span style={{ color: col, fontSize: 7.5, marginLeft: 1 }}>{arrow}</span>
                        )}
                        {' '}{label}
                      </span>
                    )
                  })}
                  <span style={{ color: C.text3, opacity: 0.8 }}>from {pj.n} bats</span>
                </div>
              )}

              {/* ── 🌦 CONDITIONS (2026-08-09) ────────────────────────────────
                  Donovan: "parks should be more focused on the weather and
                  park conditions — emphasize that."
                  Temperature, wind, air and sky used to be four values at 9px
                  in C.text3 sharing one line with the matchup, i.e. styled as
                  the least important thing on a card whose entire subject is
                  the weather. Four labelled cells now, coloured by whether
                  each one helps the ball leave, with the reasoning in every
                  tooltip. Values that aren't published simply don't render —
                  no zeroes standing in for a missing reading.

                  AIR is derived, and says so: warm air is less dense than
                  cold, and humid air is slightly less dense than dry (water
                  vapour is lighter than the nitrogen it displaces), so both
                  push the same direction. Temperature does nearly all the
                  work; humidity is a nudge, and is only allowed to move the
                  verdict at the margins. */}
              {(() => {
                const closed = /dome|closed/i.test(g.roof)
                const cells = []

                if (g.temp > 0) {
                  const warm = g.temp >= 82; const cold = g.temp <= 58
                  cells.push({
                    k: 'temp', label: 'Temp',
                    val: `${Math.round(g.temp)}°`,
                    col: warm ? '#fb923c' : cold ? '#38bdf8' : C.text2,
                    tip: `${Math.round(g.temp)}°F at first pitch${g.feels != null && Math.abs(g.feels - g.temp) >= 3 ? `, feels like ${Math.round(g.feels)}°` : ''}. Warm air is thinner, so the ball carries further; cold air is dense and holds it up.`,
                  })
                }

                if (g.wind > 0) {
                  cells.push({
                    k: 'wind', label: 'Wind',
                    val: `${out ? '↗' : wIn ? '↙' : '→'} ${Math.round(g.wind)}`,
                    col: closed ? C.text3 : out ? '#fb923c' : wIn ? '#38bdf8' : C.text2,
                    tip: closed
                      ? `${Math.round(g.wind)} mph ${g.windLabel || 'outside'} — but the roof is ${g.roof.toLowerCase()}, so it doesn't reach the field.`
                      : `${Math.round(g.wind)} mph, ${g.windLabel || 'direction not published'}.${out ? ' Blowing out — the biggest single weather factor there is for home runs.' : wIn ? ' Blowing in — knocks down balls that would otherwise carry.' : ' Crosswind: it pushes balls sideways more than it helps or hurts distance.'}${g.windBoost != null ? ` The bot scores this wind at ${g.windBoost > 0 ? '+' : ''}${(g.windBoost * 100).toFixed(0)}%.` : ''}`,
                  })
                }

                if (g.temp > 0) {
                  // Temperature leads; humidity nudges the boundary by a few
                  // degrees rather than getting a verdict of its own.
                  const humid = g.humidity != null && g.humidity > 65
                  const dry = g.humidity != null && g.humidity < 35
                  const eff = g.temp + (humid ? 3 : dry ? -3 : 0)
                  const read = eff >= 80 ? { w: 'thin', c: '#fb923c' } : eff <= 62 ? { w: 'heavy', c: '#38bdf8' } : { w: 'average', c: C.text2 }
                  cells.push({
                    k: 'air', label: 'Air',
                    val: read.w,
                    col: read.c,
                    tip: `Air density, read from temperature${g.humidity != null ? ` (${Math.round(g.humidity)}% humidity)` : ''}. Warm air is thinner and the ball carries; cold air is dense and it doesn't. Humid air is very slightly thinner than dry air — water vapour weighs less than the air it replaces — so it nudges the same way. Derived here, not a published number.`,
                  })
                }

                cells.push(closed
                  ? { k: 'sky', label: 'Roof', val: 'closed', col: '#a78bfa', tip: `${g.roof} — no wind, no rain, no sun. Conditions in this building are the same every night.` }
                  : g.rain >= 20
                    ? { k: 'sky', label: 'Rain', val: `${Math.round(g.rain)}%`, col: g.rain >= 50 ? '#f87171' : '#7dd3fc', tip: `${Math.round(g.rain)}% chance of precipitation around first pitch, from the bot's weather pull. A delay-risk read, not a promise of one.` }
                    : { k: 'sky', label: 'Sky', val: g.roof ? 'open' : 'clear', col: C.text2, tip: g.roof ? `${g.roof} — open tonight, so the weather above plays.` : 'No meaningful rain chance published for first pitch.' })

                // ONE LINE, NOT FOUR BOXES (2026-08-15). Donovan, third time
                // on this card and the second time on tiles generally: "still
                // don't like those park chips" — after "i dont like the tile
                // style, id rather text just like the storylines section."
                // Four labelled cells turned four short facts into a widget
                // you had to parse; as a sentence they read at a glance and
                // give the card its space back. Every colour and every
                // tooltip survives verbatim — the words carry the meaning,
                // the boxes never did.
                const phrase = (c) => (
                  c.k === 'temp' ? c.val
                    : c.k === 'wind' ? `${c.val} mph`
                    : c.k === 'air' ? `${c.val} air`
                    : c.label === 'Roof' ? `roof ${c.val}`
                    : c.label === 'Rain' ? `${c.val} rain`
                    : `${c.val} sky`
                )
                return (
                  <div style={{
                    marginTop: 4, fontSize: 10.5, lineHeight: 1.65, color: C.text3,
                    // wraps between facts instead of running off the card —
                    // each fact stays whole, the line breaks between them
                    whiteSpace: 'normal', overflowWrap: 'anywhere',
                  }}>
                    {cells.map((c, ci) => (
                      <span key={c.k} title={c.tip} style={{ cursor: 'help', whiteSpace: 'nowrap' }}>
                        {ci > 0 && <span style={{ color: C.border2 }}>{'  ·  '}</span>}
                        <b style={{ color: c.col, fontFamily: NUM_FONT, fontWeight: 800 }}>{phrase(c)}</b>
                      </span>
                    ))}
                  </div>
                )
              })()}

              {/* 🏟 PARK FACTOR, MADE VISIBLE (2026-08-09).
                  It used to be a bare "×1.07" buried in the weather run, at
                  9px, between a temperature and a roof note — the single most
                  important structural number on the card, styled like a
                  footnote. It's a pill now, coloured by which side of 1.00 it
                  sits on, with a track showing where it lands in the league's
                  range and a tick at neutral. The range is a fixed display
                  scale (0.80–1.25 covers every park the bot publishes), not a
                  percentile, and the tooltip says so. */}
              {g.parkHR > 0 && (() => {
                const above = g.parkHR >= 1
                const col = above ? '#fb923c' : '#38bdf8'
                const LO = 0.80, HI = 1.25
                const pos = Math.max(0, Math.min(1, (g.parkHR - LO) / (HI - LO)))
                const neutral = (1 - LO) / (HI - LO)
                const pctTxt = `${above ? '+' : '−'}${Math.abs((g.parkHR - 1) * 100).toFixed(0)}%`
                return (
                  <div
                    title={`Park HR factor ×${g.parkHR.toFixed(2)} — this building ${above ? 'adds' : 'removes'} about ${pctTxt.replace(/[+−]/, '')} of home-run rate versus a neutral park, before any weather. The bot's own park number. Track runs ${LO}–${HI} (a fixed display range covering every park published, not a percentile); the pale tick is neutral 1.00.`}
                    style={{ marginTop: 4, cursor: 'help' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.05em',
                        color: col, border: `1px solid ${col}55`, background: `${col}14`,
                        borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                      }}>PARK ×{g.parkHR.toFixed(2)}</span>
                      <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>{pctTxt} vs neutral</span>
                    </div>
                    <div style={{ position: 'relative', height: 4, borderRadius: 3, background: 'rgba(255,255,255,.07)', marginTop: 3, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', top: 0, bottom: 0, borderRadius: 3, background: col,
                        left: `${(Math.min(pos, neutral) * 100).toFixed(1)}%`,
                        width: `${(Math.abs(pos - neutral) * 100).toFixed(1)}%`,
                        minWidth: 2,
                      }} />
                      <div style={{
                        position: 'absolute', left: `${(neutral * 100).toFixed(1)}%`, top: -1, bottom: -1,
                        width: 1.5, background: 'rgba(255,255,255,.5)',
                      }} />
                    </div>
                  </div>
                )
              })()}

              {/* the weather-desk line: live status beats schedule beats nothing */}
              {(() => {
                const st = statuses[g.pk]
                const bad = st && /delay|postpon|suspend/i.test(st.detail)
                const live = st?.state === 'Live'
                const final = st?.state === 'Final'
                const teams = Object.keys(g.confByTeam)
                const rainy = g.rain >= 20 && !final && !/dome|closed/i.test(g.roof)
                return (
                  <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginTop: 3, fontFamily: NUM_FONT, fontSize: 8.5, flexWrap: 'wrap' }}>
                    {bad ? (
                      <span style={{ color: '#f87171', fontWeight: 900 }}>⚠ {st.detail.toUpperCase()}</span>
                    ) : live ? (
                      <span style={{ color: '#4ade80', fontWeight: 800 }}>● LIVE</span>
                    ) : final ? (
                      <span style={{ color: C.text3, fontWeight: 700 }}>FINAL</span>
                    ) : (
                      g.time && <span style={{ color: C.text3 }}>⏰ {timeText(g.time)}</span>
                    )}
                    {rainy && (
                      <span title="Rain chance from the bot's weather pull — a delay-risk read, not a forecast of one" style={{ color: g.rain >= 50 ? '#f87171' : '#7dd3fc', fontWeight: 800 }}>
                        ☔ {Math.round(g.rain)}%{g.rain >= 50 ? ' delay risk' : ''}
                      </span>
                    )}
                    {teams.length === 2 && !final && (
                      <span title="Per-team lineup confirmation — ✓ posted, ◻ still projected" style={{ color: C.text3 }}>
                        {teams.map((tm, ti) => (
                          <span key={tm}>
                            {tm} <b style={{ color: g.confByTeam[tm] ? '#4ade80' : '#FCD34D' }}>{g.confByTeam[tm] ? '✓' : '◻'}</b>
                            {ti === 0 ? ' · ' : ''}
                          </span>
                        ))}
                      </span>
                    )}
                    {/* 🥵 gassed pens — yesterday's reliever workload, per side.
                        A tired pen is tonight's late-inning HR window. */}
                    {penApplies && penByAbbr && !final && teams.map((tm) => {
                      const tier = penTier(penByAbbr[tm])
                      if (!tier) return null
                      const t2 = penByAbbr[tm]
                      return (
                        <span
                          key={`pen-${tm}`}
                          title={`${tm} bullpen yesterday: ${t2.used} relievers, ${t2.pitches} pitches — ${t2.names.map((r2) => `${String(r2.name).split(' ').slice(-1)[0]} ${r2.pitches}p`).join(', ')}. Tired relief gives up homers; the late innings are the window.`}
                          style={{ color: tier.col, fontWeight: 900, cursor: 'help' }}
                        >{tier.icon} {tm} {tier.word}</span>
                      )
                    })}
                    {/* 😴 REST & TRAVEL — ONE CHIP (2026-08-09).
                        This used to print a separate chip per team per flag,
                        so a doubleheader between two tired clubs could put
                        four cryptic pills on one small card — and the owner
                        didn't know what "3-in-3" meant, which was fair,
                        because nothing on the card said. Now it's a single
                        count with every flag spelled out in the tooltip, and
                        restTravel.js states each one in plain words. */}
                    {restByAbbr && !final && (() => {
                      const list = []
                      teams.forEach((tm) => (restByAbbr[tm] || []).forEach((f) => list.push({ tm, ...f })))
                      if (!list.length) return null
                      const tip = 'REST & TRAVEL — schedule facts for tonight. Context only; none of this touches a score.\n\n'
                        + list.map((f) => `${f.icon} ${f.tm} · ${f.label}\n${f.title}`).join('\n\n')
                      return (
                        <span
                          title={tip}
                          style={{
                            color: '#a1a1aa', fontWeight: 800, cursor: 'help',
                            border: '1px solid rgba(255,255,255,.13)', borderRadius: 999,
                            padding: '0px 6px', background: 'rgba(255,255,255,.04)',
                          }}
                        >
                          😴 {list.length} rest flag{list.length === 1 ? '' : 's'}
                        </span>
                      )
                    })()}
                    {/* 🌇 twilight cooling — directional physics, no invented
                        forecast: external weather APIs failed verification, so
                        this says WHICH WAY the air moves, not a made-up number. */}
                    {(() => {
                      if (final || live || bad) return null
                      if (/dome|closed/i.test(g.roof)) return null
                      if (!(g.temp >= 75) || !g.time) return null
                      const h = new Date(g.time).getHours()
                      if (Number.isNaN(h) || h < 16) return null
                      return (
                        <span title="Warm evening start in an open-air park: the air cools and thickens as the game goes — carry favors the EARLY innings tonight. Directional read, not a forecast number." style={{ color: '#fbbf24', cursor: 'help' }}>
                          🌇 cools late
                        </span>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* threats as clean pills — the 💪 read as clip-art (Donovan).
                  Top-3 parks get a matchup hook instead: THE bat vs THE arm,
                  which is the sentence you'd actually say out loud.

                  ── THE PILL NO LONGER WEARS THE PARK'S COLOUR (2026-08-22).
                  These print `longest_hr_score`, a property of the HITTER, and
                  used to paint it in `band.col`, a property of the BUILDING.
                  So an 81 in a cold park was drawn ice-blue and a 45 in a
                  launch pad was drawn burning orange — the colour said one
                  thing and the number beside it said another. That is the
                  purest form of "colour as decoration" in the audit and it
                  was actively misleading. The score now wears its own value on
                  the sequential ramp, against tonight's threat range; only the
                  pill's border still borrows the card's band, because the
                  border is chrome and the number is data. */}
              {g.threats.length > 0 && (isTop ? (
                <div style={{ marginTop: 5, borderTop: `1px solid ${band.col}22`, paddingTop: 4 }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); onPlayerClick?.(g.threats[0]) }}
                    style={{ fontSize: 10, fontWeight: 800, color: C.text, cursor: 'pointer' }}
                  >
                    {surname(nameOf(g.threats[0]))}
                    <b style={{ fontFamily: NUM_FONT, color: seqChip(n(g.threats[0]?.longest_hr_score, 0), SEQ_AUTO, threatRange) || C.text2 }}> {n(g.threats[0]?.longest_hr_score, 0).toFixed(0)}</b>
                    <span style={{ color: C.text3, fontWeight: 600 }}> vs {surname(clean(g.threats[0]?.pitcher_name, 'TBD'))}</span>
                  </span>
                  {g.threats[1] && (
                    <span
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(g.threats[1]) }}
                      style={{ fontSize: 9, color: C.text3, cursor: 'pointer', marginLeft: 8 }}
                    >
                      + {surname(nameOf(g.threats[1]))} <b style={{ fontFamily: NUM_FONT, color: seqChip(n(g.threats[1]?.longest_hr_score, 0), SEQ_AUTO, threatRange) || C.text2 }}>{n(g.threats[1]?.longest_hr_score, 0).toFixed(0)}</b>
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', borderTop: `1px solid ${band.col}22`, paddingTop: 4 }}>
                  {g.threats.map((p) => (
                    <span
                      key={p?.player_id || nameOf(p)}
                      onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                      title={`Biggest distance threat in this building tonight — longest-HR score ${n(p?.longest_hr_score, 0).toFixed(0)}`}
                      style={{
                        fontSize: 8.5, fontWeight: 700, color: C.text2, cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${band.col}30`, borderRadius: 999, padding: '1px 7px',
                        background: `${band.col}0a`,
                      }}
                    >
                      {surname(nameOf(p))} <b style={{ fontFamily: NUM_FONT, color: seqChip(n(p?.longest_hr_score, 0), SEQ_AUTO, threatRange) || C.text2 }}>{n(p?.longest_hr_score, 0).toFixed(0)}</b>
                    </span>
                  ))}
                </div>
              ))}

              {/* 🏟 house history — tonight's bats who have actually homered
                  in THIS building (bot context pack, venue-ID matched).
                  ▲ marks a hitter whose rate here beats his own overall
                  rate by 25%+ on 8+ games — the park likes him back. */}
              {packApplies && (() => {
                const vets = g.bats
                  .map((p) => ({ p, vh: housePack.players?.[String(p?.player_id)]?.venue_hr }))
                  .filter((x) => x.vh && x.vh.hr >= 2)
                  .sort((a, b) => b.vh.hr - a.vh.hr)
                  .slice(0, 3)
                if (!vets.length) return null
                return (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginTop: 4, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 8.5 }}>
                    <span style={{ color: C.text3, fontWeight: 800, letterSpacing: '.05em' }}>🏟</span>
                    {vets.map(({ p, vh }) => {
                      const up = vh.games >= 8 && vh.vs_self != null && vh.vs_self >= 1.25
                      return (
                        <span
                          key={p?.player_id}
                          onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }}
                          title={`${nameOf(p)} in this building, ${vh.seasons}: ${vh.hr} HR in ${vh.games} games${vh.vs_self != null ? ` — ${(vh.vs_self).toFixed(2)}× his overall HR rate` : ''}${up ? '. The park plays UP for him.' : ''}`}
                          style={{ color: up ? C.orange : C.text2, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {surname(nameOf(p))} <b>{vh.hr}</b><span style={{ color: C.text3, fontWeight: 500 }}>/{vh.games}g</span>{up ? '▲' : ''}
                        </span>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
      {/* the other N parks are a tap away, not gone — matches the "rest are
          a tap away" call in the DEFAULT_SHOWN comment above */}
      {!showAllParks && parks.length > DEFAULT_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAllParks(true)}
          style={{
            display: 'block', width: '100%', marginTop: 9, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, color: C.text2, fontFamily: NUM_FONT,
            background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 10,
            padding: '7px 10px', letterSpacing: '.02em',
          }}
        >
          Show all {parks.length} parks ▾
        </button>
      )}
    </div>
  )

  if (!fold) return body
  return (
    <MobileFold title="🏟 Tonight's parks" summary={foldSummary} count={parks.length}>
      {body}
    </MobileFold>
  )
}
