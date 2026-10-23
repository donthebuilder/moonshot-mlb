// LAMP'S MODEL VERSIONS, BY DATE (2026-10-02, .claude-notes/LAMP-V3-DEFINITION.md).
// v3 (rookies scored) starts with games dated V3_FROM. Every writer stamps the
// version for the game's own date and every reader asks for it the same way,
// so a night locked under v2 reads as v2 forever and is never rewritten.
//
// v4 (2026-10-17, Donovan): THIS SEASON ONLY. From games dated V4_FROM every pooled per-game
// rate (goal, shots, points, assists and the shadows fed by the same legs) uses the current
// season's line alone -- last season is no longer blended in. Nights locked under v3 stay v3
// and are never touched; a v4 night is a new set of rows (the primary keys carry the version).
// v5 (2026-10-23, Donovan: "handle these" on known issue 73): THE INJURY REPORT. From games dated V5_FROM a skater the
// league's injury report lists OUT or on injured reserve / suspended (lib/injuries BLOCKS, ESPN's report) is NOT SCORED: no
// leg, no score, not in tonight's percentile pool, NOT ON THE BOARD with the reason printed -- the same as a man the posted
// lineup leaves out, only known before the lineup posts. Before v5 the board scored the whole club roster until lineups
// posted, so a man out for a month could be CALLED (Nick Suzuki, 10-23, ESPN "Out, upper body"). Every market and shadow
// reads the same candidates, so every one gets a new version; v4 nights stay v4 and are never touched.
// Entries are oldest first; the CURRENT version is the LAST entry (CURRENT below).
export const V3_FROM = '2026-10-03'
export const V4_FROM = '2026-10-18'
export const V5_FROM = '2026-10-23'
export const VERSIONS = {
  goal: ['lamp-goal-v2', 'lamp-goal-v3', 'lamp-goal-v4', 'lamp-goal-v5'],
  sog: ['lamp-sog-v1', 'lamp-sog-v2', 'lamp-sog-v3', 'lamp-sog-v4'],
  pts: ['lamp-pts-v1', 'lamp-pts-v2', 'lamp-pts-v3', 'lamp-pts-v4'],
  ast: ['lamp-ast-v1', 'lamp-ast-v2', 'lamp-ast-v3', 'lamp-ast-v4'],
  // SHADOW (2026-10-03, lib/nhl/goalPosModel.js): one version from its first night; v2 = this season only (2026-10-17)
  goalpos: ['lamp-goalpos-v1', 'lamp-goalpos-v1', 'lamp-goalpos-v2', 'lamp-goalpos-v3'],
  // SHADOW (2026-10-10, .claude-notes/LAMP-GOALW-DEFINITION.md, lib/nhl/goalWeightedModel.js): the live legs, fitted weights + a defence flag
  goalw: ['lamp-goalw-v1', 'lamp-goalw-v1', 'lamp-goalw-v2', 'lamp-goalw-v3'],
  // NEW MODEL (2026-10-11, lib/nhl/goal2Model.js): 2+ goals, ranked from the goal legs + shooting %. Tracked, from its first night.
  goal2: ['goal2_site_v1', 'goal2_site_v1', 'goal2_site_v2', 'goal2_site_v3'],
  // SHADOW (2026-10-18, lib/nhl/goalCompositeModel.js): ONE composite score per skater per game (own rate + matchup + form + role/PP + rest/home), hidden, one version from its first night
  comp: ['lamp-goal-comp-v1', 'lamp-goal-comp-v1', 'lamp-goal-comp-v1', 'lamp-goal-comp-v1b'],   // v1b = v1 on the v5 pool (injury report)
  // SHADOW (2026-10-18, lib/nhl/goalComposite2Model.js): v1 plus xG shot quality, PP ice time / share, the opponent's rest. A NEW version beside v1 (v1 keeps its rows), one version from its first night
  comp2: ['lamp-goal-comp-v2', 'lamp-goal-comp-v2', 'lamp-goal-comp-v2', 'lamp-goal-comp-v2b'],   // v2b = v2 on the v5 pool
}
/** The current version of each market (the last entry): labels and "live" markers. Rows use versionsFor(date). */
export const CURRENT = Object.fromEntries(Object.entries(VERSIONS).map(([k, v]) => [k, v[v.length - 1]]))
export const isV3 = (date) => String(date || '') >= V3_FROM          // true for v4 dates too (the rookie rule stays)
export const isV4 = (date) => String(date || '') >= V4_FROM          // this season only (stays true on v5 dates)
export const isV5 = (date) => String(date || '') >= V5_FROM          // the injury report: OUT / IR not scored
/** { goal, sog, pts, ast, ... } -- the versions a game on `date` is locked and read under. */
export const versionsFor = (date) => Object.fromEntries(Object.entries(VERSIONS).map(([k, v]) => [k, v[isV5(date) ? 3 : isV4(date) ? 2 : isV3(date) ? 1 : 0]]))
