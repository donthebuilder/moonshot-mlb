'use client'
import { useEffect, useMemo, useState } from 'react'

import useScrollLock from '../lib/useScrollLock'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf } from '../lib/player'
import { runningGame, runningGameLine } from '../lib/running'
import { divTone, sampleDim, verdictInk } from '../lib/scales'
import { PillRow } from './Filters'
import VerdictHero from './VerdictHero'
import PitcherTags from './PitcherTags'
import DenseTable from './DenseTable'
import MatchupPitcher from './MatchupPitcher'
import { downloadPitcherCard } from './shareCard'
import PitcherSpots from './PitcherSpots'
import PitcherProfile from './PitcherProfile'
import SituationalSplits from './SituationalSplits'
import PitcherField from './PitcherField'
import SlotDamage from './SlotDamage'
import TeamVsStarter from './TeamVsStarter'
import PitcherRead from './PitcherRead'
import GameLineup from './GameLineup'
import { PitcherSim } from './GameSimulator'

// The pitcher's own modal.
//
// Every board on this site is built around who's on the mound, and until now
// the only way to read a starter was to open a hitter and look at him sideways.
// Clicking a pitcher opens him directly.
//
// The bot never writes a pitcher row. It stamps pitcher fields onto every
// BATTER in the opposing lineup, so any of those rows carries his season line
// and they all agree. `lineup` is that set of hitters; the first row with a
// usable value wins, which is the same trick PitcherProfile and PitcherSpots
// already use. MatchupPitcher then wants one representative hitter for the
// platoon-matched arsenal — it gets the highest-HR-score bat in the lineup, and
// the panel says which side that is so nobody reads a lefty's split as the
// whole staff view.

// AT-A-GLANCE TILE (2026-08-14 upgrade — Donovan: "the pitchers page and
// modal need a full upgrade, bring it up to speed"). Same tile language his
// own hitter page header wears (label above a mono number, border tinted by
// meaning) — orange = good for the BATS facing him, blue = his strength.
function Tile({ label, value, tone, tip }) {
  return (
    <span title={tip} style={{
      display: 'flex', flexDirection: 'column', gap: 1, minWidth: 62, padding: '5px 10px',
      border: `1px solid ${tone === 'hot' ? 'rgba(249,115,22,.5)' : tone === 'cold' ? 'rgba(96,165,250,.45)' : C.border}`,
      background: tone === 'hot' ? 'rgba(249,115,22,.07)' : tone === 'cold' ? 'rgba(96,165,250,.06)' : 'rgba(255,255,255,.02)',
      borderRadius: 8, cursor: tip ? 'inherit' : 'default',
    }}>
      <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 900, fontFamily: NUM_FONT, color: tone === 'hot' ? C.orange : tone === 'cold' ? '#60a5fa' : C.text }}>{value}</span>
    </span>
  )
}

// ══ TWO BANDS, IN ORDER (2026-08-23) ════════════════════════════════════════
//
// Donovan on the pitcher surfaces, three times: "so much reaching, not enough
// give and go info", "i dk what im looking at", "too much on mobile" — and,
// asked whether the arsenal or the splits should lead, "both. want the both to
// look better."
//
// Counted on a 390px render before this: hero, then a blowup panel, then TEN
// tag chips, then EIGHT stat tiles, then ELEVEN split buttons, then FIVE more
// tiles — thirty-four coloured elements before a sentence, and the two tile
// groups are the SAME statistics twice, adjacent, under different colour
// rules. Nothing there is wrong. Nothing there is ordered either, and an
// unordered wall is what "all over the place" means.
//
// So the modal gets the same two named bands the Pitchers page card got, in
// the same order, using the same words:
//
//   WHAT HE GIVES UP   the damage — his season line and his recent contact.
//   WHO GETS HIM       the splits — by hand, by park, by situation.
//
// "Both" is answered by titling each half rather than promoting one: on a
// phone you now read one question, then the other, and the heading tells you
// which one you are in. Nothing was removed — every tile, chip and control
// still renders, in the band it belongs to.
function ModalBand({ title, note, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.11em', color: C.text3,
          fontFamily: NUM_FONT, textTransform: 'uppercase', flexShrink: 0,
        }}>{title}</span>
        {note && (
          <span style={{ fontSize: 9, color: C.text3, minWidth: 0 }}>{note}</span>
        )}
      </div>
      {children}
    </div>
  )
}

