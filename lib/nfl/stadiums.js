// TUDDY'S STADIUMS (2026-10-02). The building each club plays its home games
// in, 2026 season -- the 3D Field names where the game is (components/nfl/
// FieldArena.js). Donovan 10-02: every sport but baseball "just show whatever
// building they are at, no need for the changing stadiums" -- so this is the
// NAME, not a per-team model; MOONSHOT keeps its real ballparks. Shared
// buildings are one entry under both clubs.
const SOFI = { name: 'SoFi Stadium' }
const METLIFE = { name: 'MetLife Stadium' }

export const NFL_STADIUMS = {
  ARI: { name: 'State Farm Stadium' },
  ATL: { name: 'Mercedes-Benz Stadium' },
  BAL: { name: 'M&T Bank Stadium' },
  BUF: { name: 'Highmark Stadium' },   // the new building, 2026
  CAR: { name: 'Bank of America Stadium' },
  CHI: { name: 'Soldier Field' },
  CIN: { name: 'Paycor Stadium' },
  CLE: { name: 'Huntington Bank Field' },
  DAL: { name: 'AT&T Stadium' },
  DEN: { name: 'Empower Field at Mile High' },
  DET: { name: 'Ford Field' },
  GB: { name: 'Lambeau Field' },
  HOU: { name: 'NRG Stadium' },
  IND: { name: 'Lucas Oil Stadium' },
  JAX: { name: 'EverBank Stadium' },
  KC: { name: 'GEHA Field at Arrowhead Stadium' },
  LV: { name: 'Allegiant Stadium' },
  LAC: SOFI,
  LA: SOFI,
  MIA: { name: 'Hard Rock Stadium' },
  MIN: { name: 'U.S. Bank Stadium' },
  NE: { name: 'Gillette Stadium' },
  NO: { name: 'Caesars Superdome' },
  NYG: METLIFE,
  NYJ: METLIFE,
  PHI: { name: 'Lincoln Financial Field' },
  PIT: { name: 'Acrisure Stadium' },
  SF: { name: "Levi's Stadium" },
  SEA: { name: 'Lumen Field' },
  TB: { name: 'Raymond James Stadium' },
  TEN: { name: 'Nissan Stadium' },
  WAS: { name: 'Northwest Stadium' },
}
/** The building a team plays its home games in, or null. */
export const stadiumOf = (team) => NFL_STADIUMS[String(team || '').toUpperCase()] || null

// A slate's venue string can carry a building's old name (the feed still says
// "Reliant Stadium" for NRG, renamed 2014); the current name is shown.
export const FORMER_NAMES = {
  'Reliant Stadium': 'NRG Stadium',
  'FedExField': 'Northwest Stadium', 'FedEx Field': 'Northwest Stadium',
  'Heinz Field': 'Acrisure Stadium', 'TIAA Bank Field': 'EverBank Stadium',
  'Paul Brown Stadium': 'Paycor Stadium', 'Cleveland Browns Stadium': 'Huntington Bank Field',
  'FirstEnergy Stadium': 'Huntington Bank Field', 'Mercedes-Benz Superdome': 'Caesars Superdome',
  'Arrowhead Stadium': 'GEHA Field at Arrowhead Stadium', 'Broncos Stadium at Mile High': 'Empower Field at Mile High',
}
export const currentName = (name) => FORMER_NAMES[name] || name
