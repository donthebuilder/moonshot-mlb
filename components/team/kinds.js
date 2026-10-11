// COLUMN KINDS FOR THE SHARED TEAM PAGE (2026-10-10). The view-models (lib/team/*.js) are pure data, so a column says
// WHAT it holds ('day', 'result', 'pct1', 'toi' ...) and the page draws it here, in the viewer's own clock and the
// site's own number formats. A column with `link` becomes a real tap target through the sport's navigation.
import { fmtDay, fmtPct3, fmtSec } from '../../lib/nhl/format'
import { localTime } from '../../lib/localTime'

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const signedFmt = (dp) => (v) => { const x = num(v); return x == null ? '—' : `${x > 0 ? '+' : ''}${dp ? x.toFixed(dp) : x}` }

const KIND = {
  day: (v, r) => `${fmtDay(r.date)}${r.pre ? ' · PRE' : ''}`,
  result: (v, r) => {
    if (r.resultTxt) return r.resultTxt
    const t = r.startUtc ? localTime(r.startUtc, { zone: false }) : ''
    return t || 'TBD'
  },
  pct1: (v) => (num(v) == null ? '—' : (Number(v) * 100).toFixed(1)),
  pct3: (v) => fmtPct3(v),
  toi: (v) => fmtSec(v),
  avg3: (v) => (num(v) == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')),
  n1: (v) => (num(v) == null ? '—' : Number(v).toFixed(1)),
  n2: (v) => (num(v) == null ? '—' : Number(v).toFixed(2)),
}

/**
 * Bind a view's declarative columns to a sport's navigation.
 * @param nav { onOpenPlayer, onOpenGame, onOpenTeam }  any may be missing: a link then stays plain text, never a dead button
 */
export function bindColumns(columns, nav) {
  return columns.map(({ kind, link, linkKey, signed, ...c }) => {
    const out = { ...c }
    if (kind && KIND[kind] && !c.fmt) out.fmt = KIND[kind]
    if (signed && !c.fmt) out.fmt = signedFmt(c.dp)
    if (link === 'player' && nav.onOpenPlayer) out.link = (r) => (r[linkKey || 'id'] != null ? () => nav.onOpenPlayer(r[linkKey || 'id']) : null)
    if (link === 'pitcher' && nav.onOpenPitcher) out.link = (r) => (r[linkKey || 'id'] ? () => nav.onOpenPitcher(r[linkKey || 'id']) : null)
    if (link === 'team' && nav.onOpenTeam) out.link = (r) => (r[linkKey || 'opp'] ? () => nav.onOpenTeam(r[linkKey || 'opp']) : null)
    return out
  })
}
