'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf } from '../lib/player'

// 🆚 TEAM vs THE STARTER — the whole lineup's history against tonight's arm.
//
// 2026-08-14, Donovan, from a competitor screenshot batch: "only thing i
// really like is the team vs pitcher splits and like vs certain splits —
// that needs to be accessible somewhere." This is that table: every hitter
// facing the starter, his career head-to-head line against THIS arm, plus
// his split against the side the arm throws from. Mounted in the pitcher
// modal's "Lineup he faces" tab and in each game's deep-dive on the Games
// page (both chosen by Donovan, AskUserQuestion same day).
//
// ZERO NEW DATA. Every column reads fields the bot already stamps on each
// hitter row: bvp_* (pa/ab/hits/hr/avg/obp/iso/woba/k_pct/bb_pct) and
// avg_vs_lhp/rhp + iso_vs_lhp/rhp. The competitor pulls this live; ours
// rides the slate payload for free.
//
// HONESTY RULES, the part the competitor version gets wrong. Their table
// paints .333 in bright green off a 1-for-3 career sample. Two gates here:
//   1. bvp_* fields carry LEAGUE-AVERAGE DEFAULTS (avg .250-ish shapes,
//      woba .320, k .220) even for a hitter who has NEVER faced this arm —
//      so every rate column is gated on bvp_pa > 0 and renders an honest
//      dash for a first meeting, never the default dressed up as history.
//   2. Under 8 career PA the numbers render DIMMED with the sample named
//      in the tooltip — visible (it IS the folklore people want to see),
//      never presented with the same confidence as a real sample.
//
// Style: the precise table language (At The Plate's contact-tonight
// section) — micro uppercase header, hairline separators, right-aligned
// mono numbers — per the same-day "that chart style site wide" direction.

const num3 = (v) => {
  const x = Number(v)
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(3).replace(/^0\./, '.')
}
const pct0 = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—'
}

const H = ({ children, w, grow = false, right = true }) => (
  <span style={{
    width: w, flex: grow ? 1 : undefined, minWidth: grow ? 0 : undefined, flexShrink: 0,
    textAlign: right ? 'right' : 'left', fontSize: 8, color: C.text3, fontFamily: NUM_FONT,
  }}>{children}</span>
)

export default function TeamVsStarter({ players = [], team = '', pitcherName = '', pitcherThrows = '', onPlayerClick, compact = false }) {
  const rows = [...players]
    .filter(Boolean)
    .sort((a, b) => (n(a?.lineup_spot, 99) || 99) - (n(b?.lineup_spot, 99) || 99))
  if (!rows.length) return null
  const hand = String(pitcherThrows || '').toUpperCase().slice(0, 1)
  const vsKeyAvg = hand === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp'
  const vsKeyIso = hand === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp'
  const vsLabel = hand ? `v${hand}HP` : 'vSide'

  const cell = (w) => ({ width: w, textAlign: 'right', flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT })

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 800 }}>
          🆚 {team ? `${team} ` : ''}career vs {clean(pitcherName, 'the starter')}{hand ? ` (${hand})` : ''}
        </span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          head-to-head history + his split vs this side
        </span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
          <H w={16} right={false}>#</H>
          <H grow right={false}>BATTER</H>
          <H w={40}>H-AB</H>
          <H w={24}>HR</H>
          <H w={36}>AVG</H>
          {!compact && <H w={36}>OBP</H>}
          {!compact && <H w={36}>ISO</H>}
          {!compact && <H w={40}>wOBA</H>}
          {!compact && <H w={30}>K%</H>}
          {compact && <H w={38}>OPS</H>}
          <H w={40}>{vsLabel}</H>
        </div>
        {rows.map((p, i) => {
          const pa = n(p?.bvp_pa, 0)
          const ab = n(p?.bvp_ab, 0)
          const met = pa > 0 || ab > 0
          const thin = met && pa < 8
          const dim = { opacity: thin ? 0.55 : 1 }
          const hr = n(p?.bvp_hr, 0)
          const vsAvg = n(p?.[vsKeyAvg], 0)
          const vsIso = n(p?.[vsKeyIso], 0)
          const tip = met
            ? `${nameOf(p)} vs ${clean(pitcherName, 'him')}: ${n(p?.bvp_hits, 0)}-for-${ab}${hr ? `, ${hr} HR` : ''} in ${pa} career PA${thin ? ' — tiny sample, folklore territory' : ''}. ${vsLabel} column is his season line vs ${hand === 'L' ? 'lefties' : 'righties'} overall (AVG${vsIso ? ` · ISO ${num3(vsIso)}` : ''}).`
            : `${nameOf(p)} has never faced ${clean(pitcherName, 'this arm')} — first meeting. ${vsLabel} column is his season line vs ${hand === 'L' ? 'lefties' : 'righties'} overall.`
          return (
            <div key={p?.player_id ?? p?.id ?? i} onClick={() => onPlayerClick?.(p)} className="tap-row" title={tip} style={{
              display: 'flex', gap: 7, alignItems: 'center', padding: '3.5px 0',
              cursor: 'pointer', minWidth: 0,
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
            }}>
              <span style={{ width: 16, flexShrink: 0, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{n(p?.lineup_spot, null) ?? '—'}</span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 700, color: C.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {nameOf(p)}
                <span style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}> {clean(p?.bats, '')}</span>
              </span>
              <span style={{ ...cell(40), ...dim, color: met ? C.text2 : C.text3 }}>{met ? `${n(p?.bvp_hits, 0)}-${ab}` : '0-0'}</span>
              <span style={{ ...cell(24), ...dim, color: hr > 0 ? C.orange : C.text3, fontWeight: hr > 0 ? 800 : 400 }}>{met ? hr : '—'}</span>
              <span style={{ ...cell(36), ...dim, color: C.text2 }}>{met ? num3(p?.bvp_avg) : '—'}</span>
              {!compact && <span style={{ ...cell(36), ...dim, color: C.text2 }}>{met ? num3(p?.bvp_obp) : '—'}</span>}
              {!compact && <span style={{ ...cell(36), ...dim, color: C.text2 }}>{met ? num3(p?.bvp_iso) : '—'}</span>}
              {!compact && <span style={{ ...cell(40), ...dim, color: C.text2 }}>{met ? num3(p?.bvp_woba) : '—'}</span>}
              {!compact && <span style={{ ...cell(30), ...dim, color: C.text3 }}>{met ? pct0(p?.bvp_k_pct) : '—'}</span>}
              {compact && <span style={{ ...cell(38), ...dim, color: C.text2 }}>{met ? num3(p?.bvp_ops) : '—'}</span>}
              <span style={{ ...cell(40), color: vsAvg >= 0.28 ? '#4ade80' : C.text2 }}>{vsAvg > 0 ? num3(vsAvg) : '—'}</span>
            </div>
          )
        })}
        <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
          Career head-to-head — tiny samples by nature: a dash means a first meeting (never a
          league-average default dressed up as history), dimmed rows are under 8 PA. The {vsLabel} column
          is his season-long split against {hand === 'L' ? 'left' : 'right'}-handed pitching, not
          specific to this arm. History, not a projection — tap a row for his full card.
        </div>
      </div>
    </div>
  )
}
