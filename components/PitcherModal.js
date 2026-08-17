'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf } from '../lib/player'
import { Chip } from './ui'
import DenseTable from './DenseTable'
import MatchupPitcher from './MatchupPitcher'
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

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
      border: `1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'transparent',
      color: active ? C.orange : C.text3,
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

const TABS = [
  { key: 'matchup', label: '🥎 Arsenal + damage' },
  { key: 'lineup',  label: '📋 Lineup he faces' },
  { key: 'profile', label: '📊 Command + splits' },
]

// ── THE SPLITS GRID (2026-08-17) ────────────────────────────────────────────
// Donovan sent a reference tool whose pitcher view LEADS with one grid:
// Season / vsLHB / vsRHB rows, the core rates as columns, shaded by which side
// of the matchup each number favours. Ours had the same facts scattered over
// three tabs — the modal was "fix the pitcher modal, bring up to speed,
// intuitive and usable" because the first screen answered nothing at a glance.
//
// Columns are ONLY what the slate publishes per side (HR, HR/9, WHIP, XBH, and
// his pitch mix on that side); the season row adds the season-only quality
// rates. A cell the bot has not published is a dash, never a zero. Shading
// follows the house tone rule — hot = good for the BAT — and the words carry
// it too, so colour is never the only encoding.
function SplitsGrid({ src }) {
  const g = (k) => src(k)
  const num = (k) => { const v = Number(g(k)); return Number.isFinite(v) ? v : null }
  const f2 = (v) => (v == null ? '—' : v.toFixed(2))
  const f0 = (v) => (v == null ? '—' : String(Math.round(v)))
  const rows = [
    { split: 'Season', hr: num('pitcher_hr_allowed'), hr9: num('pitcher_hr9'), whip: num('pitcher_whip'), xbh: null, mix: '' },
    { split: 'vs LHB', hr: num('pitcher_hr_vs_lhb'), hr9: num('pitcher_hr9_vs_lhb'), whip: num('pitcher_whip_vs_lhb'), xbh: num('pitcher_xbh_vs_lhb'), mix: String(g('pitcher_primary_mix_vs_lhb') || '') },
    { split: 'vs RHB', hr: num('pitcher_hr_vs_rhb'), hr9: num('pitcher_hr9_vs_rhb'), whip: num('pitcher_whip_vs_rhb'), xbh: num('pitcher_xbh_vs_rhb'), mix: String(g('pitcher_primary_mix_vs_rhb') || '') },
  ]
  if (rows.slice(1).every((r) => r.hr9 == null && r.whip == null)) return null
  const toneHr9 = (v) => (v == null ? null : v >= 1.3 ? 'hot' : v <= 0.85 ? 'cold' : null)
  const toneWhip = (v) => (v == null ? null : v >= 1.4 ? 'hot' : v <= 1.1 ? 'cold' : null)
  const cell = (txt, tone, tip) => (
    <td key={tip} title={tip} style={{
      padding: '4px 10px', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 700, textAlign: 'right',
      color: tone === 'hot' ? '#f87171' : tone === 'cold' ? '#4ade80' : C.text2,
      borderBottom: `1px solid ${C.bg}`,
    }}>{txt}</td>
  )
  return (
    <div style={{ margin: '2px 0 12px', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr>
            {['SPLIT', 'HR', 'HR/9', 'WHIP', 'XBH', 'HIS MIX THAT SIDE'].map((h, i) => (
              <th key={h} style={{
                padding: '3px 10px', fontSize: 8.5, color: C.text3, letterSpacing: '.07em',
                textAlign: i === 0 ? 'left' : i === 5 ? 'left' : 'right', fontFamily: NUM_FONT,
                borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.split}>
              <td style={{ padding: '4px 10px', fontSize: 10.5, fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.bg}` }}>{r.split}</td>
              {cell(f0(r.hr), null, `${r.split}: home runs allowed`)}
              {cell(f2(r.hr9), toneHr9(r.hr9), `${r.split}: HR per 9 — red is a leak (good for the bat), green is a wall`)}
              {cell(f2(r.whip), toneWhip(r.whip), `${r.split}: walks+hits per inning — red is traffic`)}
              {cell(r.xbh == null ? '—' : f0(r.xbh), null, `${r.split}: extra-base hits allowed`)}
              <td style={{ padding: '4px 10px', fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.bg}` }}>{r.mix || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 3 }}>
        red = good news for the bat on that side · green = his wall · season quality rates are the tiles above
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
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {hr9 != null && <Chip color={hr9 >= 1.4 ? C.orange : C.text2}>HR/9 {hr9.toFixed(2)}</Chip>}
            {weakSide && <Chip color={C.orange}>Weak vs {weakSide}</Chip>}
            {clean(src('pitcher_attack_tag'), '') !== '—' && <Chip color={C.text2}>{clean(src('pitcher_attack_tag'))}</Chip>}
            {src('pitcher_low_k_flag') && <Chip color={C.orange}>Low K</Chip>}
            {src('weak_pitcher_flag') && <Chip color={C.orange}>Weak arm</Chip>}
          </div>

          {/* the at-a-glance row — see Tile above */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 6 }}>
            {tiles.map((t) => <Tile key={t.label} {...t} />)}
          </div>
          <div style={{ fontSize: 8.5, color: C.text3, marginBottom: 10 }}>
            <b style={{ color: C.orange }}>orange</b> = good for the bats facing him ·{' '}
            <b style={{ color: '#60a5fa' }}>blue</b> = his strength — hover any tile for what it means
          </div>

          {/* Season / vsLHB / vsRHB, the reference-tool grid — see SplitsGrid. */}
          <SplitsGrid src={src} />

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

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
            {TABS.map((t) => (
              <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabBtn>
            ))}
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
