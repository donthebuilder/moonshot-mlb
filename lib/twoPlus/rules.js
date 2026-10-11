// THE 2+ RULES, ONE PLACE (TWO-SCORE batch, 2026-10-11).
//
// DECISION (Donovan, via the coordinator, 2026-10-11): when a player's ANYTIME price is SHORTER than
//   NFL anytime TD          -300   (-301 and shorter checks the 2+ TD market; -300 itself stays anytime)
//   MLB HR / hit-type       -300   (same cut; 2+ HR or 2+ hits)
//   NHL anytime goal        -150   (-151 and shorter looks for the 2+ goals lens)
// the 2+ market is checked. (First asked at -200; Donovan moved it to -300 / -150.)
//
// The Card's straight floor (+120) and Two-Man floor (+500) belong to the Card rules builder's config
// (not on origin/main when this was written); STRAIGHT_FLOOR below is a labelled COPY of +120 used only by
// the pure trigger. When that config lands, import it here and delete the copy. Goals are EXEMPT from the
// straight floor (Donovan) and are tracked, not carded, by default (`cardable: false`).
//
// Sports are a table, never a ternary (lib/routes.js rule).
export const TWO_PLUS = Object.freeze({
  nfl: Object.freeze({ trigger: -300, label: '2+ TD', anytime: 'Anytime TD', floorExempt: false, cardable: true, model_version: 'td2_site_v1', model_id: 'tuddy-td2' }),
  mlb: Object.freeze({ trigger: -300, label: '2+ HR', anytime: 'HR', floorExempt: false, cardable: true, model_version: null, model_id: null }),
  nhl: Object.freeze({ trigger: -150, label: '2+ goals', anytime: 'Anytime goal', floorExempt: true, cardable: false, model_version: 'goal2_site_v1', model_id: 'lamp-goal2' }),
})
export const STRAIGHT_FLOOR = 120   // COPY of the Card rules builder's straight floor; replace with the import when it lands

/** Whether the odds tick STORES a 2+ price for the sport. Today it stores only the anytime yes/no (lib/odds/snap.js MARKETS: one market per league)
 *  and a handful of over/under lines (lib/odds/lines.js EXTRA): no 2+ TD, 2+ HR/hits or 2+ goals. Flip a sport only when its rows exist. */
export const PRICES_STORED = Object.freeze({ nfl: false, mlb: false, nhl: false })
