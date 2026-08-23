'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf } from '../lib/player'
import { divTone, sampleDim } from '../lib/scales'
import { PillRow } from './Filters'
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
      borderRadius: 8, cursor: tip ? 'help' : 'default',
    }}>
      <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 900, fontFamily: NUM_FONT, color: tone === 'hot' ? C.orange : tone === 'cold' ? '#60a5fa' : C.text }}>{value}</span>
    </span>
  )
}

const TABS = [
  { key: 'matchup', label: '🥎 Arsenal + damage' },
  { key: 'lineup',  label: '📋 Lineup he faces' },
  { key: 'profile', label: '📊 Command + splits' },
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

function SplitsControl({ src }) {
  const num = (k) => { const v = Number(src(k)); return Number.isFinite(v) ? v : null }
  const sit = src('pitcher_situational_splits') || {}
  const f2 = (v) => v.toFixed(2)
  const f0 = (v) => String(Math.round(v))
  const l3n = num('pitcher_l3_starts_found') || 0

  const SIT_LABELS = [
    ['home', 'In park', 'his numbers at home — the "in park" split'],
    ['away', 'Road', 'his numbers on the road'],
    ['day', 'Day', 'day games'],
    ['night', 'Night', 'night games'],
    ['risp', 'RISP', 'with runners in scoring position'],
    ['ahead', 'Ahead', 'when ahead in the count'],
    ['behind', 'Behind', 'when behind in the count — the blowup count state'],
  ]
  const options = [
    { key: 'season', label: 'Season' },
    ...(num('pitcher_hr9_vs_lhb') != null ? [{ key: 'lhb', label: 'vs LHB' }] : []),
    ...(num('pitcher_hr9_vs_rhb') != null ? [{ key: 'rhb', label: 'vs RHB' }] : []),
    ...(l3n > 0 ? [{ key: 'l3', label: `Last ${l3n}` }] : []),
    ...SIT_LABELS.filter(([k]) => sit[k] && sit[k].hr9 != null)
      .map(([k, label, title]) => ({ key: `sit:${k}`, label, title })),
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
    const b = sit[active.slice(4)] || {}
    const dim = sampleDim(b.bf, 40)
    stats = [
      { label: 'HR/9', value: b.hr9, fmt: f2, anchor: 1.15, ceiling: 0.8, tip: 'in this split' },
      { label: 'WHIP', value: b.whip, fmt: f2, anchor: 1.28, ceiling: 0.45, tip: 'in this split' },
      { label: 'OPS', value: b.ops, fmt: (v) => v.toFixed(3), anchor: 0.720, ceiling: 0.180, tip: 'OPS against, in this split' },
      { label: 'HR', value: b.hr, fmt: f0, anchor: 0, ceiling: 1e9, tip: 'homers allowed in this split (count)' },
      { label: 'IP', value: b.ip, fmt: (v) => v.toFixed(1), anchor: 0, ceiling: 1e9, tip: 'innings in this split (the denominator)' },
    ]
    footer = dim.thin ? `${b.bf ?? 0} batters faced — ${dim.title}` : `${b.bf} batters faced`
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
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-box"
        style={{
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width: 1100, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{name}</div>
              <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 3 }}>
                {throws}HP · {team}{opp ? ` vs ${opp}` : ''} · facing {lineup.length} tracked hitter{lineup.length === 1 ? '' : 's'}
                {' · '}ERA {clean(pitcher?.pitcher_era ?? src('pitcher_era'), '—')} · WHIP {clean(pitcher?.pitcher_whip ?? src('pitcher_whip'), '—')}
                {pitcher?.lineup_confirmed === false ? ' · projected lineup' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
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
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

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

          {/* the at-a-glance row — see Tile above */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 6 }}>
            {tiles.map((t) => <Tile key={t.label} {...t} />)}
          </div>
          <div style={{ fontSize: 8.5, color: C.text3, marginBottom: 10 }}>
            <b style={{ color: C.orange }}>orange</b> = good for the bats facing him ·{' '}
            <b style={{ color: '#60a5fa' }}>blue</b> = his strength — hover any tile for what it means
          </div>

          {/* the splits, as a control — see SplitsControl. */}
          <SplitsControl src={src} />

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
        </div>
      </div>
    </div>
  )
}
