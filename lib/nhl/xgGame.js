// 🏒 lamp-xg-v1 at club level (2026-10-07): what one club is projected to score in one game,
// from MEASURED parts -- expected shot volume x xG a shot, scaled by the opposing goalie's quality,
// plus the empty-net goals a club scores a game. Pure. The constants (shrink K's) come from the
// held-out tuning in scripts/eval-lamp-xg-games.mjs and are stored in xgLampXgV1.js (goalie.tuned).
//
// WIRED INTO THE SLATE DIAL (2026-10-08, lamp-team-v1; Donovan: the expected number in every game projection
// comes from a team model). lib/nhl/teamProj.js runs this on the club-game rows (lib/nhl/teamXg.js) with the
// tuned numbers in lib/nhl/teamProjV1.js; scripts/eval-lamp-xg-games.mjs holds the held-out proof.
const shrink = (sum, n, mean, k) => (sum + k * mean) / (n + k)

/**
 * own     { n, sog, xg }  this club's last games: games, shots on goal taken, xG on them
 * against { n, sog, xg }  the opposing club's last games: shots on goal it ALLOWED, xG on them
 * league  { sog, xgPerSog }  per club-game means
 * k       { sog, q }      shrink strengths (games, shots)
 * goalieFactor            the opposing goalie's (GA + k) / (xGA + k), 1 = league average
 * emptyNet                empty-net goals a club-game
 * Returns { shots, xgPerShot, xg, goals }; goals = shots x xG a shot x goalieFactor + emptyNet.
 */
export function projectClub({ own, against, league, k, goalieFactor = 1, emptyNet = 0 }) {
  const sF = shrink(own.sog, own.n, league.sog, k.sog)
  const sA = shrink(against.sog, against.n, league.sog, k.sog)
  const shots = Math.max(5, league.sog + (sF - league.sog) + (sA - league.sog))
  const qF = shrink(own.xg, own.sog, league.xgPerSog, k.q)
  const qA = shrink(against.xg, against.sog, league.xgPerSog, k.q)
  const xgPerShot = league.xgPerSog * (qF / league.xgPerSog) * (qA / league.xgPerSog)
  return { shots, xgPerShot, xg: shots * xgPerShot, goals: shots * xgPerShot * goalieFactor + emptyNet }
}
