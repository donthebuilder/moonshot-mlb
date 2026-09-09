'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, clean, hrScore } from '../lib/player'

// ◇ PLAYING, NOT ON THE BOT (2026-09-03)
//
// Donovan: "add playing not on the bot strip."
//
// THE GAP THIS FILLS. `game_pick_role` tags about 105 of tonight's 268 hitters.
// Every headline surface on this page is built from those 105 — The Four, the
// pick strip, the diff, the ledger. So roughly 160 men take a plate appearance
// tonight that the site has an opinion-shaped silence about, and the only place
// they appear at all is row 140 of a sortable table.
//
// That silence is not the same thing as "the bot says no". The categories are
// CAPPED — TOP 15, HR 15, HRR 30, HIT 30, CONTACT 15 — so the 106th best bat is
// untagged for the same reason the 105th is tagged, which is arithmetic, not
// judgment. This strip is the top of that overflow.
//
// WHY IT IS NOT JUST A LIST OF 160 NAMES. It ranks the untagged by the score
// the board already ranks everyone by, shows the best dozen, and prints the one
// fact that makes each of them interesting — because a name and a number is
// what the weak-spot table was doing wrong too.
//
// WHAT IT REFUSES TO DO. It does not call these picks, it does not rank them
// against the tagged men, and it invents no score of its own. It is the
// overflow, presented as the overflow.

const MIN_SCORE = 25
const SHOWN = 12

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

// One line per man, and it has to be the thing that is TRUE OF HIM rather than
// the same sentence with different numbers in it. Checked in priority order,
// loudest first, and a hitter with nothing to say gets his season line rather
// than a manufactured angle.
function angle(p) {
  const l5hr = n(p?.last5_hr, 0)
  const l10hr = n(p?.last10_hr, 0)
  const szn = n(p?.season_hr, 0)
  const iso = n(p?.season_iso, 0)
  const hr9 = n(p?.pitcher_hr9, 0)
  const park = n(p?.park_hr_factor, 1)
  const air = n(p?.weather_hr_effect_pct, 0)
  const spot = n(p?.lineup_spot, 0)
  if (p?.weak_spot_flag === true) return 'standing in a soft lineup slot'
  if (l5hr >= 2) return `${l5hr} homers in his last five`
  if (hr9 >= 1.6) return `the arm is giving up ${hr9.toFixed(2)} per nine`
  if (air >= 8) return `the air is worth +${air}% on homers tonight`
  if (park >= 1.15) return `${clean(p?.venue_name, 'this park')} plays big`
  if (l10hr >= 3) return `${l10hr} in his last ten`
  if (iso >= 0.22) return `.${String(Math.round(iso * 1000)).padStart(3, '0')} ISO on the season`
  if (spot && spot <= 3) return `batting ${spot}${spot === 1 ? 'st' : spot === 2 ? 'nd' : 'rd'} tonight`
  return szn ? `${szn} homers on the season` : 'on tonight’s card'
}

export default function OffBoardStrip({ players = [], onPlayerClick }) {
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => (
    (players || [])
      // Untagged, and actually playing. A man off the posted card is not
      // "overlooked by the model", he is not in the game.
      .filter((p) => !primaryRole(p) && p?.lineup_confirmed !== false && n(p?.lineup_spot, 0) > 0)
      .map((p) => ({ p, score: hrScore(p) }))
      .filter((r) => Number.isFinite(r.score) && r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
  ), [players])

  if (!rows.length) return null
  const shown = open ? rows.slice(0, 40) : rows.slice(0, SHOWN)

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px',
      background: 'rgba(255,255,255,.02)', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: C.text }}>◇ Playing, not on the bot</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} untagged bats in tonight&apos;s lineups score {MIN_SCORE}+ · the categories are capped, so this is overflow, not a verdict
        </span>
      </div>

      <div style={{ display: 'grid', gap: 2, marginTop: 7, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {shown.map(({ p, score }) => (
          <div
            key={p.player_id ?? p.id ?? nameOf(p)}
            role="button"
            tabIndex={0}
            className="quiet-tile"
            onClick={() => onPlayerClick?.(p)}
            onKeyDown={(e) => { if (e.key === 'Enter') onPlayerClick?.(p) }}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 7, padding: '4px 7px',
              borderRadius: 7, cursor: 'pointer', minWidth: 0,
            }}
          >
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, flexShrink: 0 }}>{nameOf(p)}</span>
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
              {teamOf(p)}/{oppOf(p)}
            </span>
            <span style={{
              fontSize: 9.5, color: C.text2, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{angle(p)}</span>
            <span style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 800,
              fontFamily: NUM_FONT, color: C.text2, flexShrink: 0,
            }}>{score.toFixed(0)}</span>
          </div>
        ))}
      </div>

      {rows.length > SHOWN && (
        <button onClick={() => setOpen((v) => !v)} style={{
          marginTop: 6, background: 'transparent', border: 'none', padding: 0,
          fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.text3, cursor: 'pointer',
        }}>
          {open ? 'show fewer' : `+${Math.min(rows.length, 40) - SHOWN} more`}
        </button>
      )}
    </div>
  )
}
