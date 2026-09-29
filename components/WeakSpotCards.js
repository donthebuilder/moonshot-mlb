'use client'
import { WeakSpotGrid } from './slate/WeakSpotCard'
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

  // THE CARD IS SHARED NOW (2026-09-28): components/slate/WeakSpotCard.js
  // draws it, style for style, for TUDDY and LAMP too. MOONSHOT's reading of
  // the arm and the slot stays here.
  return (
    <WeakSpotGrid cards={cards.map(({ e, hit, damage }) => {
      const hr9 = n(e.pitcher_hr9, null)
      const hot = hr9 != null && hr9 > LG_HR9
      return {
        key: e.pitcher_id ?? e.pitcher_name,
        title: e.pitcher_name,
        meta: `${e.pitcher_throws}HP · ${e.team} vs ${e.opponent_team}`,
        // Coloured against the league mark, not against zero: an arm at 1.10
        // is average, and a ramp anchored at zero would paint it green.
        stat: { text: hr9 == null ? 'HR/9 —' : `${hr9.toFixed(2)} HR/9`, hot, vs: `vs ${LG_HR9.toFixed(2)}` },
        lead: hit.length === 1
          ? `One soft slot tonight, and ${hit[0].name} is in it.`
          : `${hit.length} soft slots tonight.`,
        damage: damage > 0 ? `Spot damage ${damage.toFixed(0)}.` : null,
        rows: hit.map((b) => {
          const role = clean(b.raw?.game_pick_role, '').split('/')[0].trim().toUpperCase()
          const why = clean(b.raw?.pitcher_spot_damage_reason, '') || clean(b.weak_spot_reason, '')
          const l5hr = n(b.raw?.last5_hr, 0)
          // The platoon half of the read: does this hitter stand on the side
          // the arm is actually weak to? The bot's tag is a SECOND reason when
          // it agrees -- shown, never scored.
          const weak = clean(e.pitcher_weak_side, '')
          const onWeakSide = (weak === 'LHB' && b.bats === 'L') || (weak === 'RHB' && b.bats === 'R')
          return {
            key: b.player_id ?? b.name,
            spot: `#${b.lineup_spot ?? '—'}`, name: b.name, side: `${b.bats}HB`,
            flag: onWeakSide ? 'HIS SIDE' : null, tag: role || null, edge: onWeakSide,
            value: n(b.hr_score, 0) > 0 ? n(b.hr_score, 0).toFixed(0) : '—',
            extra: l5hr > 0 ? `${l5hr} L5` : null,
            why: why || null,
            onClick: b.raw ? () => onPlayerClick?.(b.raw) : null,
          }
        }),
      }
    })} />
  )
}
