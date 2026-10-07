'use client'
import { C, NUM_FONT } from '../lib/theme'
import DenseTable from './DenseTable'
import ParkLead from './ParkLead'
import { n, clean, nameOf } from '../lib/player'

// 🆚 TEAM vs THE STARTER — the whole lineup's history against tonight's arm.
//
// THIS SEASON, NOT CAREER (2026-09-29, Donovan: "showing season data as
// career"). The bot's build_batter_vs_pitcher_profile pulls Statcast from
// max(SEASON_START, end - 730 days), so bvp_* is this season's meetings only.
// The table said "career" everywhere; the words now match the window. (BvP.js
// reads the live API's vsPlayerTotal -- that one really is career.)
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
// REBUILT 2026-10-07 (Donovan: "feels outdated"): a DenseTable (skin v2, columns in groups, standouts at
// rest) replaces the hand-drawn flex rows, and the block now leads with ParkLead -- does he get hurt
// in this building -- from the park fields the slate row already carries. Same props, same data.

export default function TeamVsStarter({ players = [], team = '', pitcherName = '', pitcherThrows = '', onPlayerClick, compact: compactProp = false, lead = false }) {
  const list = [...players].filter(Boolean)
    .sort((a, b) => (n(a?.lineup_spot, 99) || 99) - (n(b?.lineup_spot, 99) || 99))
  if (!list.length) return null
  const hand = String(pitcherThrows || '').toUpperCase().slice(0, 1)
  const vsKeyAvg = hand === 'L' ? 'avg_vs_lhp' : 'avg_vs_rhp'
  const vsKeyIso = hand === 'L' ? 'iso_vs_lhp' : 'iso_vs_rhp'
  const vsLabel = hand ? `v${hand}HP` : 'vSide'
  const dash = (met, v) => (met ? v : null)
  const rows = list.map((p, i) => {
    const pa = n(p?.bvp_pa, 0)
    const ab = n(p?.bvp_ab, 0)
    const met = pa > 0 || ab > 0
    const vsAvg = n(p?.[vsKeyAvg], 0)
    const vsIso = n(p?.[vsKeyIso], 0)
    return {
      key: p?.player_id ?? p?.id ?? i, _raw: p, _thin: met && pa < 8,
      spot: n(p?.lineup_spot, null), name: nameOf(p), bats: clean(p?.bats, ''),
      pa: met ? pa : null, h: dash(met, n(p?.bvp_hits, 0)), hr: dash(met, n(p?.bvp_hr, 0)),
      avg: dash(met, n(p?.bvp_avg, null)), obp: dash(met, n(p?.bvp_obp, null)), iso: dash(met, n(p?.bvp_iso, null)),
      woba: dash(met, n(p?.bvp_woba, null)), ops: dash(met, n(p?.bvp_ops, null)),
      k: dash(met, p?.bvp_k_pct != null ? 100 * Number(p.bvp_k_pct) : null),
      vsAvg: vsAvg > 0 ? vsAvg : null, vsIso: vsIso > 0 ? vsIso : null,
    }
  })
  const cols = [
    { key: 'spot', label: '#', group: 'Batter', w: 26, heat: false, dim: true, mono: true },
    { key: 'name', label: 'Batter', group: 'Batter', w: 140, heat: false, bold: true, sticky: true },
    { key: 'bats', label: 'B', group: 'Batter', w: 24, heat: false, dim: true, mono: true },
    { key: 'pa', label: 'PA', group: 'This season vs him', w: 34, dp: 0, heat: false, title: 'Plate appearances against this arm this season. A dash is no meeting, never a league-average default.' },
    { key: 'h', label: 'H', group: 'This season vs him', w: 32, dp: 0 },
    { key: 'hr', label: 'HR', group: 'This season vs him', w: 34, dp: 0 },
    { key: 'avg', label: 'AVG', group: 'This season vs him', w: 46, dp: 3 },
    { key: 'obp', label: 'OBP', group: 'This season vs him', w: 46, dp: 3 },
    { key: 'iso', label: 'ISO', group: 'This season vs him', w: 46, dp: 3 },
    { key: 'ops', label: 'OPS', group: 'This season vs him', w: 46, dp: 3 },
    { key: 'woba', label: 'wOBA', group: 'This season vs him', w: 48, dp: 3 },
    { key: 'k', label: 'K%', group: 'This season vs him', w: 40, dp: 0, invert: true },
    { key: 'vsAvg', label: `AVG ${vsLabel}`, group: `His split vs ${hand || 'this side'}HP`, w: 70, dp: 3, title: `His season average against ${hand === 'L' ? 'left' : 'right'}-handed pitching overall, not against this arm.` },
    { key: 'vsIso', label: `ISO ${vsLabel}`, group: `His split vs ${hand || 'this side'}HP`, w: 70, dp: 3 },
  ]
  return (
    <div style={{ marginBottom: 12 }}>
      {lead && <ParkLead pitcherName={pitcherName} src={list[0]?.raw || list[0]} />}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>
          {team ? `${team} ` : ''}this season vs {clean(pitcherName, 'the starter')}{hand ? ` (${hand})` : ''}
        </span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>head-to-head this season, plus his split vs this side</span>
      </div>
      <DenseTable rows={rows} columns={cols} initialSort={null} maxHeight={9999} bare
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw ?? r) : null}
        dimRow={(r) => !!r._thin}
        caption="Head-to-head this season; small samples by nature. A dash means no meeting, never a league-average default dressed up as history, and dimmed rows are under 8 PA. The vs-side columns are his season-long split against that hand, not this arm. History, not a projection. Tap a row for his full card." />
    </div>
  )
}
