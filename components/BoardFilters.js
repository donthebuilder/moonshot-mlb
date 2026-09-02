'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, clean, hrScore, hitScore, prodScore, tbScore } from '../lib/player'
import { isAligned } from '../lib/scoring'
import { STATE, alpha } from '../lib/scales'

// Shared filter bar for the ranked boards.
//
// The boards were a fixed top-N of one score and nothing else, so they showed
// the same faces every night — which is the complaint. Everything here narrows
// the pool BEFORE the ranking, so a filtered board surfaces hitters the
// unfiltered one buries rather than just hiding rows off the bottom.
//
// Every field used is verified on the live slate:
//   hrw_score            143/143      recent_ev            143/143
//   weak_spot_flag       present      pitch_type_match_score present
//   recent_ideal_hr_contact 143/143   pitcher_hr9          143/143
//   bats                 143/143      season_pa            143/143
//   game_pk / game_time  143/143 (used for the Game / Game time filters below)
//
// ── PHASE 1 PRODUCT PASS (2026-08-21) ───────────────────────────────────────
// Added: a Score filter scoped to whichever board is actually open (HR board
// filters by hr_score, Hit board by hit_score, etc. — "intuitive for the
// currently selected board"), Game + Game-time filters (both real fields,
// nothing fabricated), a removable active-filter chip row, and a compact
// "Filters" trigger + panel so this stops being a permanent, ever-expanded
// bar — the desktop version was already wide; on a phone it consumed most of
// the screen before a single ranked row was visible.
//
// Explicitly NOT added: Team (already exists, site-wide, via the header's own
// team dropdown — a second one here would just be a second control doing the
// same job) and Active/Injured status (no such field exists anywhere in the
// payload — see lib/player.js; a fabricated filter is worse than no filter).

export const CATEGORIES = [
  { key: 'weak',    label: '★ Weak spot',   test: (p) => p?.weak_spot_flag === true },
  { key: 'edge',    label: '🎯 Pitch edge',  test: (p) => n(p?.pitch_type_match_score, 0) > 0 },
  { key: 'aligned', label: '◆ Aligned',     test: (p) => isAligned(p) },
  { key: 'hot',     label: 'L5 HR',       test: (p) => n(p?.last5_hr, 0) > 0 },
  { key: 'due',     label: '⏳ Due tag',     test: (p) => /due/i.test(clean(p?.hr_due_tag, '')) },
  { key: 'softarm', label: '💣 Arm ≥1.4',    test: (p) => n(p?.pitcher_hr9, 0) >= 1.4 },
  { key: 'confirmed', label: '✓ Lineup set', test: (p) => p?.lineup_confirmed === true },
]

const HAND = [
  { key: 'all', label: 'All bats' },
  { key: 'L',   label: 'LHB' },
  { key: 'R',   label: 'RHB' },
]

