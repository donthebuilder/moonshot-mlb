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
// THREE per category: #1 featured with full detail, #2 and #3 as compact rows
// under a divider. Two reasons this beats one-per-bucket. The 39-day archive
// shows the scores separate quartiles, not neighbours — #1 vs #2 is close to
// a coin flip, so one name implied precision the data doesn't support. And a
// single name per bucket dies the moment that hitter is scratched. Three is
// still a decision, not a list.
//
// The category is `game_pick_role`, which tags 105 of 268 hitters: TOP 15,
// HR 15, HRR 30, HIT 30, CONTACT 15. Inside each, ranking is by the highest
// score ON THAT CATEGORY'S OWN SCALE — HR score for the HR picks, hit score
// for the hit picks, and so on. Ranking them all by HR score would just hand
// you the biggest power bats and defeat the split.
//
// WHERE IT LIVES. Top of Scoreboard, the landing tab — not the sticky header.
// The header already carries the projection, the live tracker and three tiles;
// four more would push it to two rows on a laptop and three on a phone, and a
// sticky bar eating a third of the viewport stops being navigation. This also
// doesn't change minute to minute — it's fixed when the slate builds — so it
// has no reason to follow you down the page.

const CATEGORIES = [
  // RAW bot score on purpose (2026-08-04). This strip is branded as THE
  // BOT'S headline picks, and for a while the HR card ranked ISO-adjusted —
  // which meant the site's Four and the bot's printed FOUR could name
  // different hitters, and people noticed. The rule now: this strip mirrors
  // the bot verbatim; the site's ISO-adjusted opinion lives on the HR Board,
  // clearly labelled as the site's. One voice per surface.
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
    const picks = [...pool].sort((a, b) => cat.score(b) - cat.score(a)).slice(0, 3)
    return { ...cat, picks, poolSize: pool.length }
  }), [players])

  if (!four.some((f) => f.picks.length)) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-.01em' }}>🎯 The Four</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          four categories, three deep — the bot&apos;s headline picks
        </span>
      </div>

      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
      }}>
        {four.map((f) => {
          const lead = f.picks[0]
          const rest = f.picks.slice(1)
          return (
            <div
              key={f.role}
              style={{
                background: `linear-gradient(155deg, ${f.color}1f, ${f.color}07)`,
                border: `1px solid ${f.color}4d`,
                boxShadow: `0 0 18px ${f.color}12`,
                borderRadius: 12, padding: '10px 13px', minWidth: 0,
                display: 'flex', flexDirection: 'column',
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

              {!lead ? (
                <div style={{ fontSize: 10.5, color: C.text3 }}>None designated tonight.</div>
              ) : (
                <>
                  {/* #1 — featured, full detail. */}
                  <div
                    onClick={() => onPlayerClick?.(lead)}
                    style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{
                        fontSize: 14.5, fontWeight: 800, minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{nameOf(lead)}</span>
                      {lead?.weak_spot_flag === true && (
                        <span title="Weak lineup spot for this pitcher" style={{ fontSize: 11 }}>⭐</span>
                      )}
                      <span style={{
                        marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 16,
                        fontWeight: 900, color: f.color,
                      }}>{f.score(lead).toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT, marginTop: 2 }}>
                      L5 {n(lead?.last5_hits, 0)}H/{n(lead?.last5_hr, 0)}HR/{n(lead?.last5_xbh, 0)}XBH
                    </div>
                    <div style={{
                      fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {teamOf(lead)} · vs {clean(lead?.pitcher_name, 'TBD')}
                      {lead?.pitcher_throws ? ` (${lead.pitcher_throws}HP)` : ''}
                    </div>
                  </div>

                  {/* #2 and #3 — compact rows, same click-through, scores on
                      the same category scale so the three are comparable. */}
                  {rest.length > 0 && (
                    <div style={{
                      marginTop: 7, paddingTop: 6,
                      borderTop: `1px solid ${f.color}26`,
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      {rest.map((p, idx) => (
                        <div
                          key={p?.player_id ?? idx}
                          onClick={() => onPlayerClick?.(p)}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 6,
                            cursor: onPlayerClick ? 'pointer' : 'default', minWidth: 0,
                          }}
                        >
                          <span style={{
                            fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 800,
                            color: `${f.color}99`, flexShrink: 0,
                          }}>{idx + 2}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: C.text2, minWidth: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{nameOf(p)}</span>
                          {p?.weak_spot_flag === true && <span style={{ fontSize: 9 }}>⭐</span>}
                          <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                            {teamOf(p)}
                          </span>
                          <span style={{
                            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11,
                            fontWeight: 800, color: f.color, flexShrink: 0,
                          }}>{f.score(p).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        The category is the bot&apos;s own <code>game_pick_role</code>; ranking inside it is by the top
        score <b style={{ color: C.text2 }}>on that category&apos;s scale</b> — HR score for HR, hit
        score for HIT, and so on. Three deep because the archive says #1 vs #2 is close to a coin
        flip, and one name per bucket dies with a scratch.
        {' '}⭐ marks a weak lineup spot against tonight&apos;s starter. Click any name to open the hitter.
      </div>
    </div>
  )
}
