// SHARED "STAT, CLUB, LEAGUE, RANK" LINES (2026-10-10). Pure. Every sport's team page has a table of per-game numbers
// with the club's rank among the league; this is that table once: the rows (a stat and every club's value), the club's
// line out of them, and the columns a table draws. NHL builds its rows from the league report and the xG table, NFL from
// the standings and the week file's team_defense; neither re-implements the rank.
import { leagueRank, rankWord } from './contract'

/** rows: [{ key, group, label, dp, higherBetter, pct?, signed?, byClub: { [club]: value } }] -> one club's lines. */
export function clubLines(rows, club) {
  return rows.map((r) => {
    const vals = Object.values(r.byClub)
    const v = r.byClub[club] ?? null
    const known = vals.filter((x) => x != null)
    return {
      key: r.key, group: r.group, label: r.label, dp: r.dp, pct: Boolean(r.pct), signed: Boolean(r.signed), higherBetter: r.higherBetter, src: r.src || null,
      value: v, lg: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null,
      rank: leagueRank(vals, v, { higherBetter: r.higherBetter }),
    }
  })
}

export const STAT_COLS = [
  { key: 'label', label: 'Stat', plain: true, w: 124, heat: false, numeric: false, sticky: true, bold: true, group: 'Stat' },
  { key: 'val', label: 'Club', w: 56, heat: false, group: 'This season', fmt: (v, r) => r.valTxt },
  { key: 'lgv', label: 'Lg avg', w: 54, heat: false, group: 'This season', fmt: (v, r) => r.lgTxt },
  { key: 'rankN', label: 'Rank', w: 68, heat: false, group: 'Of 32', fmt: (v, r) => r.rankTxt },
  { key: 'pct', label: '%ile', w: 48, group: 'Of 32', dp: 0, primary: true, title: 'Share of the other clubs this club is better than on the stat' },
]
const shown = (l, v) => (v == null ? null : l.pct ? v * 100 : v)
export const txt = (l, v) => (v == null ? '—' : `${l.signed && v > 0 ? '+' : ''}${(l.pct ? v * 100 : v).toFixed(l.dp)}${l.pct ? '' : ''}`)
export const lineRow = (l) => ({ _key: l.key, label: l.label, val: shown(l, l.value), valTxt: txt(l, l.value), lgv: shown(l, l.lg), lgTxt: txt(l, l.lg), rankN: l.rank?.rank ?? null, rankTxt: l.rank ? `${rankWord(l.rank)} of ${l.rank.of}` : '—', pct: l.rank?.pct ?? null, dp: l.dp })
