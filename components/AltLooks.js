'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nn, clean, nameOf, teamOf, playerId, hrScore } from '../lib/player'

// 🔄 ALT LOOKS — port of the bot's own section, from mlb_dashboard.py.
//
// The breakdown txt prints "ALT LOOKS · small sample / variance" under the
// Top 30: fifteen hitters who are NOT on the main board and NOT already a game
// pick, grouped by why they're interesting anyway. The payload doesn't publish
// the section — the bot assembles it at print time — so this recreates it
// client-side using the same formulas, lifted line for line:
//
//   HOT/DUE   0.56·hot + 0.44·due + 0.08·norm(hr_score, 18, 60)      (5 names)
//   MATCHUP   matchup + 0.10·weak_spot + 0.06·norm(hr_score, 18, 60) (5 names)
//   VARIANCE  power signals with a small-sample bonus                (3 names)
//   ALT       filler to 15 by a blend of all three                   (rest)
//
// Selection rules preserved: a hitter already in the top of this board or
// holding a game_pick_role is excluded, true-avoid hitters are excluded, and
// each group takes at most one hitter per game so ALT spreads across the
// slate instead of stacking one juicy matchup.
//
// HONEST DIFFERENCES from the bot's output, stated rather than hidden:
// · The bot's trusted-sample gate uses recent_350_den as its BBE count; where
//   a field is missing on a slate row the term contributes zero instead of
//   crashing the blend, so ordering can differ near the boundaries.
// · The bot locks ALT names out of later pairs/pools on the same sheet. The
//   site can't reach into the bot's pair output, so that exclusivity isn't
//   reproduced here.

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const norm = (v, lo, hi) => clamp01(((Number(v) || 0) - lo) / (hi - lo))

const MIN_PA = 40
const MIN_BBE = 10
const trusted = (p) => n(p?.season_pa, 0) >= MIN_PA && n(p?.recent_350_den, 0) >= MIN_BBE

// hot_score — verbatim weights.
const hot = (p) =>
  0.40 * norm(p?.last5_hr, 0, 3) +
  0.25 * norm(p?.last5_xbh, 0, 4) +
  0.20 * norm(p?.last10_hr, 0, 5) +
  0.15 * norm(p?.last5_hits, 0, 8)

// due_score — verbatim, including the expected-HRs-minus-actual component.
const due = (p) => {
  const tracked = Math.max(1, n(p?.recent_350_den, 0))
  const seasonPa = Math.max(1, n(p?.season_pa, 1))
  const hrPerPa = n(p?.season_hr, 0) / seasonPa
  const recentPa = n(p?.l20pa_pa, 0) || Math.max(0, n(p?.recent_350_den, 0))
  const recentHr = n(p?.l20pa_hr, 0) || n(p?.last5_hr, 0)
  const dueGap = Math.max(0, recentPa * hrPerPa - recentHr)
  return (
    0.20 * norm(n(p?.recent_350_num, 0) / tracked, 0.08, 0.42) +
    0.15 * norm(n(p?.recent_375_num, 0) / tracked, 0.03, 0.24) +
    0.15 * norm(p?.recent_ideal_hr_contact, 0.05, 0.22) +
    0.12 * norm(p?.recent_barrel_rate, 0.03, 0.18) +
    0.09 * norm(p?.recent_hard_hit_rate, 0.28, 0.62) +
    0.07 * norm(p?.season_iso, 0.08, 0.34) +
    0.07 * (1 - norm(p?.last5_hr, 0, 3)) +
    0.15 * norm(dueGap, 0, 1.5)
  )
}

// matchup_score — verbatim, split by the arm he actually faces.
const matchup = (p) => {
  const vsL = p?.pitcher_throws === 'L'
  const splitAvg = vsL ? p?.avg_vs_lhp : p?.avg_vs_rhp
  const splitIso = vsL ? p?.iso_vs_lhp : p?.iso_vs_rhp
  const sideMatch =
    (p?.bats === 'L' && p?.pitcher_weak_side === 'LHB') ||
    (p?.bats === 'R' && p?.pitcher_weak_side === 'RHB') ? 1.0 : 0.45
  const sideHr9 = p?.bats === 'L' ? p?.pitcher_hr9_vs_lhb : p?.pitcher_hr9_vs_rhb
  return (
    0.26 * norm(splitAvg, 0.180, 0.360) +
    0.24 * norm(splitIso, 0.08, 0.38) +
    0.20 * norm(sideHr9, 0.7, 2.2) +
    0.15 * norm(p?.pitcher_hr_allowed, 5, 30) +
    0.10 * sideMatch +
    0.05 * (p?.weak_spot_flag ? 1.0 : 0.4)
  )
}

