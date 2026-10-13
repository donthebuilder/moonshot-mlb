// THE N-MAN CARD'S STRESS SET: TEST models (made-up clubs, made-up prices; the player names are only SHAPES: the longest and the oddest real-world name lengths, used as text and
// nothing else). Used by scripts/check-nman-card.mjs and the render of the PNGs for Donovan.
//   import { stressSet } from './proto-cards/nManStressFixtures.mjs'  ->  [{ id, what, d }]
import { comboOf } from '../../lib/card/picker.js'
import { fmtAmerican } from '../../lib/card/core.js'

const brand = { name: 'LAMP' }
const m = (name, o = {}) => ({
  sport: 'nhl', brand, playerId: `t-${name}`, name, team: 'AAA', opp: 'BBB', home: null, pos: 'C', number: 11, status: 'called', why: null,
  face: '', logo: '', logoPlate: false, tone: null, gameDate: '2026-10-13', startAt: '2026-10-13T23:00:00Z', ...o,
})
/** A leg: best = the American price number (or null for no stored price), books = how many listed it. */
const leg = (name, best = 160, books = 6, o = {}, outcome = null) => ({
  m: m(name, o), price: best == null ? null : { best: fmtAmerican(best), books }, raw: best == null ? null : { best, median: best }, outcome, market: 'anytime goal',
})
const NAMES = ['Test Skater One', 'Test Skater Two', 'Test Skater Three', 'Test Skater Four', 'Test Skater Five', 'Test Skater Six']
const LONG = ['Michael Brandsegg-Nygard', 'Jean-Gabriel Pageau', 'Alexandre Carrier-Vanderbilt Smith', 'Moritz Seider', 'Test Maximilian Featherstonehaugh-Villanueva', 'Oliver Bjorkstrand']
const base = (legs, o = {}) => {
  const c = comboOf(legs.map((l) => l.raw))
  return {
    sport: 'nhl', brandName: 'LAMP', market: 'anytime goal', dayWord: 'TUE OCT 13', lane: 'donovan', label: `ADMIN'S ${legs.length}-MAN`, rule: '0.5 unit · every leg must land',
    legs, combined: { text: c.best != null ? fmtAmerican(c.best) : null, all: c.all, priced: c.priced, n: c.n }, serial: { n: 4, of: 4, caption: 'N-MAN NO.' }, graded: null, ...o,
  }
}
const typical = (n) => Array.from({ length: n }, (_, i) => leg(NAMES[i], 160 + i * 20, 6 - (i % 3)))
const graded = (legs, outcomes, result) => ({ legs: legs.map((l, i) => ({ ...l, outcome: outcomes[i] })), graded: { result, landed: outcomes.filter((o) => o === 'cashed').length, of: outcomes.length } })
export const stressSet = () => {
  const t6 = typical(6)
  const longLegs = LONG.map((n, i) => leg(n, 160 + i * 30, 4 + i, { pos: i % 2 ? 'LW' : 'D' }))
  const clubs = LONG.map((n, i) => leg(n, 200, 9, { team: ['Carolina Hurricanes', 'Vegas Golden Knights', 'Columbus Blue Jackets', 'Tampa Bay Lightning', 'Utah Mammoth', 'Montreal Canadiens'][i], opp: ['Columbus Blue Jackets', 'Utah Mammoth', 'Carolina Hurricanes', 'Vegas Golden Knights', 'Montreal Canadiens', 'Tampa Bay Lightning'][i], home: i % 2 === 0 ? false : null }))
  const bigPrices = NAMES.map((n, i) => leg(n, 1550 + i * 90, 12 - i))
  const g6 = graded(t6, ['cashed', 'cashed', 'cashed', 'cashed', 'cashed', 'cashed'], 'cashed')
  const gm = graded(longLegs, ['cashed', 'cashed', 'missed', 'cashed', 'cashed', 'cashed'], 'missed')
  const gv = graded(typical(4), ['cashed', 'dnp', 'cashed', 'missed'], 'void')
  return [
    { id: '01-six-typical', what: 'a typical 6-man', d: base(t6) },
    { id: '02-five', what: 'a 5-man', d: base(typical(5)) },
    { id: '03-four', what: 'a 4-man', d: base(typical(4)) },
    { id: '04-three', what: 'a 3-man (one tile alone in its row)', d: base(typical(3)) },
    { id: '05-two', what: 'two legs (the table accepts 2..6)', d: base(typical(2)) },
    { id: '06-long-names', what: 'six long names (Brandsegg-Nygard, Featherstonehaugh-Villanueva ...)', d: base(longLegs) },
    { id: '07-long-prices', what: 'long prices: +1550.. legs with 12 books, a combined price of seven digits', d: base(bigPrices) },
    { id: '08-long-clubs', what: 'long club names and the away mark', d: base(clubs) },
    { id: '09-not-all-priced', what: 'two legs with no stored price: NOT ALL PRICED', d: base([leg(NAMES[0], 160), leg(NAMES[1], null), leg(NAMES[2], 180), leg(NAMES[3], null), leg(NAMES[4], 150), leg(NAMES[5], 170)]) },
    { id: '10-none-priced', what: 'no stored price on any leg', d: base(NAMES.map((n) => leg(n, null))) },
    { id: '11-long-card-name', what: 'a 28-character card name beside the serial', d: base(t6, { label: 'FRIDAY NIGHT SPECIAL HEATERS' }) },
    { id: '12-late-long-name', what: 'LATE + a 28-character card name, no serial', d: base(t6, { lane: 'donovan_late', label: 'LATE · FRIDAY NIGHT SPECIAL HEATERS', serial: null }) },
    { id: '13-big-serial', what: 'a three-digit serial (No. 128 of 214)', d: base(t6, { serial: { n: 128, of: 214, caption: 'N-MAN NO.' } }) },
    { id: '14-graded-cashed', what: 'GRADED: all six landed', d: base(g6.legs, { graded: g6.graded }) },
    { id: '15-graded-missed', what: 'GRADED: five of six landed (one MISSED), long names', d: base(gm.legs, { graded: gm.graded }) },
    { id: '16-graded-void', what: 'GRADED: a man did not play (VOID), a 4-man', d: base(gv.legs, { graded: gv.graded }) },
    { id: '17-everything-long', what: 'every long thing at once (long names, clubs, prices, card name, serial)', d: base(LONG.map((n, i) => leg(n, 1550 + i * 90, 12, { team: clubs[i].m.team, opp: clubs[i].m.opp, pos: 'LW', number: 88 })), { label: 'LATE · FRIDAY NIGHT SPECIAL HEATERS', serial: null }) },
  ]
}
