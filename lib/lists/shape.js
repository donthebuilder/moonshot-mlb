// ONE LIST-POST SHAPE (BATCH-LIST-POSTS step 1, 2026-09-27). Every list
// builder (lib/lists/{mlb,nfl,nhl}.js) returns
//   { sport, kind, title, rows: [{ id, name, team, fact }], footnote, source, asOf }
// and every list posts through one template. Every name and number is the
// league's own data, computed, never typed; a row that cannot be re-verified
// at post time is dropped, and a list under MIN_ROWS does not post.

export const MIN_ROWS = 2
const X_MAX = 280

/**
 * The post: the title, then rows WITH a fact one per line ("Matt Olson (939
 * consecutive games)"), then the rows without one on a single ' · ' line, then
 * the footnote. No link. Trims the fact-less line before it ever cuts a name
 * with a fact, and says how many were left off.
 */
export function listText(list) {
  if (!list || (list.rows || []).length < MIN_ROWS) return null
  const withFact = list.rows.filter((r) => r.fact)
  const bare = list.rows.filter((r) => !r.fact).map((r) => r.name)
  const head = [list.title, ...withFact.map((r) => `${r.name} (${r.fact})`)]
  const foot = list.footnote ? [list.footnote] : []
  const build = (names, more) => [...head, ...(names.length ? [names.join(' · ') + (more ? ` · +${more} more` : '')] : []), ...foot].join('\n')
  for (let keep = bare.length; keep >= 0; keep -= 1) {
    const t = build(bare.slice(0, keep), bare.length - keep)
    if (t.length <= X_MAX) return t
  }
  // A RANKED list (a "most" list, sorted by the builder) may lose names from
  // the bottom to fit, never below MIN_ROWS. A club / "everyone who" list is
  // never trimmed: a partial club would be a false list, so it does not post.
  if (list.ranked && withFact.length > MIN_ROWS) return listText({ ...list, rows: [...withFact.slice(0, -1), ...list.rows.filter((r) => !r.fact)] })
  return null
}

/** Pure: keep only the rows the re-check confirms (ids in `ok`); null under MIN_ROWS. */
export function verified(list, ok) {
  if (!list) return null
  const rows = list.rows.filter((r) => ok.has(String(r.id)))
  return rows.length >= MIN_ROWS ? { ...list, rows } : null
}