const TABS = [
  { key: 'matchup', label: '🥎 Arsenal + damage' },
  { key: 'lineup',  label: '📋 Lineup he faces' },
  { key: 'profile', label: '📊 Command + splits' },
  { key: 'sim',     label: '🎮 Sim' },
]

// ── THE SPLITS, AS A CONTROL (rebuilt 2026-08-23; 08-22 build lost) ─────────
// The 2026-08-17 SplitsGrid answered the complaint it was given (facts were
// scattered over three tabs) and then became the thing Donovan called
// outdated: a 3x6 table at minWidth 460 that scrolls sideways on a phone to
// reach WHIP, read rather than operated. Same facts, as a control: pick a
// split, read it big.
//
// Pills are DATA-GATED — "a dead pill, or one that silently falls back to
// the season line, answers a question it was not asked." Season · vs LHB ·
// vs RHB · Last 3 come from the slate row; In park / Road / Day / Night /
// RISP / Ahead / Behind appear only when the bot publishes
// pitcher_situational_splits (bot commit 1e95c81 — the five axes Donovan
// named on 2026-08-22: in park · day games · RISP · when ahead · calendar).
//
// `Last 3` is the "pitch decline" / "track wear and arm" ask: the bot has
// computed l3_* and fb_velo_delta all along; the modal never showed them.
//
// Colour reads ONE direction end to end — warm = good for the bat — via
// divTone against stated league anchors (HR/9 1.15 ±0.80, WHIP 1.28 ±0.45,
// ERA 4.10 ±2.00), retiring this file's hard-coded red/green pair.
function SplitStat({ label, value, fmt, anchor, ceiling, tip }) {
  const v = value == null ? null : Number(value)
  const d = divTone(v, { anchor, ceiling })
  return (
    <span title={tip} style={{
      display: 'flex', flexDirection: 'column', gap: 1, minWidth: 66,
      padding: '6px 11px', borderRadius: 8, background: d.bg,
      border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 900, fontFamily: NUM_FONT, color: d.fg }}>
        {v == null ? '—' : fmt(v)} <span style={{ fontSize: 9 }}>{d.glyph}</span>
      </span>
    </span>
  )
}

// Bot situational keys → the live StatsAPI sitCode that answers the same
// question, so the picker can always offer the split and simply prefer the
// bot's number when it exists (validated data beats a live pull; a live pull
// beats a dead pill).
const SIT_TO_LIVE = { home: 'h', away: 'a', day: 'd', night: 'n', risp: 'risp', ahead: 'ac', behind: 'bc' }

