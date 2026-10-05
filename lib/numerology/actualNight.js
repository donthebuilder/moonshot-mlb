// WHAT ACTUALLY HAPPENED, NUMBER BY NUMBER (2026-10-04, Donovan: "the
// numerology ledger shows what is but not what actual is"). The Numerology
// page's Yesterday / Tonight boxes used to read a copy kept in ONE browser's
// storage (written only while the HR Ledger was open there), and only spoke once
// three homers shared a root -- so most visitors, and every one-homer night, saw
// nothing. This builds the night from the homers themselves (homer_feed, written
// by the homers tick with each hitter's jersey and birth date), for everyone,
// from the first homer.
//
// PURE: rows in, the night out. Each hitter's numbers -- jersey, birth day, life
// path, which homer of the season (or of the postseason) -- reduced the same way
// as everywhere else on the page (lib/numerology/core), each marked where it
// meets the DAY's number (core rootOfDigits on the date). A number whose field
// isn't there is left out, never guessed.
// rootOfDigits on a date = lib/alignments' dateDigitRoot, the same sum; core is server-safe (alignments is 'use client')
import { digitRoot, dayRootOf, lifePathOf, rootOfDigits } from './core'

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** One hitter's numbers from his homer rows (one row per homer that day, hr_n = 1, 2, ...). */
export function hitterAxes(rows, dateRoot) {
  const last = rows.reduce((a, r) => (num(r.hr_n) > num(a.hr_n) ? r : a), rows[0])
  const s = last.stats || {}
  const axes = []
  const add = (k, label, value, root) => { if (root) axes.push({ k, label, value, root, match: dateRoot != null && root === dateRoot }) }
  const jersey = num(s.jersey)
  if (jersey != null && jersey > 0) add('jersey', `#${jersey}`, jersey, digitRoot(jersey))
  if (s.birthDate) {
    const day = Number(String(s.birthDate).slice(8, 10))
    if (day) add('bday', `born ${day}`, day, dayRootOf(s.birthDate))
    const lp = lifePathOf(s.birthDate)
    if (lp) add('path', `path ${lp}`, lp, lp)   // lifePathOf is already reduced
  }
  // which homer it was: the postseason's own count in October, never added to
  // the regular-season total (the tick's post_nth); else the pregame season
  // count + this homer's place tonight
  if (s.postseason === true && num(s.post_nth)) add('nth', `postseason HR ${s.post_nth}`, num(s.post_nth), digitRoot(num(s.post_nth)))
  else if (s.postseason !== true && num(s.season_hr) != null && num(last.hr_n)) {
    const nth = num(s.season_hr) + num(last.hr_n)
    add('nth', `HR ${nth}`, nth, digitRoot(nth))
  }
  return { player_id: String(last.player_id), name: last.name, team: last.team || null, hr: rows.length, axes }
}

/** The night: { date, dateRoot, homers, hitters[], matched, topRoot: { root, n } | null }. */
export function actualNight(rows = [], date) {
  const dateRoot = rootOfDigits(date)
  const byPlayer = new Map()
  for (const r of rows || []) {
    if (r?.player_id == null) continue
    const k = String(r.player_id)
    if (!byPlayer.has(k)) byPlayer.set(k, [])
    byPlayer.get(k).push(r)
  }
  const hitters = [...byPlayer.values()].map((rs) => hitterAxes(rs, dateRoot))
    // the ones carrying the day's number first, then by how many of their numbers do
    .sort((a, b) => b.axes.filter((x) => x.match).length - a.axes.filter((x) => x.match).length || b.hr - a.hr || String(a.name).localeCompare(String(b.name)))
  const counts = new Map()
  // the night's leading root counts a hitter's OWN numbers (jersey, birth day, life path):
  // in October nearly every homer is 'postseason HR 1', which would make the night's root
  // 1 every night and say nothing (10-03: 9 of 9)
  for (const h of hitters) for (const r of new Set(h.axes.filter((x) => x.k !== 'nth').map((x) => x.root))) counts.set(r, (counts.get(r) || 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
  return {
    date, dateRoot,
    homers: (rows || []).length,
    hitters,
    matched: hitters.filter((h) => h.axes.some((x) => x.match)).length,
    topRoot: top ? { root: top[0], n: top[1] } : null,
  }
}
