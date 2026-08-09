'use client'
import { createContext, useContext, useMemo } from 'react'

// 📊 STAT-FIRST — the raw numbers, in front of the bot's number.
//
// 2026-08-09, Donovan, after a tour of the two sites people keep saying are
// easier to read than ours: "maybe we lead with stat rather than the bot
// scoring on the charts... try and make any update that will bring us closer,
// don't lose the plot."
//
// WHAT THE COMPETITORS ACTUALLY DO. Neither of them is smarter than us. Both
// of them are LEGIBLE, and in the same way: under every name sits a short row
// of REAL STATS — barrel rate, HR/FB, park, the arm's ERA — each one coloured
// green or red for whether it helps this bat tonight. You know what you're
// looking at without being taught anything. Our cards led with a 0–100 score
// the reader has no independent handle on, then buried "BA · HR · K" in grey
// underneath — three season stats that are the same three for a leadoff
// slap hitter and a 40-homer bat.
//
// WHAT WE DON'T COPY (the plot). No odds, no implied probability, no payout.
// That's still the differentiator. And the bot score does not disappear — it
// stops being the headline and becomes the badge beside it. This module only
// changes which number your eye lands on first.
//
// HOW THE COLOUR IS EARNED. Green is not a claim about league average — we
// don't publish a league baseline and I won't invent one. Every stat is
// ranked against THE REST OF TONIGHT'S SLATE and the tertiles come from that
// distribution. So green means "top third of the bats playing tonight" and
// every tooltip says exactly that. If a slate is thin, the cutoffs move with
// it, which is the honest behaviour.
//
// FIELD VERIFICATION (the verify-first rule). Every key below was read out of
// a live today_slim.json payload before this file was written, with its units
// checked: the rate fields are 0–1 fractions (l20pa_barrel_rate 0.0625),
// l25pa_avg_ev is mph (82.58), park_hr_factor is a multiplier (1.04). A stat
// whose field is missing or null renders nothing — no zero, no dash-filler.

const num = (v) => {
  const f = Number(v)
  return Number.isFinite(f) ? f : null
}
// first field that actually carries a number, in preference order
const firstOf = (p, keys) => {
  for (const k of keys) {
    const v = num(p?.[k])
    if (v != null) return v
  }
  return null
}

