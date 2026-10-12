// THE REPORT CARD'S NUMBERS, ONCE (2026-10-12). components/ReportCard.js built this model inline; the track-record share card is now drawn on the server
// (lib/cards/shareData.js, the baseball-card look), so both read ONE definition and the card can never say a different number than the page.
// Pure: no React, no clock (the caller passes `today`), no I/O. Moved verbatim from the component (colours stay in the component).
export const LOCK_DATE = '2026-08-06'   // the pick-lock commit went live this slate

export const REPORT_CATS = [
  { tier: 'TOP_PICKS', label: 'LEGACY TOP', bar: 'HR', barLabel: 'homered' },
  { tier: 'HR_PICKS', label: 'HR', bar: 'HR', barLabel: 'homered' },
  { tier: 'HIT_PICKS', label: 'HIT', bar: '1+ Hit', barLabel: 'got a hit' },
  { tier: 'HRR_PICKS', label: 'HRR', bar: '2+ HRR', barLabel: '2+ H+R+RBI' },
  { tier: 'CONTACT_PICKS', label: 'CONTACT', bar: '2+ TB', barLabel: '2+ total bases' },
]

// Rolling form (audit #14): pooled own-bar rate over the trailing 7 and 30 graded days, held against the season base. Pooled counts, not an
// average of nightly rates: a 3-pick night shouldn't weigh like a 40-pick night.
export const poolRate = (days) => {
  let ok = 0, n = 0
  days.forEach((d) => {
    if (d.ok != null) { ok += d.ok; n += d.n } else { ok += Math.round((d.rate / 100) * d.size); n += d.size }
  })
  return n ? { rate: (100 * ok) / n, ok, n } : null
}

/** The letter: the night's rate over the category's own season base. '—' when either is missing. */
export const gradeLetter = (rate, base) => {
  if (rate == null || !base) return '—'
  const r = rate / base
  if (r >= 1.3) return 'A'
  if (r >= 1.05) return 'B'
  if (r >= 0.8) return 'C'
  if (r >= 0.5) return 'D'
  return 'F'
}

/** @param backtest backtest_summary.json  @param today 'YYYY-MM-DD': the last COMPLETE night is strictly before it. */
export function reportModel(backtest, today) {
  const per = backtest?.per_day
  if (!per) return null
  const dates = Object.keys(per).sort()
  // last COMPLETE night: strictly before today, with a real pool
  const lastDate = [...dates].reverse().find((d) => d < today
    && Object.values(per[d]?.tiers || {}).some((t) => (t?.pool_size || 0) >= 6)) || null

  const rows = REPORT_CATS.map((cat) => {
    const days = dates.map((d) => {
      const t = per[d]?.tiers?.[cat.tier]
      const rate = t?.metrics?.[cat.bar]
      const counts = t?.metric_counts?.[cat.bar]
      return {
        date: d,
        rate: rate == null ? null : Number(rate),
        n: counts ? counts[1] : (t?.pool_size ?? null),
        ok: counts ? counts[0] : null,
        size: t?.pool_size ?? 0,
      }
    }).filter((d) => d.rate != null && d.size > 0)
    // season record, own bar: exact counts where published, reconstructed from (rate x pool) where the older file format only carried rates
    let ok = 0, n = 0, approx = false
    days.forEach((d) => {
      if (d.ok != null) { ok += d.ok; n += d.n } else { ok += Math.round((d.rate / 100) * d.size); n += d.size; approx = true }
    })
    const base = n ? (100 * ok) / n : null
    const last = lastDate ? days.find((d) => d.date === lastDate) : null
    // since the pick lock: the record that can't have been flattered
    let lockOk = 0, lockN = 0
    days.filter((d) => d.date >= LOCK_DATE).forEach((d) => {
      if (d.ok != null) { lockOk += d.ok; lockN += d.n } else { lockOk += Math.round((d.rate / 100) * d.size); lockN += d.size }
    })
    // trailing form windows by graded-day count (calendar gaps don't matter: an off-day slate teaches nothing)
    const form7 = poolRate(days.slice(-7))
    const form30 = poolRate(days.slice(-30))
    return { cat, days, ok, n, approx, base, last, lockOk, lockN, form7, form30, letter: gradeLetter(last?.rate, base) }
  })
  return { rows, lastDate, dates }
}

/** The two headline records off a model's rows. */
export function headline(model) {
  const seasonOk = model.rows.reduce((a, r) => a + r.ok, 0)
  const seasonN = model.rows.reduce((a, r) => a + r.n, 0)
  const lockOk = model.rows.reduce((a, r) => a + r.lockOk, 0)
  const lockN = model.rows.reduce((a, r) => a + r.lockN, 0)
  return {
    seasonOk, seasonN, lockOk, lockN,
    seasonPct: seasonN ? (100 * seasonOk) / seasonN : null,
    lockPct: lockN ? (100 * lockOk) / lockN : null,
    lockNights: model.dates.filter((d) => d >= LOCK_DATE).length,
  }
}