function SplitsControl({ src, pitcherId }) {
  const num = (k) => { const v = Number(src(k)); return Number.isFinite(v) ? v : null }
  const sit = src('pitcher_situational_splits') || {}
  const f2 = (v) => v.toFixed(2)
  const f0 = (v) => String(Math.round(v))
  const l3n = num('pitcher_l3_starts_found') || 0

  // ── ALL OF THEM (2026-08-29) ─────────────────────────────────────────────
  // Donovan: "where are ALL of them. not just four." The seven situational
  // pills were data-gated on the bot's pitcher_situational_splits, so on a
  // night the bot hadn't published them the picker shrank to Season/LHB/RHB
  // and looked like the site only knew four cuts. The StatsAPI has had every
  // one of these all along — one batched statSplits call per pitcher (see
  // lib/situational.js pitcherSplitBoard, fields verified live 2026-08-29) —
  // so a split the bot hasn't published now falls back to the live number,
  // tagged as live, instead of vanishing. Plus three cuts the bot has never
  // published at all: pitches 1–75 / 76+ (the fatigue window) and the first
  // inning. Bot data still wins whenever it exists.
  const [liveBoard, setLiveBoard] = useState({})
  useEffect(() => {
    if (!pitcherId) return undefined
    let alive = true
    import('../lib/situational')
      .then(({ pitcherSplitBoard }) => pitcherSplitBoard(pitcherId))
      .then((b) => { if (alive) setLiveBoard(b || {}) })
      .catch(() => {})
    return () => { alive = false }
  }, [pitcherId])

  const SIT_LABELS = [
    ['home', 'In park', 'his numbers at home — the "in park" split'],
    ['away', 'Road', 'his numbers on the road'],
    ['day', 'Day', 'day games'],
    ['night', 'Night', 'night games'],
    ['risp', 'RISP', 'with runners in scoring position'],
    ['ahead', 'Ahead', 'when ahead in the count'],
    ['behind', 'Behind', 'when behind in the count — the blowup count state'],
  ]
  const LIVE_ONLY = [
    ['pi000', 'P 1–75', 'his first 75 pitches — live from MLB StatsAPI'],
    ['pi760', 'P 76+', 'pitch 76 on — the fatigue window, the API\'s stand-in for times through the order'],
    ['i01', '1st inn', 'the first inning — some arms bleed before they settle'],
  ]
  const options = [
    { key: 'season', label: 'Season' },
    ...(num('pitcher_hr9_vs_lhb') != null ? [{ key: 'lhb', label: 'vs LHB' }] : []),
    ...(num('pitcher_hr9_vs_rhb') != null ? [{ key: 'rhb', label: 'vs RHB' }] : []),
    ...(l3n > 0 ? [{ key: 'l3', label: `Last ${l3n}` }] : []),
    ...SIT_LABELS.filter(([k]) => (sit[k] && sit[k].hr9 != null) || liveBoard[SIT_TO_LIVE[k]])
      .map(([k, label, title]) => ({ key: `sit:${k}`, label, title })),
    ...LIVE_ONLY.filter(([code]) => liveBoard[code])
      .map(([code, label, title]) => ({ key: `live:${code}`, label, title })),
  ]
  const [split, setSplit] = useState('season')
  if (options.length <= 1) return null
  const active = options.some((o) => o.key === split) ? split : 'season'

  let stats = []
  let footer = null
  if (active === 'season') {
    stats = [
      { label: 'HR/9', value: num('pitcher_hr9'), fmt: f2, anchor: 1.15, ceiling: 0.8, tip: 'season homers per nine — warm is a leak, good for the bat' },
      { label: 'WHIP', value: num('pitcher_whip'), fmt: f2, anchor: 1.28, ceiling: 0.45, tip: 'season walks+hits per inning' },
      { label: 'ERA', value: num('pitcher_era'), fmt: f2, anchor: 4.10, ceiling: 2.0, tip: 'season earned-run average' },
      { label: 'HR', value: num('pitcher_hr_allowed'), fmt: f0, anchor: 0, ceiling: 1e9, tip: 'season homers allowed (count, not shaded)' },
      { label: 'BB/9', value: num('pitcher_bb9'), fmt: f2, anchor: 3.2, ceiling: 1.5, tip: 'season walks per nine' },
    ]
  } else if (active === 'lhb' || active === 'rhb') {
    const side = active === 'lhb' ? 'lhb' : 'rhb'
    stats = [
      { label: 'HR/9', value: num(`pitcher_hr9_vs_${side}`), fmt: f2, anchor: 1.15, ceiling: 0.8, tip: `HR/9 vs ${side.toUpperCase()}` },
      { label: 'WHIP', value: num(`pitcher_whip_vs_${side}`), fmt: f2, anchor: 1.28, ceiling: 0.45, tip: `WHIP vs ${side.toUpperCase()}` },
      { label: 'HR', value: num(`pitcher_hr_vs_${side}`), fmt: f0, anchor: 0, ceiling: 1e9, tip: 'homers allowed to this side (count)' },
      { label: 'XBH', value: num(`pitcher_xbh_vs_${side}`), fmt: f0, anchor: 0, ceiling: 1e9, tip: 'extra-base hits allowed to this side (count)' },
    ]
    const mix = String(src(`pitcher_primary_mix_vs_${side}`) || '')
    footer = mix ? `his mix that side: ${mix}` : null
  } else if (active === 'l3') {
    const velo = num('pitcher_fb_velo_delta')
    stats = [
      { label: 'HR/9', value: num('pitcher_l3_hr9'), fmt: f2, anchor: 1.15, ceiling: 0.8, tip: `last ${l3n} starts` },
      { label: 'WHIP', value: num('pitcher_l3_whip'), fmt: f2, anchor: 1.28, ceiling: 0.45, tip: `last ${l3n} starts` },
      { label: 'ERA', value: num('pitcher_l3_era'), fmt: f2, anchor: 4.10, ceiling: 2.0, tip: `last ${l3n} starts` },
      { label: 'FB Δ', value: velo, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, anchor: 0, ceiling: 1.5, tip: 'last start fastball vs his season average — losing velocity is the wear signal', },
    ]
    footer = `a direction, not a rate — ${l3n} start${l3n === 1 ? '' : 's'} is a handful of innings · trend: ${clean(src('pitcher_trend_direction'), 'unknown')}`
  } else {
    // sit:<key> prefers the bot's published split; live:<code> (and a sit key
    // the bot hasn't published) reads the live board. Either way the shape is
    // the same five tiles, and the footer says which source it is.
    const isLiveOnly = active.startsWith('live:')
    const sitKey = isLiveOnly ? null : active.slice(4)
    const botRow = sitKey ? sit[sitKey] : null
    const fromBot = !!(botRow && botRow.hr9 != null)
    const b = fromBot ? botRow : (liveBoard[isLiveOnly ? active.slice(5) : SIT_TO_LIVE[sitKey]] || {})
    const dim = sampleDim(b.bf, 40)
    stats = [
      { label: 'HR/9', value: b.hr9, fmt: f2, anchor: 1.15, ceiling: 0.8, tip: 'in this split' },
      { label: 'WHIP', value: b.whip, fmt: f2, anchor: 1.28, ceiling: 0.45, tip: 'in this split' },
      { label: 'OPS', value: b.ops, fmt: (v) => v.toFixed(3), anchor: 0.720, ceiling: 0.180, tip: 'OPS against, in this split' },
      { label: 'HR', value: b.hr, fmt: f0, anchor: 0, ceiling: 1e9, tip: 'homers allowed in this split (count)' },
      { label: 'IP', value: b.ip, fmt: (v) => v.toFixed(1), anchor: 0, ceiling: 1e9, tip: 'innings in this split (the denominator)' },
    ]
    const sample = dim.thin ? `${b.bf ?? 0} batters faced — ${dim.title}` : `${b.bf} batters faced`
    footer = fromBot ? sample : `${sample} · live from MLB StatsAPI — context only, not in any score`
  }

  return (
    <div style={{ margin: '2px 0 12px' }}>
      <PillRow label="Split" value={active} options={options} onChange={setSplit} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {stats.map((st) => <SplitStat key={st.label} {...st} />)}
      </div>
      {footer && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4 }}>{footer}</div>}
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 2 }}>
        warm = good news for the bat · cool = his wall · a split the bot hasn&apos;t published isn&apos;t offered
      </div>
    </div>
  )
}

