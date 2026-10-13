// THE DUAL CARD'S STRESS SET: 12 TEST models (made-up clubs, made-up prices, made-up why lines; the player names are only SHAPES: the longest and the
// oddest real-world name lengths, used as text and nothing else). Used by scripts/check-dual-sizing.mjs and the before/after render.
//   import { stressSet } from './proto-cards/dualStressFixtures.mjs'  ->  [{ id, what, d }]
const brand = { name: 'LAMP' }
const m = (name, o = {}) => ({
  sport: 'nhl', brand, playerId: 't', name, team: 'AAA', opp: 'BBB', home: null, pos: 'C', number: 11, status: 'called', why: 'TEST: shoots a lot and the matchup is soft tonight',
  face: '', logo: '', logoPlate: false, tone: null, gameDate: '2026-10-13', startAt: '2026-10-13T23:00:00Z', ...o,
})
const price = (best, books = 6) => ({ best, books })
const base = (o = {}) => ({
  sport: 'nhl', brandName: 'LAMP', market: 'anytime goal', dayWord: 'TUE OCT 13', lane: 'donovan', label: "ADMIN'S TWO-MAN", rule: '0.5 unit · both legs must land',
  legs: [{ m: m('Test Skater One'), price: price('+160') }, { m: m('Test Skater Two', { status: 'board', why: 'TEST: second line, power play time' }), price: price('+180', 4) }],
  price: '+420', serial: { n: 4, of: 4, caption: "ADMIN'S TWO-MAN NO." }, ...o,
})
const LONGWHY = 'TEST: a very long strip of words about how often he shoots, how soft the other goalie is, how the power play unit is set up, and the line he plays on tonight with two more clauses'
export const stressSet = () => [
  { id: '01-typical', what: 'a typical entry', d: base() },
  { id: '02-long-names', what: 'long names (Brandsegg-Nygard, Jean-Gabriel Pageau)', d: base({ legs: [{ m: m('Michael Brandsegg-Nygard'), price: price('+160') }, { m: m('Jean-Gabriel Pageau', { status: 'board' }), price: price('+180', 4) }] }) },
  { id: '03-short-and-long', what: 'one short name, one very long name (Moritz Seider / hyphenated triple)', d: base({ legs: [{ m: m('Moritz Seider', { pos: 'D' }), price: price('+260') }, { m: m('Alexandre Carrier-Vanderbilt Smith', { pos: 'LW' }), price: price('+310', 3) }] }) },
  { id: '04-long-card-name', what: 'a 28-character custom card name', d: base({ label: 'FRIDAY NIGHT SPECIAL HEATERS' }) },
  { id: '05-late-long-name', what: 'LATE + a 28-character custom card name, no serial', d: base({ lane: 'donovan_late', label: 'LATE · FRIDAY NIGHT SPECIAL HEATERS', serial: null }) },
  { id: '06-long-prices', what: 'long prices (+1550 legs, +12480 combined)', d: base({ legs: [{ m: m('Test Skater One'), price: price('+1550', 12) }, { m: m('Test Skater Two'), price: price('+1990', 9) }], price: '+12480' }) },
  { id: '07-long-why', what: 'long stat strips (300 characters)', d: base({ legs: [{ m: m('Test Skater One', { why: LONGWHY }), price: price('+160') }, { m: m('Test Skater Two', { why: LONGWHY + ' ' + LONGWHY }), price: price('+180', 4) }] }) },
  { id: '08-long-clubs', what: 'long club and opponent names (two or three lines if drawn in full)', d: base({ legs: [{ m: m('Test Skater One', { team: 'Carolina Hurricanes', opp: 'Columbus Blue Jackets' }), price: price('+160') }, { m: m('Test Skater Two', { team: 'Vegas Golden Knights', opp: 'Utah Mammoth', home: false }), price: price('+180', 4) }] }) },
  { id: '09-bare', what: 'no prices, no why, no serial, no combined price', d: base({ price: null, serial: null, legs: [{ m: m('Test Skater One', { why: null }), price: null }, { m: m('Test Skater Two', { why: null, status: 'off' }), price: null }] }) },
  { id: '10-big-serial', what: 'a three-digit serial (No. 128 of 214)', d: base({ serial: { n: 128, of: 214, caption: "ADMIN'S TWO-MAN NO." } }) },
  { id: '11-mixed', what: 'one priced leg, one not; a leg off the board', d: base({ price: null, legs: [{ m: m('Test Skater One'), price: price('+160') }, { m: m('Test Skater Two', { status: 'off', pos: null, number: null }), price: null }] }) },
  { id: '12-everything-long', what: 'every long thing at once', d: base({ label: 'LATE · FRIDAY NIGHT SPECIAL HEATERS', serial: null, price: '+12480', legs: [{ m: m('Michael Brandsegg-Nygard', { team: 'Carolina Hurricanes', opp: 'Columbus Blue Jackets', why: LONGWHY }), price: price('+1550', 12) }, { m: m('Alexandre Carrier-Vanderbilt Smith', { team: 'Vegas Golden Knights', opp: 'Utah Mammoth', status: 'board', why: LONGWHY }), price: price('+1990', 9) }] }) },
]
