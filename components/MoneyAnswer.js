'use client'

// ── 💵 DOES THIS MAKE MONEY ─────────────────────────────────────────────────
//
// Findings #34 and #36, and they turned out to be one thing.
//
// #34 was placement, not content: True Price is the most honest page on the
// site and its answer — flat betting the bot's props at the offered price has
// not made money — sat behind a mode pill, inside a tab that lives in the
// drawer. Meanwhile the front door and Home both lead with "every pick is
// graded in public." A site can say that and put the money answer three
// clicks away, but it should not want to.
//
// #36 was the shape of the answer: the P/L simulator, True Price and the
// Guide independently agree that home runs — the flagship — are the lane the
// site's own measurements like least.
//
// ── AND THE LIVE DATA CORRECTED #36 WHILE THIS WAS BEING WRITTEN ────────────
//
// The findings log recorded "Home runs −16.2%" over 12 nights as though that
// were a result. Read again on the 14-night archive it is −6.3% with a
// standard error of ±16.2 points. That is not a smaller loss; it is NO
// MEASUREMENT AT ALL. Home runs are a long-priced market, the variance on 350
// of them is enormous, and the honest sentence is that the archive cannot yet
// say whether the HR lane makes money in either direction.
//
// That distinction is the whole reason this component exists rather than a
// paragraph of copy. "HR is the worst lane" (the P/L simulator, at default
// round-number prices) and "HR is the lane we know least about" (True Price,
// at real prices) are different claims, and a static sentence would have
// frozen the wrong one into the page on the day the numbers moved.
//
// So nothing here is written down. Every number is read from odds_history.json
// on load and classified by roiVerdict — the same 2σ test True Price uses, so
// the two pages can never disagree — and the copy is assembled from what comes
// back. If a market turns profitable tomorrow this says so without an edit.

import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { oddsHistoryPaths } from '../lib/dataSource'
import { historyLooksReal, roiRows, roiVerdict } from '../lib/oddsHistory'
import DenseTable from './DenseTable'


const pct = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`

export default function MoneyAnswer({ compact = false, onNavigate = null }) {
  const [hist, setHist] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    fetchJSON(oddsHistoryPaths(), historyLooksReal)
      .then((j) => { if (!alive) return; if (j) { setHist(j); setState('ok') } else setState('empty') })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  const read = useMemo(() => {
    const rows = roiRows(hist).map((r) => ({ ...r, verdict: roiVerdict(r.all) }))
    if (!rows.length) return null
    const up = rows.filter((r) => r.verdict.key === 'up')
    const down = rows.filter((r) => r.verdict.key === 'down')
    const flat = rows.filter((r) => r.verdict.key === 'flat')
    const bets = rows.reduce((s, r) => s + (Number(r.all?.n) || 0), 0)
    const days = Array.isArray(hist?.days) ? hist.days.length : Number(hist?.days) || null
    // The widest error bar on the board is the most useful single fact about
    // what this archive can and cannot resolve yet.
    const widest = [...rows].sort((a, b) => (b.all?.roi_se || 0) - (a.all?.roi_se || 0))[0]
    return { rows, up, down, flat, bets, days, widest }
  }, [hist])


  if (state === 'loading') return null
  if (state === 'empty' || !read) return null

  const { up, down, flat, bets, days, widest } = read
  const rows = read.rows || []
  const headline = up.length
    ? `${up.length} of ${rows.length} markets ${up.length === 1 ? 'is' : 'are'} measurably profitable`
    : `No market is measurably profitable yet`
  const tone = up.length ? C.green : down.length ? C.red : C.yellow

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onNavigate?.('odds')}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: onNavigate ? 'pointer' : 'default',
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '8px 12px', color: 'inherit', font: 'inherit',
        }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em', color: C.text3, fontFamily: NUM_FONT }}>
          DOES THIS MAKE MONEY
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.text2, lineHeight: 1.5, marginTop: 3 }}>
          <b style={{ color: tone }}>{headline}</b> at the prices the books offered
          {days ? ` across ${days} graded nights` : ''} and {bets.toLocaleString()} settled bets.
          {onNavigate ? <span style={{ color: C.orange }}> The full table →</span> : null}
        </span>
      </button>
    )
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em', color: C.text3, fontFamily: NUM_FONT }}>
        DOES THIS MAKE MONEY
      </div>
      <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, margin: '5px 0 10px' }}>
        <b style={{ color: tone }}>{headline}.</b>{' '}
        {down.length ? `${down.map((r) => r.label).join(' and ')} ${down.length === 1 ? 'is' : 'are'} measurably losing; ` : ''}
        {flat.length ? `${flat.length} sit inside the noise. ` : ''}
        Flat one unit a bet, at the price actually offered
        {days ? `, across ${days} graded nights` : ''} and {bets.toLocaleString()} settled bets.
      </p>

      {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). Was SortTh. */}
      <DenseTable bare noGroups rows={rows.map((r) => ({ ...r, _key: r.market, n: r.all.n, roi: r.all.roi, se: r.all.roi_se, verdictTxt: r.verdict.label }))}
        columns={[
          { key: 'label', label: 'Market', heat: false, sticky: true, w: 120 },
          { key: 'n', label: 'Bets', w: 50, dp: 0, tone: () => ({ color: C.text3 }) },
          { key: 'roi', label: 'ROI', w: 56, fmt: (v) => pct(v), tone: (_, r) => ({ color: r.verdict.tone }) },
          { key: 'se', label: '± error bar', w: 74, fmt: (v) => (v != null ? `±${Number(v).toFixed(1)}` : '—'), tone: () => ({ color: C.text3 }) },
          { key: 'verdictTxt', label: 'Verdict', heat: false, w: 120, fmt: (v, r) => <span style={{ color: r.verdict.tone, fontSize: 10 }}>{v}</span> },
        ]}
        initialSort={{ key: 'roi', dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={40} caption="Return on investment by market, with the verdict for each" />

      {/* THE ERROR BAR IS THE POINT, and it is why this is a component and not
          a sentence. A market can show a headline loss and still be telling you
          nothing, and the widest bar on the board is the clearest way to say
          so — the number moves, the explanation does not. */}
      {widest?.all?.roi_se != null && (
        <p style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
          Read the error bars before the returns. {widest.label} is at{' '}
          <b style={{ color: C.text2 }}>{pct(widest.all.roi)}</b> with a bar of{' '}
          <b style={{ color: C.text2 }}>±{Number(widest.all.roi_se).toFixed(1)}</b> points over {widest.all.n} bets —
          which is not a small loss, it is no measurement at all. Long-priced markets
          swing hard, and a few hundred of them cannot resolve a handful of points in
          either direction. A market only gets called profitable or losing here when it
          clears its own bar twice over.
        </p>
      )}
      <p style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
        This is the site&apos;s own scoreboard on itself, and it stays on the page whether
        it flatters the model or not. {hist?.roi_note || ''}
      </p>
    </div>
  )
}
