'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean, n } from '../lib/player'

// ── helpers ───────────────────────────────────────────────────────────────────

// Emoji scheme updated: 🧨→🏆 (HR Bet), 👀→🔭 (Power Watch) to stop colliding
// with the HRW timing emoji 👀 used below. ⛔ added for hard-suppressed scores.
const ROLE_MAP = {
  '🏆': { label: 'HR Bet',      color: '#f87171', emoji: '🏆' },
  '🔥': { label: 'HR Lean',     color: '#f97316', emoji: '🔥' },
  '🏁': { label: 'HRR / XBH',  color: '#22d3ee', emoji: '🏁' },
  '💠': { label: 'Contact',     color: '#a78bfa', emoji: '💠' },
  '🔭': { label: 'Power Watch', color: '#71717a', emoji: '🔭' },
  '⛔': { label: 'True Avoid',  color: '#ef4444', emoji: '⛔' },
}

// HRW timing band emoji: 50-59 band changed 👀→🌤️ (was double-booked with the
// old Power Watch role emoji above; now each symbol means exactly one thing).
// volatile_hot (80+) and strong_capped (70-80) used to share 🚀, but
// hrw_zone_score_value() in today_bot.py deliberately dampens 80+ scores as
// less reliable than 70-80 -- different reliability tiers, different symbols.
const HRW_MAP = {
  volatile_hot:  { emoji: '🌋', color: '#dc2626' },
  strong_capped: { emoji: '🚀', color: '#f97316' },
  sweet_spot:    { emoji: '⚡', color: '#f59e0b' },
  watch:         { emoji: '🌤️', color: '#71717a' },
  cold:          { emoji: '🧊', color: '#60a5fa' },
}

function getRoleConfig(p) {
  const raw = (p?.final_hr_role || '').trim()
  if (!raw) return null
  const m = raw.match(/^([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}])/u)
  if (!m) return null
  return ROLE_MAP[m[1]] || null
}

function miniStatLine(p) {
  const parts = []
  const l5hr = n(p?.last5_hr, 0)
  const hrw  = n(p?.hrw_score, 0)
  const ihr  = n(p?.recent_ideal_hr_contact, 0)
  const r375 = n(p?.recent_375_num, 0)
  const den  = Math.max(1, n(p?.recent_350_den, 1))
  if (l5hr  > 0) parts.push(`L5 ${l5hr}HR`)
  if (hrw   > 0) parts.push(`HRW ${Math.round(hrw)}`)
  if (ihr   > 0) parts.push(`IHR ${Math.round(ihr * 100)}%`)
  if (r375  > 0) parts.push(`375+ ${r375}/${den}`)
  return parts.slice(0, 3).join(' · ')
}

// ── BubbleChip (same as PlayerCard) ──────────────────────────────────────────

function BubbleChip({ emoji, label, color }) {
  if (!emoji && !label) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
      background: `${color}22`, color,
      border: `1px solid ${color}55`,
      borderRadius: 20, padding: '2px 8px',
      whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.4,
    }}>
      {emoji && <span style={{ fontSize: 12, lineHeight: 1 }}>{emoji}</span>}
      {label}
    </span>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function GameTopPick({ gamePlayers, onPlayerClick }) {
  const pick = useMemo(() => {
    if (!gamePlayers?.length) return null
    const scored = gamePlayers
      .filter(p => (p?.top_board_score_v2 ?? p?.hr_score ?? 0) >= 60)
      .sort((a, b) =>
        (b?.top_board_score_v2 ?? b?.hr_score ?? 0) -
        (a?.top_board_score_v2 ?? a?.hr_score ?? 0)
      )
    return scored[0] ?? null
  }, [gamePlayers])

  if (!pick) return null

  const role   = getRoleConfig(pick)
  if (!role) return null

  const stats  = miniStatLine(pick)
  const score  = Math.round(pick?.top_board_score_v2 ?? pick?.hr_score ?? 0)
  const tags   = (pick?.top_board_tags ?? []).slice(0, 3)
  const reason = clean(pick?.simple_reason_1 || '', '')
  const isWeakSpot = pick?.weak_spot_flag === true

  // HRW bubble
  const hrwZone = (pick?.hrw_zone || '').trim()
  const hrwCfg  = HRW_MAP[hrwZone]
  const hrwScore = Math.round(Number(pick?.hrw_score) || 0)

  return (
    <div
      onClick={() => onPlayerClick?.(pick)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', marginBottom: 8,
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${role.color}`,
        borderRadius: 10,
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}
    >
      {/* left label */}
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
        color: role.color, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        TOP PICK
      </div>

      {/* center */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* name + team */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{pick.name}</span>
          {isWeakSpot && <span style={{ fontSize: 11 }}>⭐</span>}
          <span style={{ fontSize: 10, color: C.text3 }}>{pick.team}</span>
        </div>

        {/* bubble row */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
          <BubbleChip emoji={role.emoji} label={role.label} color={role.color} />
          {hrwCfg && <BubbleChip emoji={hrwCfg.emoji} label={`HRW ${hrwScore}`} color={hrwCfg.color} />}
          {isWeakSpot && <BubbleChip emoji="⭐" label="Weak Spot" color="#f59e0b" />}
        </div>

        {stats && (
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 3 }}>
            {stats}
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
            {tags.map((t, i) => (
              <span key={i} style={{
                fontSize: 9, color: C.text3,
                background: `${C.text3}18`, borderRadius: 3, padding: '1px 5px',
              }}>{t}</span>
            ))}
          </div>
        )}

        {reason && (
          <div style={{ fontSize: 10, color: C.text3, fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>
            {reason.length > 80 ? reason.slice(0, 80) + '…' : reason}
          </div>
        )}
      </div>

      {/* right score */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: NUM_FONT, color: C.text, lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>score</div>
      </div>
    </div>
  )
}
