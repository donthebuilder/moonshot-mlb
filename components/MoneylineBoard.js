'use client'

// ── 💰 WHERE THE MODEL DISAGREES WITH THE MARKET ────────────────────────────
//
// The fourth bot, and the only one on the site that is NOT presented as a
// thing to bet.
//
// WHY THE FRAMING IS "DISAGREEMENT LOG" AND NOT "PICKS". Before this shipped
// the bot was simulated against the null hypothesis — a world where the market
// is right and the model is blind — and the first version lost 4-8% flat at
// every edge floor tried. Raising the floor did not help; it took fewer bets
// and lost at the same rate, because selectivity concentrates the vig instead
// of finding an edge. Giving the model the starting pitchers cut its opinions
// to roughly a fifth and improved the simulated loss, which means most of what
// version one called an edge was simply not knowing who was pitching.
//
// It is still, in that simulated world, a loser — because in that world the
// market is right by construction and nothing can beat it. Whether there is
// real edge here cannot be settled by simulation. It can only be settled by
// grading real bets in public, which is what this board is for and what the
// rest of the site already does.
//
// So the record leads, the simulated expectation sits beside it, and the word
// "pick" is deliberately absent from the copy.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { moneylinePaths } from '../lib/dataSource'
import { Empty } from './ui'
import { useSort } from '../lib/useSort'
import SortTh from './SortTh'

// Hoisted so the sort memo sees stable references.
const ML_SORT = { key: 'edge', dir: 'desc' }
const ML_GET = { game: (p) => `${p.away} @ ${p.home}` }
const ML_OPTS = { text: new Set(['game', 'side']) }

