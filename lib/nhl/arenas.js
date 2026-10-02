// LAMP'S ARENAS (2026-10-02). The arena each club plays its home games in,
// 2026-27 season -- the 3D rink names where the game is (components/lamp/
// RinkArena.js). Donovan 10-02: every sport but baseball "just show whatever
// building they are at, no need for the changing stadiums" -- so this is the
// NAME, not a per-team model. Names change with sponsors; these are 2026-27's.
export const NHL_ARENAS = {
  ANA: { name: 'Honda Center' },
  BOS: { name: 'TD Garden' },
  BUF: { name: 'KeyBank Center' },
  CAR: { name: 'Lenovo Center' },
  CBJ: { name: 'Nationwide Arena' },
  CGY: { name: 'Scotiabank Saddledome' },
  CHI: { name: 'United Center' },
  COL: { name: 'Ball Arena' },
  DAL: { name: 'American Airlines Center' },
  DET: { name: 'Little Caesars Arena' },
  EDM: { name: 'Rogers Place' },
  FLA: { name: 'Amerant Bank Arena' },
  LAK: { name: 'Crypto.com Arena' },
  MIN: { name: 'Grand Casino Arena' },
  MTL: { name: 'Bell Centre' },
  NJD: { name: 'Prudential Center' },
  NSH: { name: 'Bridgestone Arena' },
  NYI: { name: 'UBS Arena' },
  NYR: { name: 'Madison Square Garden' },
  OTT: { name: 'Canadian Tire Centre' },
  PHI: { name: 'Xfinity Mobile Arena' },
  PIT: { name: 'PPG Paints Arena' },
  SEA: { name: 'Climate Pledge Arena' },
  SJS: { name: 'SAP Center' },
  STL: { name: 'Enterprise Center' },
  TBL: { name: 'Benchmark International Arena' },
  TOR: { name: 'Scotiabank Arena' },
  UTA: { name: 'Delta Center' },
  VAN: { name: 'Rogers Arena' },
  VGK: { name: 'T-Mobile Arena' },
  WSH: { name: 'Capital One Arena' },
  WPG: { name: 'Canada Life Centre' },
}
/** The arena a club plays its home games in, or null. */
export const arenaOf = (team) => NHL_ARENAS[String(team || '').toUpperCase()] || null