// The band slider used to be welded to HRW. Now the same two thumbs work any
// stat we track — pick the lens, keep the motion. Every field verified in the
// live _slim payload 2026-08-05 (recent_* rates and season_iso, full coverage).
// Rates are ×100 so the slider reads as a percentage; ISO is ×1000 (a .180
// hitter sits at 180) because a 0–0.4 slider with step 1 can't move.
export const BAND_STATS = [
  { key: 'hrw',   label: 'HRW',    min: 0, max: 100, get: (p) => n(p?.hrw_score, 0) },
  { key: 'pull',  label: 'Pull%',  min: 0, max: 100, get: (p) => n(p?.recent_pull_rate, 0) * 100 },
  { key: 'pullair', label: 'PullAir%', min: 0, max: 100, get: (p) => n(p?.recent_pull_air_rate, 0) * 100 },
  { key: 'air',   label: 'Air%',   min: 0, max: 100, get: (p) => n(p?.l25pa_air_rate, 0) * 100 },
  { key: 'hh',    label: 'HH%',    min: 0, max: 100, get: (p) => n(p?.recent_hard_hit_rate, 0) * 100 },
  { key: 'fb',    label: 'FB%',    min: 0, max: 100, get: (p) => n(p?.recent_fb_rate, 0) * 100 },
  // Added 2026-08-12, on request. Same recent window as fb/pull above --
  // the bot already computed it for bbe_profile, just never promoted it to
  // a top-level HitterRecord field until now (mlb_dashboard.py, same date).
  { key: 'ld',    label: 'LD%',    min: 0, max: 100, get: (p) => n(p?.recent_ld_rate, 0) * 100 },
  // The other two thirds of the same recent window (2026-09-01, Donovan
  // picked "both" off the walks shortlist). GB% is the one to filter DOWN on
  // for power -- a ground ball never leaves the yard -- and popup% is the
  // quiet way a hot hitter is actually mis-hitting. Both published on every
  // row since 08-12 with nowhere to look at them until now.
  { key: 'gb',    label: 'GB%',    min: 0, max: 100, get: (p) => n(p?.recent_gb_rate, 0) * 100 },
  { key: 'popup', label: 'Popup%', min: 0, max: 60,  get: (p) => n(p?.recent_popup_rate, 0) * 100 },
  { key: 'brl',   label: 'Brl%',   min: 0, max: 40,  get: (p) => n(p?.recent_barrel_rate, 0) * 100 },
  { key: 'sweet', label: 'Sweet%', min: 0, max: 100, get: (p) => n(p?.recent_sweet_spot_rate, 0) * 100 },
  { key: 'squp',  label: 'SqUp%',  min: 0, max: 100, get: (p) => n(p?.recent_squared_up_rate, 0) * 100 },
  { key: 'blast', label: 'Blast%', min: 0, max: 100, get: (p) => n(p?.recent_blast_rate, 0) * 100 },
  { key: 'avgdist', label: 'AvgDist', min: 0, max: 450, get: (p) => n(p?.recent_avg_distance ?? p?.bbe_profile?.avg_distance, 0) },
  { key: 'iso',   label: 'ISO',    min: 0, max: 400, get: (p) => n(p?.season_iso, 0) * 1000, fmt: (v) => `.${String(v).padStart(3, '0')}` },
]

// Which score a "Score" filter should read for the board currently open —
// same mapping lib/scoring.js's scoreFor() uses to RANK each board, so the
// filter and the sort it's narrowing agree about what "the score" means.
const SCORE_FOR_TYPE = {
  top:     { label: 'Top Score', get: (p) => n(p?.top_board_score_v2 ?? p?.overall_score, 0) },
  hr:      { label: 'HR Score',  get: (p) => hrScore(p) },
  hit:     { label: 'Hit Score', get: (p) => hitScore(p) },
  hrr:     { label: 'HRR Score', get: (p) => prodScore(p) },
  contact: { label: 'Contact Score', get: (p) => tbScore(p) },
  tb:      { label: 'Contact Score', get: (p) => tbScore(p) },
}

const TIME_WINDOWS = [
  { key: 'all',   label: 'Any time' },
  { key: 'early', label: 'Early (before 5pm)' },
  { key: 'prime', label: 'Prime (5–8pm)' },
  { key: 'late',  label: 'Late (after 8pm)' },
]
function gameHour(p) {
  const t = p?.game_time
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.getHours()
}
function inWindow(hour, w) {
  if (w === 'all' || hour === null) return true
  if (w === 'early') return hour < 17
  if (w === 'prime') return hour >= 17 && hour < 20
  if (w === 'late') return hour >= 20
  return true
}

// One row per game_pk, built off whatever pool is passed in (the FULL board
// pool, not the already-filtered one — narrowing games shouldn't narrow which
// games are choosable). Label is honest about what the data actually
// confirms: two team codes joined, no assumed home/away order.
function gamesOf(players) {
  const by = new Map()
  for (const p of players) {
    const pk = clean(p?.game_pk, '')
    if (!pk) continue
    if (!by.has(pk)) by.set(pk, { pk, teams: new Set(), time: p?.game_time || null })
    const g = by.get(pk)
    const t = teamOf(p); if (t) g.teams.add(t)
    const o = oppOf(p); if (o) g.teams.add(o)
    if (!g.time && p?.game_time) g.time = p.game_time
  }
  return [...by.values()]
    .map((g) => ({
      pk: g.pk,
      label: [...g.teams].slice(0, 2).join(' vs ') || `Game ${g.pk}`,
      time: g.time,
    }))
    .sort((a, b) => (a.time && b.time ? new Date(a.time) - new Date(b.time) : 0))
}

