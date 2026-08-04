'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  n, clean, nameOf, teamOf, hrScore, hitScore, prodScore, tbScore,
} from '../lib/player'

// THE FOUR — the bot's own headline section, rebuilt on the site.
//
// This is not an invention. `mlb_breakdown_today.txt` prints a block called
// "🎯 THE FOUR" directly under the slate summary, and it is exactly one pick per
// category with its score, its last-five line and the arm it faces:
//
//   🧨 HR       Esmerlyn Valdez (PIT) ⭐   89.7   L5 3H/1HR/1XBH · vs Merrill Kelly
//   💠 HIT      CJ Abrams (WSH) ⭐         91.4   L5 14H/5HR/7XBH · vs Max Scherzer
//   🏁 HRR      Jeremy Peña (HOU)          83.8   L5 12H/4HR/4XBH · vs Walbert Ureña
//   ⚾ CONTACT  James Wood (WSH) ⭐         76.9   L5 6H/2HR/4XBH · vs Max Scherzer
//
// ONE per category is the whole point — it's the bot's single best answer to
// "if I take one bat for this outcome tonight, who". Showing four per bucket
// (which this component did in its first pass) turns a decision into a list and
// loses what makes the section useful.
//
// The category is `game_pick_role`, which tags 105 of 268 hitters: TOP 15,
// HR 15, HRR 30, HIT 30, CONTACT 15. Inside each, the pick is the highest score
// ON THAT CATEGORY'S OWN SCALE — HR score for the HR pick, hit score for the
// hit pick, and so on. Ranking all four by HR score would just hand you the
// four biggest power bats and defeat the split.
//
// WHERE IT LIVES. Top of Scoreboard, the landing tab — not the sticky header.
// The header already carries the projection, the live tracker and three tiles;
// four more would push it to two rows on a laptop and three on a phone, and a
// sticky bar eating a third of the viewport stops being navigation. This also
// doesn't change minute to minute — it's fixed when the slate builds — so it
// has no reason to follow you down the page.

const CATEGORIES = [
  { role: 'HR',      label: 'HR',      icon: '🧨', color: '#f97316',
    blurb: 'Going deep',     score: hrScore },
  { role: 'HIT',     label: 'HIT',     icon: '💠', color: '#a78bfa',
    blurb: 'Base-hit floor', score: hitScore },
  { role: 'HRR',     label: 'HRR',     icon: '🏁', color: '#22d3ee',
    blurb: 'Runs + RBI',     score: prodScore },
  { role: 'CONTACT', label: 'CONTACT', icon: '⚾', color: '#4ade80',
    blurb: 'Total bases',    score: tbScore },
]

export default function BotPicksStrip({ players = [], onPlayerClick }) {
  const four = useMemo(() => CATEGORIES.map((cat) => {
    const pool = players.filter(
      (p) => String(p?.game_pick_role || '').split('/')[0].trim() === cat.role,
    )
    const pick = [...pool].sort((a, b) => cat.score(b) - cat.score(a))[0] || null
    return { ...cat, pick, poolSize: pool.length }
  }), [players])

  if (!four.some((f) => f.pick)) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-.01em' }}>🎯 The Four</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          one bat per category — the bot&apos;s headline picks
        </span>
      </div>

      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
      }}>
        {four.map((f) => {
          const p = f.pick
          const l5h = n(p?.last5_hits, 0)
          const l5hr = n(p?.last5_hr, 0)
          const l5x = n(p?.last5_xbh, 0)
          const weak = p?.weak_spot_flag === true
          return (
            <div
              key={f.role}
              onClick={() => p && onPlayerClick?.(p)}
              style={{
                background: `linear-gradient(155deg, ${f.color}1f, ${f.color}07)`,
                border: `1px solid ${f.color}4d`,
                boxShadow: `0 0 18px ${f.color}12`,
                borderRadius: 12, padding: '10px 13px', minWidth: 0,
                cursor: p && onPlayerClick ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{f.icon}</span>
                <span style={{
                  fontSize: 10, fontWeight: 900, color: f.color,
                  letterSpacing: '.09em', fontFamily: NUM_FONT,
                }}>{f.label}</span>
                <span style={{ fontSize: 9, color: C.text3 }}>{f.blurb}</span>
              </div>

              {!p ? (
                <div style={{ fontSize: 10.5, color: C.text3 }}>None designated tonight.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      fontSize: 14.5, fontWeight: 800, minWidth: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{nameOf(p)}</span>
                    {weak && <span title="Weak lineup spot for this pitcher" style={{ fontSize: 11 }}>⭐</span>}
                    <span style={{
                      marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 16,
                      fontWeight: 900, color: f.color,
                    }}>{f.score(p).toFixed(1)}</span>
                  </div>

                  <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT, marginTop: 2 }}>
                    L5 {l5h}H/{l5hr}HR/{l5x}XBH
                  </div>
                  <div style={{
                    fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {teamOf(p)} · vs {clean(p?.pitcher_name, 'TBD')}
                    {p?.pitcher_throws ? ` (${p.pitcher_throws}HP)` : ''}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        The category is the bot&apos;s own <code>game_pick_role</code>; the pick inside it is the top
        score <b style={{ color: C.text2 }}>on that category&apos;s scale</b> — HR score for HR, hit
        score for HIT, and so on. Ranking all four on HR score would just return the four biggest
        power bats and defeat the point of splitting them.
        {' '}⭐ marks a weak lineup spot against tonight&apos;s starter. Click a card to open the hitter.
      </div>
    </div>
  )
}