export default function PitcherModal({ pitcher, slateMode, onClose, onPlayerClick }) {
  useScrollLock(Boolean(pitcher))
  const [tab, setTab] = useState('matchup')

  const lineup = useMemo(() => (pitcher?.lineup || []).filter(Boolean), [pitcher])

  // Representative hitter for the arsenal split — the bat that matters most in
  // this lineup, so the platoon side shown is the one worth planning around.
  const anchor = useMemo(() => {
    const rows = lineup.map((b) => b?.raw).filter(Boolean)
    return [...rows].sort((a, b) => n(b?.hr_score, 0) - n(a?.hr_score, 0))[0] || null
  }, [lineup])

  // A RAW row carrying the 98 pitcher_* stat fields, for the tag rules.
  const tagRow = useMemo(() => {
    const rows = lineup.map((b) => b?.raw).filter(Boolean)
    return rows.find((r) => r.pitcher_hr9 != null) || rows[0] || null
  }, [lineup])

  const rows = useMemo(() => lineup.map((b) => {
    const raw = b?.raw || {}
    return {
      _key: b?.player_id ?? b?.name,
      _raw: raw,
      spot: n(b?.lineup_spot ?? raw?.lineup_spot, null),
      batter: clean(b?.name, nameOf(raw)),
      bats: clean(b?.bats ?? raw?.bats, '?'),
      hr: n(raw?.hr_score, 0),
      hrw: n(raw?.hrw_score, 0),
      hit: n(raw?.hit_score, 0),
      ev: n(raw?.recent_ev, 0) || null,
      ihr: n(raw?.recent_ideal_hr_contact, 0) * 100,
      l5hr: n(raw?.last5_hr, 0),
      seasonHr: n(raw?.season_hr, 0),
      weak: raw?.weak_spot_flag ? 1 : 0,
      match: n(raw?.pitch_type_match_score, 0) > 0 ? 1 : 0,
      spotDmg: n(raw?.pitcher_spot_damage_score, 0),
    }
  }), [lineup])

  if (!pitcher) return null

  const src = (k) => {
    for (const b of lineup) {
      const v = b?.raw?.[k]
      if (v !== null && v !== undefined && v !== '') return v
    }
    return null
  }
  // groupPitchers() builds these rows, so the pitcher-level fields are named
  // pitcher_name / pitcher_throws / team, not name / throws.
  const name = clean(pitcher?.pitcher_name ?? src('pitcher_name'), 'Unknown')
  const throws = clean(pitcher?.pitcher_throws ?? src('pitcher_throws'), '?')
  const team = clean(pitcher?.team ?? src('pitcher_team'), '')
  const opp = clean(pitcher?.opponent_team, '')
  const weakSide = clean(src('pitcher_weak_side'), '')
  const hr9 = n(src('pitcher_hr9'), null)

  // The at-a-glance row (2026-08-14) — every number was already on the
  // opposing hitters' rows; the modal just never surfaced them above the
  // fold. Thresholds mirror the starter table's own documented slate means
  // (FB% ~38, HH% ~38, Brl% ~7; HR/9 1.3+ hot / 0.85- wall).
  const era = n(pitcher?.pitcher_era ?? src('pitcher_era'), null)
  const whip = n(pitcher?.pitcher_whip ?? src('pitcher_whip'), null)
  const k9 = n(src('pitcher_k9'), null)
  const fbAllowed = n(src('pitcher_fb_rate'), null)
  const hhAllowed = n(src('pitcher_hardhit_allowed'), null)
  const brlAllowed = n(src('pitcher_barrel_allowed'), null)
  const l3hr9 = n(src('pitcher_l3_hr9'), null)
  const l3n = n(src('pitcher_l3_starts_found'), 0)
  const fmt2 = (v) => (v == null ? '—' : v.toFixed(2))
  const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

  // ── the hero's numbers and its sentence ───────────────────────────────────
  // "the words for the pitcher ... i wanted to be shown" — this is the line
  // that says, in plain English, what kind of arm this is before any table
  // does. It only ever states fields the bot actually published; a missing
  // one drops out of the sentence rather than printing a zero.
  const attack = n(src('pitcher_attack_score'), null)
  const attackTag = clean(src('pitcher_attack_tag'), '')
  // Warm = good for the BATS, the site-wide verdict pair. 30+ is the "genuinely
  // high" line MatchupPitcher.js already draws on this same field; under 12 is
  // the bottom fifth of tonight's starters.
  const attackInk = verdictInk(attack == null ? null : attack >= 30 ? true : attack <= 12 ? false : null)
  const heroLine = (() => {
    const bits = []
    if (hr9 != null) bits.push(`${hr9.toFixed(2)} HR/9 allowed`)
    if (brlAllowed != null) bits.push(`${(brlAllowed * 100).toFixed(0)}% barrels`)
    if (fbAllowed != null) bits.push(`${(fbAllowed * 100).toFixed(0)}% fly balls`)
    if (weakSide) bits.push(`weakest vs ${weakSide}`)
    if (!bits.length) return 'No season line published for this arm yet — the panels below are pulled live.'
    const lead = attack == null ? ''
      : attack >= 30 ? 'A live window for the bats — '
      : attack <= 12 ? 'A hard arm to attack — '
      : ''
    return `${lead}${bits.join(' · ')}.`
  })()
  const tiles = [
    { label: 'ERA', value: fmt2(era), tone: era == null ? null : era >= 5 ? 'hot' : era <= 3.2 ? 'cold' : null,
      tip: 'Season earned-run average.' },
    { label: 'WHIP', value: fmt2(whip), tone: whip == null ? null : whip >= 1.4 ? 'hot' : whip <= 1.1 ? 'cold' : null,
      tip: 'Walks + hits per inning — traffic. High traffic means more RBI chances for the bats.' },
    { label: 'HR/9', value: fmt2(hr9), tone: hr9 == null ? null : hr9 >= 1.3 ? 'hot' : hr9 <= 0.85 ? 'cold' : null,
      tip: 'Homers allowed per nine — the leak. 1.30+ is a live power window; 0.85 or under is a wall.' },
    { label: 'K/9', value: k9 == null ? '—' : k9.toFixed(1), tone: k9 == null ? null : k9 <= 7 ? 'hot' : k9 >= 9.5 ? 'cold' : null,
      tip: 'Strikeouts per nine. LOW is good for the bats — more balls in play. High is his strength.' },
    { label: 'FB%', value: fmtPct(fbAllowed), tone: fbAllowed == null ? null : fbAllowed >= 0.42 ? 'hot' : fbAllowed <= 0.32 ? 'cold' : null,
      tip: 'Fly-ball rate allowed, season — the only batted ball that leaves the yard. Slate mean ~38%.' },
    { label: 'HH%', value: fmtPct(hhAllowed), tone: hhAllowed == null ? null : hhAllowed >= 0.42 ? 'hot' : hhAllowed <= 0.33 ? 'cold' : null,
      tip: 'Hard-hit rate allowed (95+ mph). Slate mean ~38%.' },
    { label: 'BRL%', value: fmtPct(brlAllowed), tone: brlAllowed == null ? null : brlAllowed >= 0.09 ? 'hot' : brlAllowed <= 0.05 ? 'cold' : null,
      tip: 'Barrel rate allowed — the single best contact-quality signal for homers. Slate mean ~7%.' },
    ...(l3n > 0 ? [{ label: `L3 HR/9`, value: fmt2(l3hr9), tone: l3hr9 == null ? null : l3hr9 >= 1.3 ? 'hot' : l3hr9 <= 0.85 ? 'cold' : null,
      tip: `Last ${l3n} start${l3n === 1 ? '' : 's'} — a direction, not a rate. Three outings is a handful of innings.` }] : []),
  ]

  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        // #30: the floating bottom nav sits at z-index 390 and this backdrop
        // sat at 100, so the bar drew ON TOP of an open card -- covering the
        // first row of the Pitch table and the bottom of the Spray chart. The
        // suggested fix was bottom padding on the scroll container, but that
        // treats the symptom: a modal that a global nav can be clicked
        // through is not modal. Above the bar (390) and below the ember
        // signature rail (400), which is 3px of chrome at the very top and
        // has nothing to overlap.
        position: 'fixed', inset: 0, zIndex: 395,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width: 1100, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>
          {/* THE TOOLBAR, ON ITS OWN LINE (2026-08-23) — same reason as the
              hitter modal: controls plus a tag badge left almost nothing for
              the pitcher's NAME on a 430px phone, and the name has an
              ellipsis. 📸 keeps every argument it had. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            {/* 📸 SHARE (2026-08-23) — his card as a PNG, zero backend, the
                same tiles this modal already drew above. */}
            <button onClick={() => downloadPitcherCard({ name, team, opp, throws, weakSide, tiles, topBat: anchor })}
              title="Download his card as a PNG for posting — the at-a-glance tiles and his toughest lineup matchup"
              aria-label="Download pitcher card as image"
              style={{
                background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2,
                borderRadius: 7, padding: '3px 9px', fontSize: 12, lineHeight: 1,
                cursor: 'pointer', minHeight: 26,
              }}>📸</button>
          </div>

          {/* ── THE HERO (2026-08-23) ─────────────────────────────────────
              Same block the Props cards and the hitter modal open with, per
              Donovan's "upgrade both pitcher and player modals like this too".
              Hero only: the tag row, the tabs, the arsenal, the splits control
              and the lineup table below are all untouched.

              THE DIAL IS NOT OUT OF 100 HERE, and that is deliberate.
              `pitcher_attack_score` is not a 0-100 board score —
              MatchupPitcher.js has it measured at 0–53.9 with a median of
              19.5, and tonight's slate agrees (30 starters: 1.8 low, 17.8
              median, 66.9 high). Drawn against 100 a genuinely leaky arm would
              fill a fifth of the ring and read as harmless. The ring fills
              against a stated 55, the PRINTED number is the real score, and
              the tooltip says both. Warm/cool follows the site-wide verdict
              pair: warm = good for the bats. */}
          <VerdictHero
            style={{ marginBottom: 12 }}
            col={attackInk.color}
            score={attack}
            max={55}
            dp={attack != null && attack < 10 ? 1 : 0}
            dialTitle={`Attack score ${attack == null ? '—' : attack.toFixed(1)} — how much this arm gives the bats. The slate runs about 0–55 with a median near 18, and the ring is drawn against 55, not 100.`}
            title={name}
            badge={attackTag && attackTag !== 'Neutral' ? attackTag : `${throws}HP`}
            badgeQuiet={!attackTag || attackTag === 'Neutral'}
            meta={`${throws}HP · ${team}${opp ? ` vs ${opp}` : ''} · facing ${lineup.length} tracked hitter${lineup.length === 1 ? '' : 's'}${pitcher?.lineup_confirmed === false ? ' · projected lineup' : ''}`}
            market="attack score"
            line={heroLine}
            right={(
              <button onClick={onClose} aria-label="Close" style={{
                background: 'transparent', border: 'none', color: C.text3, fontSize: 20,
                cursor: 'pointer', lineHeight: 1, padding: '2px 6px', margin: '0 -6px 0 0',
                flexShrink: 0,
              }}>✕</button>
            )}
          />

          {/* THE TAG ROW (rebuilt 2026-08-23) — the finding, above the
              evidence. The old chip row (attack tag / Low K / Weak arm)
              rides inside it as extraChips, excluded from the blowup count:
              one finding, one surface, one vocabulary. tagRow is a RAW
              lineup row — groupPitchers() builds identity-only objects, and
              handing one of those to the tags renders exactly like "this
              arm has no weaknesses" (the 08-22 bug, caught by rendering). */}
          <PitcherTags
            row={tagRow}
            extraChips={[
              weakSide ? { label: `Weak vs ${weakSide}`, why: 'the bot’s own split read' } : null,
              clean(src('pitcher_attack_tag'), '') !== '—' && clean(src('pitcher_attack_tag'), '') ? { label: clean(src('pitcher_attack_tag')), why: 'the bot’s coarse attack bucket — three buckets, not independent of the measured tags' } : null,
              src('pitcher_low_k_flag') ? { label: 'Low K', why: 'the bot’s low-strikeout flag' } : null,
              src('weak_pitcher_flag') ? { label: 'Weak arm', why: 'the bot’s weak-pitcher flag — fired on 37 of 59 measured arms, informative but not independent' } : null,
            ]}
          />

          {/* ── BAND 1: WHAT HE GIVES UP ─────────────────────────────────
              His season line and his recent contact — the damage half. Same
              tiles as before, now under a heading that says which question
              they answer. */}
          <ModalBand title="What he gives up" note="his season line, and the contact he has been allowing">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 6 }}>
              {tiles.map((t) => <Tile key={t.label} {...t} />)}
            </div>
            <div style={{ fontSize: 8.5, color: C.text3 }}>
              <b style={{ color: C.orange }}>orange</b> = good for the bats facing him ·{' '}
              <b style={{ color: '#60a5fa' }}>blue</b> = his strength — hover any tile for what it means
            </div>
          </ModalBand>

          {/* ── BAND 2: WHO GETS HIM ─────────────────────────────────────
              The splits. Same control, same tiles — but the heading is what
              stops it reading as the previous eight numbers printed twice,
              which is exactly how it read at 390px. */}
          {/* ── WHAT HE GIVES AWAY (2026-08-23) ────────────────────────────
              The same nine fields the Pitchers page card reads, in the same
              order, from the same helper — because two surfaces computing the
              same thing twice is how they start quietly disagreeing, which
              this page has already paid for once with two rival attackability
              scores. Same rules: every figure with its denominator, a refused
              rate drawn as an em-dash and its reason, and the catcher named
              because the caught-stealing rate is his as much as the arm's. */}
          {(() => {
            const rgRow = (lineup.find((b) => b?.raw?.pitcher_running_game_status) || lineup[0])?.raw
            const rg = runningGame(rgRow)
            if (!rg.ok) return null
            const pc = (v, d = 0) => `${(v * 100).toFixed(d)}%`
            const cell = (label, value, sub, tip) => (
              <span key={label} title={tip} style={{
                flex: '1 1 76px', minWidth: 76, padding: '5px 9px', borderRadius: 9,
                border: `1px solid ${C.border}`, background: C.glass, cursor: 'default',
              }}>
                <span style={{ display: 'block', fontSize: 7.5, fontWeight: 800, letterSpacing: '.09em',
                  color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 900, fontFamily: NUM_FONT,
                  color: C.text, lineHeight: 1.15 }}>{value}</span>
                {sub && <span style={{ display: 'block', fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>{sub}</span>}
              </span>
            )
            return (
              <ModalBand title="What he gives away"
                note={rg.catcher.ok && rg.catcher.name
                  ? `${rg.catcher.name} catching${rg.catcher.source === 'roster' ? ' (roster — lineup not posted)' : ''}`
                  : 'catcher not resolved tonight'}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {cell('Run on him', rg.attempts == null ? '—' : String(rg.attempts),
                    rg.attempts ? `${rg.sb} SB · ${rg.cs} CS` : null,
                    'Stolen-base attempts against him this season, with the raw split underneath. A count rather than a rate: an arm nobody runs on and an arm with no data both read low, and only the counts separate them.')}
                  {cell('Thrown out', rg.csRate == null ? '—' : pc(rg.csRate),
                    rg.csWhy || (rg.cs != null && rg.attempts ? `${rg.cs} of ${rg.attempts}` : null),
                    "Caught stealing on those attempts. This is the pair's number, not his alone — the catcher throws it, which is why the catcher is named above. Refused under five attempts.")}
                  {cell('WP/9', rg.wp9 == null ? '—' : rg.wp9.toFixed(2),
                    rg.wp != null ? `${rg.wp} all season` : null,
                    'Wild pitches per nine innings, season count underneath. A ball past the catcher moves a runner up with nobody swinging.')}
                  {cell('Pickoffs', rg.pickRate == null ? '—' : pc(rg.pickRate, 1),
                    rg.pickWhy || (rg.pickoffs != null ? `${rg.pickoffs} all season` : null),
                    'Share of the baserunners he allows that he picks off. Refused under twenty baserunners.')}
                  {rg.defence.ok && rg.defence.oaa != null && cell('Defence',
                    `${rg.defence.oaa > 0 ? '+' : ''}${rg.defence.oaa}`, 'OAA behind him',
                    'Outs Above Average for the defence playing behind him, from Baseball Savant. Positive means the gloves have been taking hits away.')}
                </div>
                {runningGameLine(rg) && (
                  <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5, marginTop: 6 }}>
                    {runningGameLine(rg)}
                  </div>
                )}
              </ModalBand>
            )
          })()}

          <ModalBand title="Who gets him" note="the same arm, cut by hand, park and situation">
            <SplitsControl src={src} pitcherId={pitcher?.pitcher_id} />
          </ModalBand>

          {/* 🧭 the story in sentences — same flow pass the batter modal got
              (2026-08-15). All from fields already resolved above. */}
          <PitcherRead
            name={name}
            throws={throws}
            lineup={lineup}
            stats={{
              era, whip, hr9, k9, fbAllowed, hhAllowed, brlAllowed, l3hr9, l3n, weakSide,
              venue: clean(src('venue_name'), ''),
              parkHr: n(src('park_hr_factor'), null),
            }}
          />

          <div style={{ marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
            <PillRow
              value={tab}
              options={TABS.map((t) => ({ key: t.key, label: t.label }))}
              onChange={setTab}
            />
          </div>

          {tab === 'matchup' && (
            anchor
              ? (
                <>
                  <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.55 }}>
                    Arsenal below is his mix against <b style={{ color: C.text2 }}>{clean(anchor.bats, '?')}HB</b>, taken from{' '}
                    {clean(anchor.name, 'the top bat')} — the highest-HR-score hitter in this lineup. Open an individual
                    hitter to see the split for the side <i>he</i> stands on.
                  </div>
                  <MatchupPitcher player={anchor} slateMode={slateMode} />
                </>
              )
              : <div style={{ fontSize: 11.5, color: C.text3 }}>No opposing lineup published yet, so there&apos;s nothing to build his profile from.</div>
          )}

          {tab === 'lineup' && (
            rows.length
              ? (
                <>
                  {/* 🆚 career vs him, first (2026-08-14 — the competitor
                      feature Donovan asked for; full column set here since
                      the modal has the width. Same component rides in each
                      game's deep-dive in compact form.) */}
                  <TeamVsStarter
                    players={lineup.map((b) => b?.raw).filter(Boolean)}
                    team={opp}
                    pitcherName={name}
                    pitcherThrows={throws}
                    onPlayerClick={onPlayerClick}
                  />
                  {/* ── THE FULL TABLE, THE SAME ONE (2026-08-17) ────────────
                      Donovan: "the full table of players should be shown in
                      the pitcher as well." This tab had a 13-column summary of
                      its own; the Games page has the full ~35-column lineup
                      table. Two tables for one lineup drift, and the smaller
                      one always loses. GameLineup mounts here now — identical
                      component, identical columns, table-first default, the
                      spot read one pill over. */}
                  <GameLineup
                    players={lineup.map((b) => b?.raw).filter(Boolean)}
                    onPlayerClick={onPlayerClick}
                  />
                  <PitcherSpots pitcher={pitcher} onPlayerClick={onPlayerClick} />
                </>
              )
              : <div style={{ fontSize: 11.5, color: C.text3 }}>No lineup published for this game yet.</div>
          )}

          {tab === 'profile' && (
            <>
              <PitcherProfile pitcher={pitcher} />
              {/* The damage field: spray-chart-shaped read of where his
                  allowed damage goes, from verified rates. A true spray needs
                  coordinates the payload doesn't publish for pitchers, and
                  the component says so on its face. */}
              <PitcherField pitcher={pitcher} />
              <SlotDamage pitcher={pitcher} />
              {/* Live from MLB StatsAPI: home/away HR9, the pitches-1–75 vs
                  76+ fatigue split (the API's stand-in for times through the
                  order), and rest-day ERA. Not bot data, not in any score —
                  the block says so on its face. */}
              <SituationalSplits playerId={pitcher?.pitcher_id} kind="pitcher" />
            </>
          )}

          {tab === 'sim' && <PitcherSim getStat={src} name={name} />}
        </div>
      </div>
    </div>
  )
}