// scoreType: one of SCORE_FOR_TYPE's keys, or null/undefined when the board
// open isn't a single-score ranking (the weak-spot / aligned / matchup-edge
// signal sections) — the Score slider simply doesn't render in that case
// rather than guessing which of several scores it should mean.
export function useBoardFilter(players, scoreType = null) {
  const [bandStat, setBandStatRaw] = useState('hrw')
  const [hrwMin, setHrwMin] = useState(0)
  const [hrwMax, setHrwMax] = useState(100)
  // Switching the lens resets the thumbs to that stat's full range — a 60–100
  // HRW band means nothing in Brl% units.
  const setBandStat = (k) => {
    const s = BAND_STATS.find((x) => x.key === k) || BAND_STATS[0]
    setBandStatRaw(s.key); setHrwMin(s.min); setHrwMax(s.max)
  }
  const [scoreMin, setScoreMin] = useState(0)
  const [scoreMax, setScoreMax] = useState(100)
  const [cats, setCats] = useState([])
  const [catMode, setCatMode] = useState('any')   // any | all
  const [hand, setHand] = useState('all')
  const [minEV, setMinEV] = useState(0)
  const [minPA, setMinPA] = useState(0)
  const [query, setQuery] = useState('')
  const [gameSel, setGameSel] = useState([])       // selected game_pks, [] = all
  const [timeWindow, setTimeWindow] = useState('all')

  const games = useMemo(() => gamesOf(players), [players])
  const scoreDef = scoreType ? SCORE_FOR_TYPE[scoreType] : null

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const stat = BAND_STATS.find((x) => x.key === bandStat) || BAND_STATS[0]
    return players.filter((p) => {
      const v = stat.get(p)
      if (v < hrwMin || v > hrwMax) return false
      if (scoreDef && (scoreMin > 0 || scoreMax < 100)) {
        const sv = scoreDef.get(p)
        if (sv < scoreMin || sv > scoreMax) return false
      }
      if (hand !== 'all' && clean(p?.bats, '').toUpperCase().slice(0, 1) !== hand) return false
      if (minEV > 0 && n(p?.recent_ev, 0) < minEV) return false
      if (minPA > 0 && n(p?.season_pa, 0) < minPA) return false
      if (gameSel.length && !gameSel.includes(clean(p?.game_pk, ''))) return false
      if (timeWindow !== 'all' && !inWindow(gameHour(p), timeWindow)) return false
      if (cats.length) {
        const tests = CATEGORIES.filter((c) => cats.includes(c.key))
        const hits = tests.filter((c) => c.test(p)).length
        // "any" is a union — widen the net. "all" is an intersection — the
        // hitters that clear every box, usually a very short list.
        if (catMode === 'all' ? hits < tests.length : hits === 0) return false
      }
      if (q && !`${nameOf(p)} ${teamOf(p)} ${oppOf(p)} ${clean(p?.pitcher_name, '')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, bandStat, hrwMin, hrwMax, scoreDef, scoreMin, scoreMax, cats, catMode, hand, minEV, minPA, query, gameSel, timeWindow])

  const statDef = BAND_STATS.find((x) => x.key === bandStat) || BAND_STATS[0]
  const bandActive = bandStat !== 'hrw' || hrwMin > statDef.min || hrwMax < statDef.max
  const scoreActive = !!scoreDef && (scoreMin > 0 || scoreMax < 100)
  const active = bandActive || scoreActive
    || cats.length > 0 || hand !== 'all' || minEV > 0 || minPA > 0 || query
    || gameSel.length > 0 || timeWindow !== 'all'
  const reset = () => {
    setBandStatRaw('hrw'); setHrwMin(0); setHrwMax(100)
    setScoreMin(0); setScoreMax(100)
    setCats([]); setCatMode('any')
    setHand('all'); setMinEV(0); setMinPA(0); setQuery('')
    setGameSel([]); setTimeWindow('all')
  }

  // One entry per active dimension, each independently removable — this is
  // what renders as the chip row so a filter is visible and undoable without
  // opening the panel or nuking every other filter with Reset.
  const chipOf = (gpk) => games.find((g) => g.pk === gpk)
  const activeFilters = useMemo(() => {
    const out = []
    if (scoreActive) out.push({ key: 'score', label: `${scoreDef.label} ${scoreMin}–${scoreMax}`, onRemove: () => { setScoreMin(0); setScoreMax(100) } })
    if (bandActive) out.push({ key: 'band', label: `${statDef.label} ${statDef.fmt ? statDef.fmt(hrwMin) : hrwMin}–${statDef.fmt ? statDef.fmt(hrwMax) : hrwMax}`, onRemove: () => { setHrwMin(statDef.min); setHrwMax(statDef.max) } })
    if (hand !== 'all') out.push({ key: 'hand', label: HAND.find((h) => h.key === hand)?.label || hand, onRemove: () => setHand('all') })
    if (minEV > 0) out.push({ key: 'ev', label: `EV ≥ ${minEV}`, onRemove: () => setMinEV(0) })
    if (minPA > 0) out.push({ key: 'pa', label: `PA ≥ ${minPA}`, onRemove: () => setMinPA(0) })
    cats.forEach((k) => {
      const c = CATEGORIES.find((x) => x.key === k)
      if (c) out.push({ key: `cat-${k}`, label: c.label, onRemove: () => setCats((cs) => cs.filter((x) => x !== k)) })
    })
    gameSel.forEach((gpk) => {
      const g = chipOf(gpk)
      out.push({ key: `game-${gpk}`, label: g ? g.label : `Game ${gpk}`, onRemove: () => setGameSel((gs) => gs.filter((x) => x !== gpk)) })
    })
    if (timeWindow !== 'all') out.push({ key: 'time', label: TIME_WINDOWS.find((w) => w.key === timeWindow)?.label, onRemove: () => setTimeWindow('all') })
    if (query) out.push({ key: 'q', label: `“${query}”`, onRemove: () => setQuery('') })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreActive, scoreDef, scoreMin, scoreMax, bandActive, statDef, hrwMin, hrwMax, hand, minEV, minPA, cats, gameSel, timeWindow, query, games])

  const state = {
    bandStat, setBandStat, hrwMin, setHrwMin, hrwMax, setHrwMax, cats, setCats, catMode, setCatMode,
    hand, setHand, minEV, setMinEV, minPA, setMinPA, query, setQuery, active, reset,
    scoreDef, scoreMin, setScoreMin, scoreMax, setScoreMax,
    games, gameSel, setGameSel, timeWindow, setTimeWindow,
    activeFilters, activeCount: activeFilters.length,
  }
  return { filtered, state }
}

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const lbl = () => ({ fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 })
// UNIVERSAL FILTER RECIPE (2026-08-23). This was one of the five chip()
// factories the survey found, radius 7 with ember's orange baked into a
// `${col}20` tint — on light/mono/steel/regal the "active" tint was simply
// the wrong colour. It now resolves through STATE.on()/off() and alpha()
// like components/Filters.js: a filter is STATE, drawn in the theme accent,
// never in a data hue. The col parameter is kept for its call sites and
// deliberately ignored — the cyan game/time chips were wearing a data hue
// for what is a selection.
const chip = (on) => {
  const s = on ? STATE.on() : STATE.off()
  return {
    padding: '4px 11px', fontSize: 11, fontWeight: s.fontWeight, borderRadius: 999,
    cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${s.borderColor}`,
    background: on ? alpha(s.color, 0.14) : 'transparent',
    color: s.color,
  }
}

// Compact trigger + panel, same mechanism PaletteButton already uses site-
// wide (fixed-position panel, pinned to the viewport edges rather than the
// button, so it never hangs off-screen on a phone) — reused rather than
// invented, so this doesn't become a second "how do panels work here" idiom.
function useOutsideClose(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])
  return ref
}

