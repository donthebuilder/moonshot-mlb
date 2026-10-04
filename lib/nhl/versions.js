// LAMP'S MODEL VERSIONS, BY DATE (2026-10-02, .claude-notes/LAMP-V3-DEFINITION.md).
// v3 (rookies scored) starts with games dated V3_FROM. Every writer stamps the
// version for the game's own date and every reader asks for it the same way,
// so a night locked under v2 reads as v2 forever and is never rewritten.
export const V3_FROM = '2026-10-03'
export const VERSIONS = {
  goal: ['lamp-goal-v2', 'lamp-goal-v3'],
  sog: ['lamp-sog-v1', 'lamp-sog-v2'],
  pts: ['lamp-pts-v1', 'lamp-pts-v2'],
  ast: ['lamp-ast-v1', 'lamp-ast-v2'],
  // SHADOW (2026-10-03, lib/nhl/goalPosModel.js): one version, from its first night
  goalpos: ['lamp-goalpos-v1', 'lamp-goalpos-v1'],
}
export const isV3 = (date) => String(date || '') >= V3_FROM
/** { goal, sog, pts, ast } -- the versions a game on `date` is locked and read under. */
export const versionsFor = (date) => Object.fromEntries(Object.entries(VERSIONS).map(([k, [a, b]]) => [k, isV3(date) ? b : a]))

