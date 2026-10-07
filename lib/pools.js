// THE POOLS THE SITE SHOWS (2026-10-07, owner decision, final): only the
// OLD-RECIPE three-man pools -- the eight halves of the four legacy six-man
// parents -- and the pairs. Everything else the bot still publishes
// (pools_3man, pools_4man, the retired pools_6man, the six-man legacy parents
// in pools_6man_legacy) is NOT shown anywhere. The keys stay in the files the
// site reads, so records keep reading them; they are simply never drawn.
//
// The bot publishes, in current/pair_builder_latest.json:
//   pools_3man_legacy[]  'Pool A1'..'Pool D2', each { name, parent, model_version,
//                        size: 3, pool_score, risk, tags, reason, players[], locked }
// and in graded_results_<date>.json -> pair_pool_results:
//   pool3_legacy[]       { label: 'OLD-RECIPE 3-MAN Pool A1', hr_count, total_count,
//                        homer_names, void_names, bar_label, primary, hit_2plus,
//                        model_version }
// A missing or empty key means "not published yet"; nothing here invents a pool.
import { arr, n, clean } from './player'

export const LEGACY_LABEL = 'OLD-RECIPE 3-MAN'
// 'OLD-RECIPE 3-MAN Pool A1' / 'Pool A1' -> 'A1'
export const poolTag = (s) => String(s || '').replace(/^OLD-RECIPE 3-MAN\s+/i, '').replace(/^Pool\s+/i, '').trim()

const lc = (s) => String(s || '').toLowerCase().trim()

/**
 * The old-recipe pools as one list of rows, in A1..D2 order. The pregame file
 * supplies the roster and the bot's own words; the graded file (once it has
 * the pool) supplies the result. A graded pool the pregame file no longer
 * carries still shows, from what the graded row has.
 */
export function legacyPoolRows(pairBuilder, results) {
  const pre = arr(pairBuilder?.pools_3man_legacy)
  const graded = arr(results?.pair_pool_results?.pool3_legacy)
  const gByTag = new Map(graded.map((g) => [poolTag(g?.label ?? g?.name), g]))
  const seen = new Set()
  const rows = []
  const build = (p, g, tag) => {
    const legs = arr(p?.players).length ? arr(p.players) : arr(g?.players)
    const homered = new Set(arr(g?.homer_names).map(lc))
    const voided = new Set(arr(g?.void_names).map(lc))
    const total = n(g?.total_count, 0) || legs.length || 3
    return {
      tag,
      parent: clean(p?.parent ?? g?.parent, ''),
      players: legs,
      score: Number.isFinite(Number(p?.pool_score)) ? Number(p.pool_score) : null,
      risk: clean(p?.risk, ''),
      tags: arr(p?.tags).join(' · '),
      reason: clean(p?.reason, ''),
      locked: p?.locked === true,
      graded: !!g,
      hr: g ? n(g.hr_count, 0) : 0,
      total,
      need: 2,
      barLabel: clean(g?.bar_label, ''),
      hit: g?.hit_2plus === true || g?.hit_2plus === 1,
      homered, voided,
      homerNames: arr(g?.homer_names),
      voidNames: arr(g?.void_names),
    }
  }
  pre.forEach((p, i) => { const tag = poolTag(p?.name) || `#${i + 1}`; seen.add(tag); rows.push(build(p, gByTag.get(tag), tag)) })
  gByTag.forEach((g, tag) => { if (!seen.has(tag)) rows.push(build(null, g, tag)) })
  return rows.sort((a, b) => String(a.tag).localeCompare(String(b.tag), 'en', { numeric: true }))
}

/** A pool row in the shape the PNG share card and the live wire already read. */
export const poolAsCard = (r) => ({
  label: `${LEGACY_LABEL} Pool ${r.tag}`, players: r.players, hr_count: r.hr,
  total_count: r.total, bar: r.need, homer_names: r.homerNames,
})
