// TEST TILES for the top-three card (pure data; every name says "Test"; no number is a real event). Used by scripts/check-top-three-card.mjs (the stress renders and
// the measure) and scripts/render-top-three-cards.mjs (a card with no real example prints TEST DATA). Never imported by production code.
const tile = (o) => ({ name: 'Test Skater', team: 'TST', opp: 'EXA', home: true, club: 'Test Club', face: '', logo: '', logoPlate: false, tone: null, tier: 'star', holo: false, shimmer: true, line: 'OT GOAL', ...o })

export const TEST_LEGEND = tile({ name: 'Test Legend', tier: 'legend', holo: true, shimmer: false, line: '212 RUSH YDS', club: 'Test Club Bears' })
export const TEST_ELITE = tile({ name: 'Test Skater', tier: 'elite', holo: true, shimmer: false, line: 'HAT TRICK · 3 G' })
export const TEST_STAR = tile({ name: 'Test Winger', tier: 'star', line: 'OT GOAL', home: false })
export const TEST_STAR_2 = tile({ name: 'Test Playmaker', tier: 'star', line: '3-POINT NIGHT · 1 G 2 A' })

/** The worst strings the fixtures could carry: a 40-character hyphenated name, a 7-assist line, a long club, a 4-digit price. */
export const TEST_STRESS = [
  tile({ name: 'Test Maximilian Featherstonehaugh-Villanueva', tier: 'legend', holo: true, shimmer: false, line: '5-POINT NIGHT · 2 G 3 A', club: 'Test Club With A Very Long Name Indeed', opp: 'EXAMPLE' }),
  tile({ name: 'Test Jean-Gabriel Pageau-Brandsegg-Nygard', tier: 'elite', holo: true, shimmer: false, line: 'LONG SHOT · +2150', home: null, opp: 'EXA' }),
  tile({ name: 'W', tier: 'star', line: '7-POINT NIGHT · 3 G 4 A', opp: '' }),
]

export const TEST_MODEL = (sport = 'nhl', tiles = [TEST_ELITE, TEST_STAR, TEST_STAR_2], title = null) => ({
  sport, brand: { sport, name: { nhl: 'LAMP', mlb: 'MOONSHOT', nfl: 'TUDDY' }[sport], league: sport.toUpperCase() },
  title: title || `TOP ${tiles.length} ${sport === 'nfl' ? 'TODAY' : 'TONIGHT'}`, dayWord: 'Oct 12', tiles, test: true, note: '',
})
