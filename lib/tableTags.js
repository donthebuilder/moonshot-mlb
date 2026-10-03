// ── IDENTITY TAGS FOR THE V2 TABLE (2026-10-01, BATCH-TABLE-SKIN-V2 step 4b) ──
// The facts every TUDDY / LAMP table shares, set once in its sport wrapper
// (components/nfl/NflTable.js, components/lamp/LampTable.js) instead of per
// tab: the club columns draw the logo, and the who-columns (position, club,
// opponent) fold into the phone sub-line under the name. All of it is read
// ONLY by the v2 skin (components/table/v2.js) -- the classic table ignores
// these fields, so it stays byte-identical. A table's own `group` / `logo` /
// `fold` always wins; nothing here overrides a column that already said.
//
// Column GROUPS are per table (a group's name is a judgement about that
// table), so they are not guessed here: see each board's own column set.
const FOLD_KEYS = new Set(['pos', 'position', 'team', 'tm', 'opp', 'oppTxt', 'vs'])
const LOGO_KEYS = new Set(['team', 'tm', 'opp'])
// 2-4 letters: ESPN's NBA codes include UTAH (2026-10-02); every other sport's are 2-3
const CODE_RE = /^[A-Z]{2,4}$/

/** columns -> the same columns, with v2-only identity tags for `sport` ('nfl' | 'nhl' | 'nba'). */
export function tagIdentity(columns, sport, rows = []) {
  if (!Array.isArray(columns)) return columns
  // a column is a club column only when its values really are club codes
  const isCodes = (key) => {
    // a '—' (a bye week, no opponent) is an empty cell, not a reason to drop the column's logos
    const vs = rows.slice(0, 12).map((r) => r?.[key]).filter((v) => v != null && v !== '' && v !== '—')
    return vs.length > 0 && vs.every((v) => CODE_RE.test(String(v)))
  }
  return columns.map((c) => {
    if (!c || c.sticky) return c
    const out = { ...c }
    if (out.fold == null && c.heat === false && FOLD_KEYS.has(c.key)) out.fold = true
    if (out.logo == null && !c.teamMark && LOGO_KEYS.has(c.key) && isCodes(c.key)) out.logo = sport
    return out
  })
}
