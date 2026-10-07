// THE ONE MLB RECORD NUMBER (2026-10-06, ledger audit P0-2). Pure, client-safe.
//
// lib/cleanRecord.js hard-coded "Sep 9-30" rates (TOP 42/227, HIT 142/220 ...)
// that counted nights whose boards were stamped AFTER first pitch (09-09, 10,
// 11, 13 and most of 09-12): the front door, Home, Score bands, Hits/HRR and
// the pulse each printed a different TOP rate from the calibration table.
// Now there is one reader: /api/calibration?sport=mlb (lib/calibration/
// readMlbCalibration.js: por_rows + outcome_log, a row counts only if its
// stamp is before the game's first pitch, 30 min cache). This turns its
// regular-season block into the facts a surface prints, with the window and n.
// Nothing is typed here.

const PICKS = {
  TOP: { label: 'TOP calls', bar: '1+ HR' },
  HR: { label: 'HR calls', bar: '1+ HR' },
  HIT: { label: 'Hit calls', bar: '1+ hit' },
  HRR: { label: 'HRR calls', bar: 'H+R+RBI 2+' },
  CONTACT: { label: 'Contact calls', bar: '2+ bases' },
}
export const LOCKED_PICKS = PICKS
const short = (d) => { const [, m, day] = String(d || '').split('-'); return m && day ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${Number(day)}` : '' }

/**
 * /api/calibration?sport=mlb body -> the locked record, or null when there is none yet.
 * { source, nights, from, to, board:{n,hrRate}, picks:{ TOP:{ok,n,pct,base,enough,lift,label,bar}, ... }, bands:{hr,hrw}, set aside }
 */
export function lockedRecordFrom(cal) {
  const b = cal?.regular
  if (!b?.nights) return null
  const picks = {}
  for (const t of b.tiers || []) {
    if (!PICKS[t.key]) continue
    picks[t.key] = { ...PICKS[t.key], ok: t.hits, n: t.n, pct: t.rate, enough: t.enough, base: t.board?.rate ?? null, baseN: t.board?.n ?? 0, lift: t.lift }
  }
  const hrTier = (b.tiers || []).find((t) => t.key === 'TOP')
  const window = `${short(b.from)}–${short(b.to)}`
  return {
    nights: b.nights, from: b.from, to: b.to, window,
    // "N calls over M nights, locked before first pitch" -- the sentence every surface prints
    source: `locked record, ${b.nights} nights (${window})`,
    callsLine: (n) => `${Number(n).toLocaleString('en-US')} calls over ${b.nights} nights, locked before first pitch`,
    board: { n: b.board, hrRate: hrTier?.board?.rate ?? null },
    setAside: { late: b.late, lateNights: b.lateNights || [], void: b.void, pending: b.pending },
    picks,
    bands: b.bands || null,
    minN: cal.minN,
  }
}

/** "18.5% (42/227)" -- a rate always prints with its count; under the minimum, the count alone. */
export const pickRate = (p) => (p ? (p.enough && p.pct != null ? `${p.pct.toFixed(1)}% (${p.ok}/${p.n})` : `${p.ok}/${p.n}, not enough calls yet`) : '—')

/** The one-line pick record, for any page that shows archive-wide pick rates. */
export function lockedPickLine(rec) {
  if (!rec) return 'The locked record is loading.'
  const p = rec.picks
  const vs = (x) => (x?.base != null ? ` vs ${x.base.toFixed(1)}% for every hitter` : '')
  return `${rec.source}: TOP ${pickRate(p.TOP)} · HR ${pickRate(p.HR)}${p.TOP?.base != null ? ` against an ${p.TOP.base.toFixed(1)}% base` : ''} · HIT ${pickRate(p.HIT)}${vs(p.HIT)} · CONTACT ${pickRate(p.CONTACT)}${vs(p.CONTACT)}`
}

/** "N calls over M nights, locked before first pitch" -- the sentence every surface prints. */
export const lockedCallsLine = (rec, n) => `${Number(n).toLocaleString('en-US')} calls over ${rec.nights} nights, locked before first pitch`