// variance ranking — verbatim, with the +0.10 small-sample bonus.
const variance = (p) => {
  const tracked = Math.max(1, n(p?.recent_350_den, 0))
  return (
    0.34 * norm(n(p?.recent_375_num, 0) / tracked, 0.02, 0.30) +
    0.24 * norm(p?.recent_ideal_hr_contact, 0.00, 0.18) +
    0.16 * norm(p?.recent_barrel_rate, 0.00, 0.15) +
    0.12 * norm(p?.season_iso, 0.08, 0.32) +
    0.08 * norm(p?.last5_hr, 0, 3) +
    (trusted(p) ? 0 : 0.10)
  )
}

const GROUPS = {
  'HOT/DUE':  { color: '#f97316', icon: '🔥', why: 'Recent power plus overdue signal' },
  'MATCHUP':  { color: '#22d3ee', icon: '🎯', why: 'The arm, the split, the spot' },
  'VARIANCE': { color: '#FCD34D', icon: '⚠️', why: 'Big power signals, thin sample — priced accordingly' },
  'ALT':      { color: '#a78bfa', icon: '🔄', why: 'Best of the rest by all three blends' },
  'HIGH ACROSS CATEGORIES': { color: '#4ade80', icon: '🔎', cross: true,
    why: 'Strong in several categories at once — the model’s consensus names' },
  'HR UPSIDE / UNDERLISTED': { color: '#FB923C', icon: '🧨', cross: true,
    why: 'Power signals bigger than his board rank — the sneaky HR lane' },
}

// MODEL CROSS-CHECK (2026-08-06) — the sheet's 🔎 section, same treatment as
// ALT LOOKS: the bot assembles it at print time and never publishes it, so
// these are its two blends lifted verbatim from
// build_model_cross_check_plays() in mlb_dashboard.py.
const multiScore = (p) => {
  const den = Math.max(1, n(p?.recent_350_den, 0))
  return (
    0.30 * norm(p?.hr_score, 18, 60) +
    0.24 * norm(p?.hrw_score, 35, 85) +
    0.22 * norm(p?.hrr_score, 45, 85) +
    0.14 * norm(p?.recent_ideal_hr_contact, 0.04, 0.30) +
    0.10 * norm(n(p?.recent_375_num, 0) / den, 0.02, 0.25)
  )
}
const upsideScore = (p) => {
  const den = Math.max(1, n(p?.recent_350_den, 0))
  return (
    0.34 * norm(p?.recent_ideal_hr_contact, 0.04, 0.30) +
    0.24 * norm(n(p?.recent_375_num, 0) / den, 0.02, 0.25) +
    0.18 * norm(p?.hr_score, 20, 55) +
    0.14 * norm(p?.hrw_score, 35, 85) +
    0.10 * norm(p?.last5_xbh, 0, 5)
  )
}

