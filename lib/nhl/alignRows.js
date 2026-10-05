// LAMP's numerology rows (moved out of components/lamp/tabs/Numerology.js,
// 2026-10-04): every dressed skater's own numbers (the /api/lamp/numerology roots)
// with his goal score from the night's board -- shared by the Numerology tab and
// Home's TONIGHT strip, so 'lining up' can never mean two things.
import { nameParts } from '../namePatterns'
import { alignModel, alignedWithBy } from '../numerology/align'

export const lampScoreOf = (a) => (Number.isFinite(a.score) ? a.score : null)

export function lampAlignModel(numerology, board) {
  const scores = new Map()
  for (const g of board?.games || []) for (const r of g.rows || []) if (Number.isFinite(r.score)) scores.set(Number(r.playerId), r.score)
  const rows = (numerology?.all || []).map((r) => ({
    pid: r.id, name: r.name, team: r.team, p: r, jersey: r.jersey, birthDate: r.birthDate,
    axes: r.roots || {}, parts: nameParts(r.name), score: scores.has(Number(r.id)) ? scores.get(Number(r.id)) : null,
  }))
  return alignModel(rows, lampScoreOf)
}

/** Tonight's carriers: 2+ of his own numbers on the date's root, best goal score first. */
export const lampTonight = (numerology, model) => (numerology?.dateRoot ? alignedWithBy(numerology.dateRoot, model.rows, lampScoreOf) : null)
