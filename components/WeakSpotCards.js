'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'

// ★ WEAK SPOTS, AS CARDS (2026-09-03)
//
// Donovan: "weak spots strips can be better than just names and numbers."
//
// He is describing a table that had five columns — pitcher, HR/9, spots,
// hitters, damage — where `hitters` was a comma-joined string and `spots` was
// a comma-joined string, so the two facts that belong together ("who is
// standing in the soft slot") arrived as two lists you had to line up by eye.
// Four names and four numbers, and the reader does the join.
//
// THE EVIDENCE WAS ALREADY ON THE ROW AND NOTHING WAS SHOWING IT.
// `pitcher_spot_damage_reason` is published per hitter and reads:
//
//     spot #1: 14 PA, 0.417 SLG, 0.000 ISO, HR rate 0.0%, XBH rate 12.5%, HH 41%
//
// That is the whole argument for the flag, in the bot's own words, and the
// table threw it away in favour of a single `damage` number. So each hitter
// now carries his own spot's line, and the card says what the flag MEANS
// instead of asserting it.
//
// WHAT MAKES A ROW ACTIONABLE, in the order it is printed:
//   the slot        — a number you can check against the posted card
//   the hitter      — with his handedness, because the platoon is half the read
//   the bot's tag   — if the model already likes him, this is a second reason,
//                     not a new one; if it does not, this is the whole reason
//   his HR score    — so two men in soft slots can be told apart
//   the spot's line — the sentence above, which is the actual evidence
//
// It is deliberately NOT sorted by damage alone. A .700 SLG spot with nobody
// good standing in it is a fact about the pitcher; the card is about tonight.

const LG_HR9 = 1.15

export default function WeakSpotCards({ entries = [], onPlayerClick }) {
  const cards = entries
    .map((e) => {
      const hit = (e.lineup || []).filter((b) => b.weak_spot_flag)
      if (!hit.length) return null
      const damage = Math.max(...hit.map((b) => n(b.raw?.pitcher_spot_damage_score, 0)), 0)
      // The best bat standing in a soft slot, not the softest slot. A card is
      // worth reading in proportion to who is actually in the hole tonight.
      const best = Math.max(...hit.map((b) => n(b.hr_score, 0)), 0)
      return { e, hit, damage, best }
    })
    .filter(Boolean)
    .sort((a, b) => b.best - a.best || b.damage - a.damage)

  if (!cards.length) return null

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {cards.map(({ e, hit, damage }) => {
        const hr9 = n(e.pitcher_hr9, null)
        const hot = hr9 != null && hr9 > LG_HR9
        return (
          <div key={e.pitcher_id ?? e.pitcher_name} style={{
            border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 11px',
            background: 'rgba(255,255,255,.02)', minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{e.pitcher_name}</span>
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                {e.pitcher_throws}HP · {e.team} vs {e.opponent_team}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
                // Coloured against the league mark, not against zero. An arm at
                // 1.10 is not "good", it is average, and a ramp anchored at
                // zero would paint it green.
                color: hr9 == null ? C.text3 : hot ? C.orange : C.text2,
              }}>
                {hr9 == null ? 'HR/9 —' : `${hr9.toFixed(2)} HR/9`}
                <span style={{ color: C.text3, fontWeight: 500 }}> vs {LG_HR9.toFixed(2)}</span>
              </span>
            </div>

            <div style={{ fontSize: 9.5, color: C.text2, marginTop: 4, lineHeight: 1.45 }}>
              {hit.length === 1
                ? `One soft slot tonight, and ${hit[0].name} is in it.`
                : `${hit.length} soft slots tonight.`}
              {damage > 0 && <span style={{ color: C.text3 }}> Spot damage {damage.toFixed(0)}.</span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
              {hit.map((b) => {
                const role = clean(b.raw?.game_pick_role, '').split('/')[0].trim().toUpperCase()
                const why = clean(b.raw?.pitcher_spot_damage_reason, '') || clean(b.weak_spot_reason, '')
                const l5hr = n(b.raw?.last5_hr, 0)
                // The platoon half of the read: does this hitter stand on the
                // side the arm is actually weak to?
                const weak = clean(e.pitcher_weak_side, '')
                const onWeakSide = (weak === 'LHB' && b.bats === 'L') || (weak === 'RHB' && b.bats === 'R')
                return (
                  <div
                    key={b.player_id ?? b.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => b.raw && onPlayerClick?.(b.raw)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' && b.raw) onPlayerClick?.(b.raw) }}
                    style={{
                      borderLeft: `2px solid ${onWeakSide ? C.orange : C.border2}`,
                      paddingLeft: 8, cursor: b.raw ? 'pointer' : 'default', minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                        #{b.lineup_spot ?? '—'}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{b.name}</span>
                      <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{b.bats}HB</span>
                      {onWeakSide && (
                        <span style={{ fontSize: 8.5, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>
                          HIS SIDE
                        </span>
                      )}
                      {/* The bot's tag is a SECOND reason when it agrees, and
                          its absence is not a mark against the hitter — the
                          model only tags 105 of 268 bats. Shown, never scored. */}
                      {role && (
                        <span style={{ fontSize: 8.5, fontWeight: 900, color: C.cyan, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>
                          {role}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.text2, flexShrink: 0 }}>
                        {n(b.hr_score, 0) > 0 ? n(b.hr_score, 0).toFixed(0) : '—'}
                        {l5hr > 0 && <span style={{ color: C.orange }}> · {l5hr} L5</span>}
                      </span>
                    </div>
                    {why && (
                      <div style={{ fontSize: 8.5, color: C.text3, lineHeight: 1.45, marginTop: 1 }}>{why}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