export default function AltLooks({ players = [], boardIds = new Set(), onPlayerClick }) {
  const groups = useMemo(() => {
    const avoid = (p) => p?.true_avoid_hr === true
    // Excluded: already featured on this board's top, already a game pick.
    const taken = new Set(boardIds)
    players.forEach((p) => {
      if (String(p?.game_pick_role || '').trim()) taken.add(playerId(p))
    })

    const pickUnique = (cands, cap) => {
      const out = []
      const games = new Set()
      for (const p of cands) {
        const id = playerId(p)
        if (taken.has(id) || games.has(p?.game_pk)) continue
        out.push(p); taken.add(id); games.add(p?.game_pk)
        if (out.length >= cap) break
      }
      return out
    }

    const pool = players.filter((p) => !avoid(p))
    const trustedPool = pool.filter(trusted)

    const hotDue = pickUnique(
      [...trustedPool].sort((a, b) =>
        (0.56 * hot(b) + 0.44 * due(b) + 0.08 * norm(hrScore(b), 18, 60)) -
        (0.56 * hot(a) + 0.44 * due(a) + 0.08 * norm(hrScore(a), 18, 60))), 5)

    const match = pickUnique(
      [...trustedPool].sort((a, b) =>
        (matchup(b) + (b?.weak_spot_flag ? 0.10 : 0) + 0.06 * norm(hrScore(b), 18, 60)) -
        (matchup(a) + (a?.weak_spot_flag ? 0.10 : 0) + 0.06 * norm(hrScore(a), 18, 60))), 5)

    const vari = pickUnique(
      [...pool].sort((a, b) => variance(b) - variance(a)), 3)

    const soFar = hotDue.length + match.length + vari.length
    const filler = soFar < 15
      ? pickUnique(
          [...pool].sort((a, b) =>
            (0.34 * matchup(b) + 0.33 * hot(b) + 0.33 * due(b)) -
            (0.34 * matchup(a) + 0.33 * hot(a) + 0.33 * due(a))), 15 - soFar)
      : []

    // Cross-check, verbatim selection: prefer players not already used
    // anywhere above (board, picks, alt looks); if that leaves fewer than 8,
    // fall back to everyone — exactly the bot's fresh/base logic. No true-
    // avoid filter here, because the bot doesn't apply one either.
    const fresh = players.filter((p) => !taken.has(playerId(p)))
    const base = fresh.length >= 8 ? fresh : players
    const localUsed = new Set()
    const take = (cands, cap) => {
      const out = []
      for (const p of cands) {
        const id = playerId(p)
        if (localUsed.has(id)) continue
        out.push(p); localUsed.add(id)
        if (out.length >= cap) break
      }
      return out
    }
    const high = take([...base].sort((a, b) => multiScore(b) - multiScore(a)), 5)
    const highIds = new Set(high.map(playerId))
    const upside = take([...base].filter((p) => !highIds.has(playerId(p)))
      .sort((a, b) => upsideScore(b) - upsideScore(a)), 4)

    return [
      ['HOT/DUE', hotDue], ['MATCHUP', match], ['VARIANCE', vari], ['ALT', filler],
      ['HIGH ACROSS CATEGORIES', high], ['HR UPSIDE / UNDERLISTED', upside],
    ].filter(([, list]) => list.length)
  }, [players, boardIds])

  if (!groups.length) return null

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3,
        paddingTop: 12, borderTop: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>🔄 Alt Looks</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          small sample / variance — quality names not already on the board
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 9, lineHeight: 1.5 }}>
        The bot&apos;s own section from the breakdown sheet, rebuilt with its formulas: hitters who
        didn&apos;t make the board and aren&apos;t a game pick, but clear one of three bars. Use as
        quality variance, not primary plays — the bot&apos;s words. One per game per group.
      </div>

      {/* LANES (2026-08-07): one grid, each group a colored column — the six
          stacked card-walls read as one repetitive page; this reads in one
          screenful. Score bars are normalized within each lane, so the bar
          says "his rank in THIS lane", not a cross-lane comparison. */}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', alignItems: 'start' }}>
        {groups.map(([key, list]) => {
          const g = GROUPS[key]
          const maxSc = Math.max(...list.map((p) => hrScore(p)), 1e-9)
          return (
            <div key={key} style={{
              background: C.bg2, border: `1px solid ${C.border}`,
              borderTop: `2px solid ${g.color}`, borderRadius: 10, padding: '7px 10px', minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 10.5 }}>{g.icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: 900, color: g.color, letterSpacing: '.07em', fontFamily: NUM_FONT }}>
                  {key}{g.cross ? ' 🔎' : ''}
                </span>
              </div>
              <div style={{ fontSize: 8.5, color: C.text3, marginBottom: 6, lineHeight: 1.35 }}>{g.why}</div>
              {list.map((p, i) => {
                const thin = !trusted(p)
                const sc = hrScore(p)
                return (
                  <div
                    key={playerId(p)}
                    onClick={() => onPlayerClick?.(p)}
                    title={`${nameOf(p)} — ${teamOf(p)} vs ${clean(p?.pitcher_name, 'TBD')} · L5 ${n(p?.last5_hits, 0)}H/${n(p?.last5_hr, 0)}HR/${n(p?.last5_xbh, 0)}XBH${thin ? ` · small sample (${n(p?.season_pa, 0)} PA)` : ''}`}
                    style={{
                      cursor: onPlayerClick ? 'pointer' : 'default', padding: '4px 0 3px',
                      borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : 'none', minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                      <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, width: 10, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{nameOf(p)}</span>
                      {p?.weak_spot_flag === true && <span style={{ fontSize: 9, flexShrink: 0 }}>⭐</span>}
                      {thin && <span style={{ fontSize: 8, color: '#FCD34D', fontFamily: NUM_FONT, fontWeight: 800, flexShrink: 0 }}>⚠{n(p?.season_pa, 0)}PA</span>}
                      <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: g.color, flexShrink: 0 }}>{sc.toFixed(1)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        {teamOf(p)} · vs {String(clean(p?.pitcher_name, 'TBD')).split(' ').slice(-1)[0]} · L5 {n(p?.last5_hr, 0)}HR/{n(p?.last5_xbh, 0)}XBH
                      </span>
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.05)', borderRadius: 2, minWidth: 24 }}>
                        <div style={{ width: `${(100 * sc) / maxSc}%`, height: '100%', background: g.color, borderRadius: 2, opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
