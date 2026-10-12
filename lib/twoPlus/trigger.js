// THE 2+ TRIGGER, PURE. An anytime price shorter than the sport's cut (lib/twoPlus/rules.js) sends the player to the
// 2+ market; a Card straight is allowed only when ALL hold: the sport is cardable, a REAL stored 2+ price exists, it
// clears the straight floor (unless the sport is exempt), and he ranks in the top third of our 2+ board. Otherwise he
// is TRACKED, not carded. No 2+ price posted = no Card straight, ever (nothing is guessed). Information only.
import { TWO_PLUS, STRAIGHT_FLOOR } from './rules'
import { tdBoardCut } from '../callStatus'

const am = (v) => { const n = Number(v); return v != null && v !== '' && Number.isInteger(n) && n !== 0 ? n : null }

/** American price strictly shorter than the cut: -301 vs -300 true, -300 false, +150 false. */
export function shorterThanCut(sport, anytime) {
  const rule = TWO_PLUS[sport]; const p = am(anytime)
  return Boolean(rule && p != null && p < 0 && p < rule.trigger)
}

/**
 * @param {{ sport:'nfl'|'mlb'|'nhl', anytime:number|null, twoPrice:number|null, rank:number|null, of:number|null, floor?:number }} x
 * @returns {{ check2:boolean, card:boolean, tracked:boolean, why:string }}
 */
export function twoPlusDecision({ sport, anytime, twoPrice, rank, of, floor = STRAIGHT_FLOOR }) {
  const rule = TWO_PLUS[sport]
  if (!rule) return { check2: false, card: false, tracked: false, why: 'no 2+ rule for this sport' }
  if (!shorterThanCut(sport, anytime)) return { check2: false, card: false, tracked: false, why: 'stays an anytime price' }
  const p = am(twoPrice)
  if (p == null) return { check2: true, card: false, tracked: true, why: `no ${rule.label} price posted: tracked, not carded` }
  if (!rule.cardable) return { check2: true, card: false, tracked: true, why: `${rule.label}: tracked, not carded by default` }
  if (!rule.floorExempt && p < floor) return { check2: true, card: false, tracked: true, why: `${rule.label} price under the straight floor: tracked, not carded` }
  const cut = tdBoardCut(of)
  if (!(rank > 0 && cut != null && rank <= cut)) return { check2: true, card: false, tracked: true, why: `not in the top third of our ${rule.label} board: tracked, not carded` }
  return { check2: true, card: true, tracked: false, why: `${rule.label} price clears the floor and he is in the top third of our board` }
}
