// BUCKETS' numerology rows (LAMP's lib/nhl/alignRows.js, 2026-10-05): each player's own
// numbers (the /api/buckets/numerology roots) with his PTS score from the night's board --
// shared by the Numerology tab, so 'lining up' means one thing.
import { nameParts } from '../namePatterns'
import { alignModel, alignedWithBy } from '../numerology/align'

export const bucketsScoreOf = (a) => (Number.isFinite(a.score) ? a.score : null)

export function bucketsAlignModel(numerology, board) {
  const scores = new Map()
  for (const r of board?.rows || []) if (Number.isFinite(r.score)) scores.set(String(r.playerId), r.score)
  const rows = (numerology?.all || []).map((r) => ({
    pid: r.id, name: r.name, team: r.team, p: r, jersey: r.jersey, birthDate: r.birthDate,
    axes: r.roots || {}, parts: nameParts(r.name), score: scores.has(String(r.id)) ? scores.get(String(r.id)) : null,
  }))
  return alignModel(rows, bucketsScoreOf)
}

/** Tonight's carriers: 2+ of his own numbers on the date's root, best PTS score first. */
export const bucketsTonight = (numerology, model) => (numerology?.dateRoot ? alignedWithBy(numerology.dateRoot, model.rows, bucketsScoreOf) : null)