export default function BoardFilters({ state, total, shown }) {
  const {
    bandStat, setBandStat, hrwMin, setHrwMin, hrwMax, setHrwMax, cats, setCats, catMode, setCatMode,
    hand, setHand, minEV, setMinEV, minPA, setMinPA, query, setQuery, active, reset,
    scoreDef, scoreMin, setScoreMin, scoreMax, setScoreMax,
    games, gameSel, setGameSel, timeWindow, setTimeWindow,
    activeFilters, activeCount,
  } = state
  const stat = BAND_STATS.find((x) => x.key === bandStat) || BAND_STATS[0]
  const showV = (v) => (stat.fmt ? stat.fmt(v) : v)
  const [open, setOpen] = useState(false)
  const wrap = useOutsideClose(open, setOpen)

  const toggleCat = (k) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
  const toggleGame = (pk) => setGameSel((g) => (g.includes(pk) ? g.filter((x) => x !== pk) : [...g, pk]))

  return (
    <div className="board-filters" style={{ marginBottom: 14 }}>
      {/* ── THE TRIGGER, ALWAYS COMPACT ─────────────────────────────────────
          One button + a count, same size on a phone as on a desktop monitor —
          "avoid a giant filter bar" applies to both, not just mobile. The
          panel below is what used to be permanently on screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div ref={wrap} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${open || active ? C.orange : C.border}`,
              background: open ? C.bg3 : active ? alpha(STATE.on().color, 0.08) : 'transparent',
              color: active ? C.orange : C.text2, fontSize: 11.5, fontWeight: 800, fontFamily: NUM_FONT,
            }}
          >
            ▤ Filters
            {activeCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                background: C.orange, color: '#1a0f00', fontSize: 10, fontWeight: 900,
              }}>{activeCount}</span>
            )}
          </button>

          {open && (
            <div style={{
              // Fixed to the viewport, pinned to both edges below ~560px —
              // exactly PaletteButton's dual-mode panel, same reasoning: a
              // popover anchored to a button that can sit anywhere on a
              // 390px screen has nowhere safe to overflow.
              position: 'fixed', zIndex: 90,
              top: 'calc(env(safe-area-inset-top, 0px) + 108px)',
              left: 8, right: 8, width: 'auto', maxWidth: 520, margin: '0 auto',
              maxHeight: '72vh', overflowY: 'auto',
              background: 'rgba(17,17,19,0.98)', backdropFilter: 'blur(14px)',
              border: `1px solid ${C.border2}`, borderRadius: 12, padding: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            }}>
              {scoreDef && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...lbl(), color: C.orange }}>Score · {scoreDef.label}</div>
                  <div style={{ fontSize: 12, fontFamily: NUM_FONT, color: C.text, marginTop: 2 }}>{scoreMin}–{scoreMax}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                    <input type="range" min={0} max={100} step={1} value={scoreMin}
                      onChange={(e) => setScoreMin(Math.min(Number(e.target.value), scoreMax))}
                      style={{ flex: 1, accentColor: C.orange }} />
                    <input type="range" min={0} max={100} step={1} value={scoreMax}
                      onChange={(e) => setScoreMax(Math.max(Number(e.target.value), scoreMin))}
                      style={{ flex: 1, accentColor: C.orange }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={lbl()}>Band</span>
                  {BAND_STATS.map((s) => (
                    <button key={s.key} onClick={() => setBandStat(s.key)}
                      style={{ ...chip(bandStat === s.key), padding: '2px 6px', fontSize: 9 }}>{s.label}</button>
                  ))}
                </div>
                <div style={{ ...lbl(), marginTop: 4, fontSize: 12, color: C.orange, fontFamily: NUM_FONT }}>
                  {stat.label} {showV(hrwMin)}–{showV(hrwMax)}
                  {bandStat !== 'hrw' && <span style={{ textTransform: 'none', letterSpacing: 0 }}> · {bandStat === 'iso' ? 'season' : 'recent window'}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                  <input type="range" min={stat.min} max={stat.max} step={1} value={hrwMin}
                    onChange={(e) => setHrwMin(Math.min(Number(e.target.value), hrwMax))}
                    style={{ flex: 1, accentColor: C.orange }} />
                  <input type="range" min={stat.min} max={stat.max} step={1} value={hrwMax}
                    onChange={(e) => setHrwMax(Math.max(Number(e.target.value), hrwMin))}
                    style={{ flex: 1, accentColor: C.orange }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={lbl()}>Bats</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                    {HAND.map((h) => (
                      <button key={h.key} onClick={() => setHand(h.key)} style={chip(hand === h.key)}>{h.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth: 130 }}>
                  <div style={lbl()}>Min recent EV {minEV || '—'}</div>
                  <input type="range" min={0} max={100} step={1} value={minEV}
                    onChange={(e) => setMinEV(Number(e.target.value))}
                    style={{ width: '100%', accentColor: C.orange }} />
                </div>
                <div style={{ minWidth: 120 }}>
                  <div style={lbl()}>Min season PA {minPA || '—'}</div>
                  <input type="range" min={0} max={600} step={10} value={minPA}
                    onChange={(e) => setMinPA(Number(e.target.value))}
                    style={{ width: '100%', accentColor: C.orange }} />
                </div>
              </div>

              {/* GAME + GAME TIME — real fields (game_pk, game_time), nothing
                  inferred. Team is deliberately not repeated here — the
                  header's own team dropdown already does that job site-wide. */}
              {games.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={lbl()}>Game</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {games.map((g) => (
                      <button key={g.pk} onClick={() => toggleGame(g.pk)} style={chip(gameSel.includes(g.pk), C.cyan)}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={lbl()}>Game time</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                  {TIME_WINDOWS.map((w) => (
                    <button key={w.key} onClick={() => setTimeWindow(w.key)} style={chip(timeWindow === w.key, C.cyan)}>{w.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={lbl()}>Categories</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
                  {CATEGORIES.map((c) => (
                    <button key={c.key} onClick={() => toggleCat(c.key)} style={chip(cats.includes(c.key))}>{c.label}</button>
                  ))}
                  {cats.length > 1 && (
                    <button onClick={() => setCatMode((m) => (m === 'any' ? 'all' : 'any'))}
                      title="Any = a hitter clearing at least one box. All = clearing every box."
                      style={chip(true, catMode === 'all' ? '#FCD34D' : C.orange)}>
                      match {catMode === 'all' ? 'ALL' : 'ANY'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div style={lbl()}>Search</div>
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="name, team, pitcher…"
                  style={{
                    width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7,
                    padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: NUM_FONT,
                    marginTop: 3, boxSizing: 'border-box',
                  }} />
              </div>

              {shown === 0 && (
                <div style={{ fontSize: 10, color: C.orange, marginTop: 9 }}>
                  Nothing clears this filter. With <b>match ALL</b> that happens fast — the categories are
                  rarer than they look, and requiring three at once usually leaves nobody.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: shown < total ? C.orange : C.text3, fontFamily: NUM_FONT }}>{shown} of {total}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {active && <button onClick={reset} style={{ ...chip(false), border: `1px dashed ${C.border2}` }}>Reset all</button>}
                  <button onClick={() => setOpen(false)} style={chip(true, C.orange)}>Done</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <span style={{ fontSize: 11, fontWeight: 800, color: shown < total ? C.orange : C.text3, fontFamily: NUM_FONT, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 11px' }}>
          {shown} of {total}
        </span>

        {/* ── ALWAYS-VISIBLE, REMOVABLE CHIPS ─────────────────────────────
            The point of a compact trigger is that the filters themselves
            can't disappear WITH the bar — a filter you forgot you set is a
            worse trap than a filter you have to scroll past. */}
        {activeFilters.length > 0 && (
          <div className="chip-row" style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {activeFilters.map((f) => (
              <button key={f.key} onClick={f.onRemove} title="Remove this filter"
                style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {f.label} <span style={{ opacity: .7 }}>✕</span>
              </button>
            ))}
            <button onClick={reset} style={{ ...chip(false), border: 'none', textDecoration: 'underline', color: C.text3 }}>Reset</button>
          </div>
        )}
      </div>
    </div>
  )
}