const price = (v) => (Number(v) > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)
const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`
const signed = (v) => `${Number(v) >= 0 ? '+' : ''}${(Number(v) || 0).toFixed(2)}`

export default function MoneylineBoard() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const { sorted: todaySorted, thProps } = useSort(data?.today || [], ML_SORT, ML_GET, ML_OPTS)

  useEffect(() => {
    let alive = true
    fetchJSON(moneylinePaths())
      .then((j) => {
        if (!alive) return
        if (j && j.record) { setData(j); setState('ok') } else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Reading the board…</div>
  if (state === 'empty' || !data) {
    return <Empty text="No moneyline board published yet — the bot writes this on its next run." />
  }

  const r = data.record || {}
  const today = todaySorted
  const roiTone = (Number(r.roi) || 0) > 0 ? C.green : (r.graded ? C.red : C.text3)
  // ── THE TEAM MODEL, AND HOW IT DID OUT OF SAMPLE (2026-09-05) ────────────
  // Donovan: "use OBP and SLG over BA, weighted — think Moneyball — and tell
  // me how that does out of sample." The bot answers both here: the fitted
  // weight of a point of on-base against a point of slugging, and the
  // walk-forward grade against the record-only model it replaced. When the
  // harness has not run, the line says so rather than quoting the book.
  const tm = data.team_model || {}
  const coef = tm.coef || null
  const oos = tm.out_of_sample || null
  const ll = (x) => (x && Number.isFinite(Number(x.log_loss)) ? Number(x.log_loss).toFixed(4) : '—')
  const beatsRecord = oos && oos.moneyball && oos.records_only && oos.moneyball.log_loss < oos.records_only.log_loss
  const beatsHome = oos && oos.moneyball && oos.home_always && oos.moneyball.log_loss < oos.home_always.log_loss
  // The merge. "Merge the good findings": the live base is w·OBP/SLG +
  // (1−w)·record, and w is whatever the walk-forward found lowest. Before
  // it has run the bot uses half each, and this says so.
  const w = Number.isFinite(Number(tm.blend_weight)) ? Number(tm.blend_weight) : 0.5
  const blendScore = oos && oos.blend && oos.blend.score

  return (
    <div>
      {/* THE RECORD FIRST. A board of opinions with the grade underneath is a
          tip sheet; the grade on top is an experiment. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline',
        border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px',
        marginBottom: 10, fontFamily: NUM_FONT,
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em', color: C.text3 }}>THE RECORD</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
          {r.wins || 0}-{r.losses || 0}
        </span>
        <span style={{ fontSize: 11, color: C.text2 }}>
          {pct(r.win_rate)} <span style={{ color: C.text3 }}>· needed {pct(r.breakeven_rate)}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: roiTone }}>
          {signed(r.units_profit)} units · {r.graded ? pct(r.roi) : '—'}
        </span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          {r.graded || 0} graded, flat one unit at the price offered
        </span>
      </div>

      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px',
        marginBottom: 10, fontFamily: NUM_FONT,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'baseline' }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em', color: C.text3 }}>THE TEAM MODEL</span>
          <span style={{ fontSize: 11, color: C.text2 }}>
            runs = a + b·OBP + c·SLG
            {coef ? (
              <span style={{ color: C.text3 }}>
                {' '}· a point of on-base worth <b style={{ color: C.text }}>{Number(coef.obp_per_slg).toFixed(2)}×</b> a point of slugging
                {' '}<span title={`Fitted on ${coef.rows} team-snapshots; ${Math.round((Number(coef.prior_share) || 0) * 100)}% of the answer is still the prior`}>({coef.rows} rows)</span>
              </span>
            ) : <span style={{ color: C.text3 }}> · not fitted yet</span>}
          </span>
        </div>
        <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.55, color: C.text2 }}>
          {oos && oos.moneyball && oos.moneyball.n ? (
            <>
              <b style={{ color: beatsRecord && beatsHome ? C.green : beatsHome ? C.yellow : C.red }}>Out of sample</b>
              {' '}({Number(oos.games).toLocaleString()} games, walk-forward, months {oos.months?.[0]}–{oos.months?.[oos.months.length - 1]}):
              {' '}log loss <b style={{ color: C.text }}>{ll(oos.moneyball)}</b> OBP/SLG
              {' '}· <span style={{ color: C.text3 }}>{ll(oos.records_only)} record-only · {ll(oos.home_always)} home-always · {ll(oos.coin)} coin</span>
              {' '}· picks the winner {pct(oos.moneyball.fav_accuracy)} of the time
              <span style={{ display: 'block', marginTop: 3 }}>
                <b style={{ color: C.text }}>Live base: {Math.round(w * 100)}% OBP/SLG · {Math.round((1 - w) * 100)}% record</b>
                {blendScore ? <span style={{ color: C.text3 }}> — the merge scored {ll(blendScore)}</span> : null}
                {/* Who chose the weight. Log loss until enough priced games
                    have settled; then ROI at the book's own prices, which is
                    the number that pays. The bar to switch is printed. */}
                {oos.blend?.chooser === 'roi' && oos.blend?.roi
                  ? <span style={{ color: C.green }}> · chosen by ROI over {oos.blend.roi.settled} settled prices ({signed(oos.blend.roi.best_roi * 100)}% at that mix)</span>
                  : <span style={{ color: C.text3 }}> · chosen by log loss{oos.blend?.roi ? ` — ROI takes over at ${oos.blend.roi.needed} settled prices, ${oos.blend.roi.settled} so far` : ''}</span>}
              </span>
              <span style={{ display: 'block', color: C.text3, marginTop: 2 }}>{oos.verdict} {oos.limits}</span>
            </>
          ) : (
            <span style={{ color: C.text3 }}>
              Out of sample: not graded yet — <code>bots/moneyball.py</code> writes the walk-forward result on its next run, and this line reads it. Until then the live base is half OBP/SLG, half record. Nothing is claimed until then.
            </span>
          )}
        </div>
      </div>

      {today.length === 0 ? (
        <Empty text="No disagreements on tonight's board that clear the floor. That is the normal outcome." />
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: NUM_FONT, minWidth: 330 }}>
          <caption className="sr-only">Tonight&apos;s disagreements between the model and the market</caption>
          <thead>
            <tr>
              {[['Game', 'left', '', 'game'], ['Leans', 'left', '', 'side'], ['Price', 'right', '', 'price'],
                ['Model', 'right', 'sm-hide', 'model_p'], ['Market', 'right', 'sm-hide', 'market_p'], ['Gap', 'right', '', 'edge'],
                ['From the arms', 'right', 'sm-hide', 'starter_shift']]
                .map(([l, a, cls, key]) => (
                  <SortTh key={l} label={l} align={a} className={cls || undefined} {...thProps(key)} />
                ))}
            </tr>
          </thead>
          <tbody>
            {today.map((p) => (
              <tr key={p.game_pk} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '5px 6px', fontSize: 10.5, color: C.text2, whiteSpace: 'nowrap' }}>
                  {p.away} @ {p.home}
                </td>
                <td style={{ padding: '5px 6px', fontSize: 11.5, fontWeight: 800, color: C.text }}
                    title={p.base === 'record' ? 'Priced from the record — a side had too few games for its rates' : `Priced from OBP/SLG merged with the record (${p.base})`}>
                  {p.side}
                  {p.base === 'record' ? <span style={{ fontSize: 8, color: C.text3, marginLeft: 5, fontWeight: 700 }}>REC</span> : null}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, color: C.text }}>{price(p.price)}</td>
                <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>{pct(p.model_p)}</td>
                <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text3 }}
                    title={`Book's raw hold on this game: ${pct(p.hold)}`}>{pct(p.market_p)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: C.orange }}>
                  {pct(p.edge)}
                </td>
                {/* How much of the opinion is the pitching rather than the
                    records — the thing version one could not see at all. */}
                <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10, color: C.text3, whiteSpace: 'nowrap' }}
                    title={p.home_sp || p.away_sp ? `${p.away_sp || '?'} vs ${p.home_sp || '?'}` : undefined}>
                  {p.starter_shift ? `${Number(p.starter_shift) > 0 ? '+' : ''}${Math.round(p.starter_shift * 100)}pt` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '10px 2px 0', maxWidth: 720 }}>
        <b style={{ color: C.text2 }}>This is a log, not a tip sheet.</b> Simulated against a
        world where the market is right, the first version of this model lost 4–8% flat at every
        edge floor — and raising the floor made it worse, not better, because being choosier
        concentrates the vig instead of finding an edge. Adding the starting pitchers cut its
        opinions to about a fifth, which means most of what it used to call an edge was not
        knowing who was pitching. The team base is now on-base and slugging rather than the
        record — the Moneyball argument, that a walk and a single reach first the same way and
        batting average only counts one of them. Whether anything real is left cannot be settled
        by simulation, only by the record above.
      </p>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
        {data.method}
      </p>
    </div>
  )
}