const pctFmt = (d = 0) => (v) => `${(v * 100).toFixed(d)}%`
const fixFmt = (d) => (v) => v.toFixed(d)
const isoFmt = (v) => v.toFixed(3).replace(/^0/, '')
const parkFmt = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`

// ── the stat vocabulary ──────────────────────────────────────────────────────
// id      stable key for the slate-scale cache
// label   what the chip says — short enough for a 165px phone column
// get     how to read it, with fallbacks, verified against the live payload
// better  which direction helps the bat tonight (drives the colour, not the sort)
// title   the hover, in plain words. A stat nobody can define is decoration.
export const STATS = {
  barrel: {
    id: 'barrel', label: 'Barrel',
    get: (p) => firstOf(p, ['l20pa_barrel_rate', 'recent_barrel_rate', 'l10_barrel_rate', 'l5_barrel_rate']),
    fmt: pctFmt(1), better: 'high',
    title: 'Barrel rate — the share of his batted balls hit at the exit velocity and launch angle that produce home runs. His last 20 plate appearances.',
  },
  iso: {
    id: 'iso', label: 'ISO',
    get: (p) => num(p?.season_iso),
    fmt: isoFmt, better: 'high',
    title: 'Isolated power — slugging minus batting average. What is left when you take the singles out. Season.',
  },
  hardhit: {
    id: 'hardhit', label: 'Hard hit',
    get: (p) => firstOf(p, ['l20pa_hard_hit_rate', 'recent_hard_hit_rate', 'l10_hard_hit_rate']),
    fmt: pctFmt(0), better: 'high',
    title: 'Hard-hit rate — share of batted balls at 95 mph or more. Recent window.',
  },
  fb: {
    id: 'fb', label: 'Fly ball',
    get: (p) => firstOf(p, ['l20pa_fb_rate', 'recent_fb_rate', 'l25pa_fb_rate']),
    fmt: pctFmt(0), better: 'high',
    title: 'Fly-ball rate — a ball on the ground cannot leave the yard, so this is the ticket price for a homer. Recent window.',
  },
  ev: {
    id: 'ev', label: 'Exit velo',
    get: (p) => num(p?.l25pa_avg_ev),
    fmt: (v) => `${v.toFixed(1)}`, better: 'high',
    title: 'Average exit velocity, mph, over his last 25 plate appearances.',
  },
  xwoba: {
    id: 'xwoba', label: 'xwOBA',
    get: (p) => firstOf(p, ['l20pa_xwoba', 'recent_xwoba', 'l10_xwoba']),
    fmt: isoFmt, better: 'high',
    title: 'Expected wOBA — what his contact quality alone says he should be producing, before luck and defense. Recent window.',
  },
  pull: {
    id: 'pull', label: 'Pull',
    get: (p) => firstOf(p, ['l20pa_pull_rate', 'recent_pull_rate', 'l10_pull_rate']),
    fmt: pctFmt(0), better: 'high',
    title: 'Pull rate — share of batted balls to his pull side, where the fence is usually shortest. Recent window.',
  },
  ld: {
    id: 'ld', label: 'Line drive',
    get: (p) => num(p?.l25pa_ld_rate),
    fmt: pctFmt(0), better: 'high',
    title: 'Line-drive rate over his last 25 plate appearances — the batted-ball type that falls for hits most often.',
  },
  avg10: {
    id: 'avg10', label: 'L10 BA',
    get: (p) => num(p?.last10_avg),
    fmt: isoFmt, better: 'high',
    title: 'Batting average over his last 10 games.',
  },
  avgHand: {
    id: 'avgHand', label: 'BA vs arm',
    get: (p) => {
      const t = String(p?.pitcher_throws || '').toUpperCase()
      if (t.startsWith('L')) return num(p?.avg_vs_lhp)
      if (t.startsWith('R')) return num(p?.avg_vs_rhp)
      return null
    },
    fmt: isoFmt, better: 'high',
    title: 'His season batting average against this hand of pitcher.',
  },
  isoHand: {
    id: 'isoHand', label: 'ISO vs arm',
    get: (p) => {
      const t = String(p?.pitcher_throws || '').toUpperCase()
      if (t.startsWith('L')) return num(p?.iso_vs_lhp)
      if (t.startsWith('R')) return num(p?.iso_vs_rhp)
      return null
    },
    fmt: isoFmt, better: 'high',
    title: 'His season isolated power against this hand of pitcher.',
  },
  k: {
    id: 'k', label: 'K rate',
    get: (p) => num(p?.season_k_rate),
    fmt: pctFmt(0), better: 'low',
    title: 'His strikeout rate this season. Lower is better for a bat — you cannot homer in the dugout.',
  },
  arm: {
    id: 'arm', label: 'Arm HR/9',
    get: (p) => num(p?.pitcher_hr9),
    fmt: fixFmt(2), better: 'high',
    title: 'Home runs the opposing starter allows per nine innings. Higher favours the bat.',
  },
  armFb: {
    id: 'armFb', label: 'Arm HR/FB',
    get: (p) => num(p?.pitcher_hr_fb_pct),
    fmt: pctFmt(0), better: 'high',
    title: 'Share of fly balls off the opposing starter that leave the yard. Higher favours the bat.',
  },
  armEra: {
    id: 'armEra', label: 'Arm ERA',
    get: (p) => num(p?.pitcher_era),
    fmt: fixFmt(2), better: 'high',
    title: 'The opposing starter’s earned run average. Higher favours the bat.',
  },
  park: {
    id: 'park', label: 'Park',
    get: (p) => num(p?.park_hr_factor),
    fmt: parkFmt, better: 'high',
    title: 'Tonight’s park, as a home-run multiplier against an average yard. +8% means this park has produced 8% more homers than average.',
  },
}

// ── which four stats each market leads with ─────────────────────────────────
// Four, not eight. A row you have to read twice is a row you skip. The rest
// of the numbers are one tap away in his card — this is the hook, not the file.
const MARKET = {
  hr:      ['barrel', 'iso', 'fb', 'arm', 'park', 'ev', 'hardhit', 'armFb'],
  hrr:     ['hardhit', 'xwoba', 'iso', 'ev', 'barrel', 'arm'],
  hit:     ['avg10', 'avgHand', 'ld', 'k', 'xwoba', 'armEra'],
  contact: ['ld', 'k', 'avg10', 'xwoba', 'ev'],
  top:     ['barrel', 'iso', 'avg10', 'arm', 'park', 'xwoba'],
}
const marketKey = (type) => {
  const t = String(type || 'hr').toLowerCase()
  if (t.startsWith('hrr')) return 'hrr'
  if (t.startsWith('hit')) return 'hit'
  if (t.startsWith('con') || t.startsWith('ctg')) return 'contact'
  if (t.startsWith('top') || t.startsWith('ovr')) return 'top'
  return 'hr'
}

/**
 * The stat row for one player in one market.
 *
 * Walks the market's preference list and takes the first `want` stats that
 * ACTUALLY HAVE A VALUE on this row. A bat the bot has no Statcast window for
 * falls back to season shape rather than rendering four em-dashes — and if
 * nothing at all is published, it returns [] and the caller shows nothing.
 */
export function statLineFor(p, type = 'hr', want = 4) {
  const out = []
  for (const id of MARKET[marketKey(type)] || MARKET.hr) {
    if (out.length >= want) break
    const def = STATS[id]
    const v = def?.get?.(p)
    if (v == null) continue
    out.push({ id, label: def.label, value: v, text: def.fmt(v), title: def.title, better: def.better })
  }
  return out
}

/**
 * HR rate over the published windows — the element both competitors lean on
 * hardest and the one thing on their pages I'd have built myself.
 *
 * UNITS ARE NOT MIXED. L5 and L10 are homers per GAME because that is what
 * last5_hr / last10_hr count. Season is homers per PLATE APPEARANCE because
 * that is what season_hr / season_pa give us, and the bot publishes hr_per_pa
 * directly. Each box prints its own denominator so the two are never read as
 * the same number — the competitor tables that stack "L5 20%" over "2026 8%"
 * are quietly comparing per-game to per-PA and nobody notices.
 */
export function hrRateBoxes(p) {
  const boxes = []
  const l5 = num(p?.last5_hr)
  if (l5 != null) boxes.push({ id: 'l5', label: 'L5', num: l5, den: 5, unit: 'G', rate: l5 / 5 })
  const l10 = num(p?.last10_hr)
  if (l10 != null) boxes.push({ id: 'l10', label: 'L10', num: l10, den: 10, unit: 'G', rate: l10 / 10 })
  const hr = num(p?.season_hr)
  const pa = num(p?.season_pa)
  if (hr != null && pa != null && pa > 0) {
    boxes.push({ id: 'szn', label: 'Season', num: hr, den: pa, unit: 'PA', rate: hr / pa })
  }
  return boxes
}

// ── slate-relative colour ────────────────────────────────────────────────────
// Cutoffs are the 33rd and 67th percentile of tonight's slate, per stat.
// Computed once for the whole slate and shared by every card through context,
// so a board with 300 rows does not recompute 300 times.

const ScaleCtx = createContext(null)

function tertiles(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length < 12) return null   // too thin a slate to rank against — stay grey
  const at = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))]
  const lo = at(1 / 3); const hi = at(2 / 3)
  return hi > lo ? { lo, hi, n: v.length } : null
}

export function SlateScaleProvider({ players = [], children }) {
  const scale = useMemo(() => {
    const out = {}
    Object.values(STATS).forEach((def) => {
      out[def.id] = tertiles(players.map((p) => def.get(p)))
    })
    return out
  }, [players])
  return <ScaleCtx.Provider value={scale}>{children}</ScaleCtx.Provider>
}

export const useSlateScale = () => useContext(ScaleCtx)

/**
 * tone: 'good' | 'mid' | 'poor' | null
 * null when we have no slate to rank against — grey, not a guess.
 */
export function toneFor(scale, stat) {
  const band = scale?.[stat.id]
  if (!band) return null
  const good = stat.better === 'low' ? stat.value <= band.lo : stat.value >= band.hi
  const poor = stat.better === 'low' ? stat.value >= band.hi : stat.value <= band.lo
  return good ? 'good' : poor ? 'poor' : 'mid'
}

export const TONE_COLOR = {
  good: '#4ade80',
  mid:  '#a1a1aa',
  poor: '#f87171',
}

export const toneTitle = (tone, scale, stat) => {
  const band = scale?.[stat.id]
  if (!band) return stat.title
  const where = tone === 'good' ? 'top third' : tone === 'poor' ? 'bottom third' : 'middle third'
  return `${stat.title}\n\nGreen/red is ranked against tonight's slate only — this sits in the ${where} of the ${band.n} bats playing today.`
}
