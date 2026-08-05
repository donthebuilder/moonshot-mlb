'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { obj, n } from '../../lib/player'
import { Empty, PanelTitle } from '../ui'
import Heatmap from '../Heatmap'
import RollingForm from '../RollingForm'

// Backtest — the graded archive, which the Next.js build never showed at all.
//
// This is the only screen on the site that answers "does any of this work".
// Everything else is a projection; this is the scoreboard on the projections.
//
// The honest framing matters more here than anywhere else, so two things are
// deliberately loud: the sample size behind every rate, and the gap between
// avg_metrics and pooled_metrics.

const TIER_LABEL = {
  TOP_15_BOARD: 'Top 15 board',
  TOP_PICKS: 'Top picks',
  HR_PICKS: 'HR picks',
  HRR_PICKS: 'HRR picks',
  HIT_PICKS: 'Hit picks',
  CONTACT_PICKS: 'Contact picks',
  POOLS: 'Pools',
  PAIRS: 'Pairs',
}
const label = (k) => TIER_LABEL[k] || k.replace(/_/g, ' ').toLowerCase()

// COLUMNS ARE DERIVED FROM THE DATA, NOT HARDCODED.
//
// The old list was ['HR','1+ Hit','XBH','2+ TB','1+ HRR','2+ HRR','3+ HRR',
// 'Did its job']. Two of those keys are written by nothing: across all six
// tiers and all nine graded days, the metric keys that actually exist are
// HR, 1+ Hit, XBH, 2+ TB, 2+ HRR and 3+ HRR. "1+ HRR" and "Did its job" were
// never in the payload, so both columns rendered 0% for every tier forever —
// which reads as "this tier never did its job", the exact opposite of "we
// don't measure that".
const METRIC_ORDER = ['HR', '1+ Hit', 'XBH', '2+ TB', '2+ HRR', '3+ HRR']

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '4px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
            cursor: 'pointer', whiteSpace: 'nowrap',
            border: `1px solid ${value === o.value ? C.orange : C.border}`,
            background: value === o.value ? `${C.orange}22` : 'transparent',
            color: value === o.value ? C.orange : C.text3,
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

function Sparkline({ points, height = 44 }) {
  if (points.length < 2) return null
  const vals = points.map((p) => p.v)
  const lo = Math.min(...vals, 0)
  const hi = Math.max(...vals, 1)
  const w = 100
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = height - ((p.v - lo) / Math.max(1e-9, hi - lo)) * height
    return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const my = height - ((mean - lo) / Math.max(1e-9, hi - lo)) * height
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <line x1="0" y1={my} x2={w} y2={my} stroke={C.border2} strokeWidth="0.5" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={C.orange} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={(i / (points.length - 1)) * w}
          cy={height - ((p.v - lo) / Math.max(1e-9, hi - lo)) * height}
          r="1.6" fill={C.orange} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

export default function Backtest({ backtest }) {
  const [basis, setBasis] = useState('avg_metrics')
  // Rolling form renders above the tier table: lifetime numbers say whether
  // the model works, the rolling window says whether it's working NOW.
  const bt = obj(backtest)
  const summary = obj(bt.summary)
  const perDay = obj(bt.per_day)
  const tiers = Object.keys(summary)

  // Which metric keys the payload actually carries, in a stable order.
  const metrics = useMemo(() => {
    const seen = new Set()
    tiers.forEach((t) => Object.keys(obj(obj(summary[t]).avg_metrics)).forEach((k) => seen.add(k)))
    const known = METRIC_ORDER.filter((k) => seen.has(k))
    const extra = [...seen].filter((k) => !METRIC_ORDER.includes(k)).sort()
    return [...known, ...extra]
  }, [tiers, summary])

  // POOLED IS MOSTLY UNAVAILABLE, AND THAT IS A BOT GAP.
  //
  // summary[tier].pooled_metrics is {} for all six tiers — backtest_report.py
  // creates the key and never fills it, so the Pooled toggle showed a wall of
  // 0% and looked like every tier had failed everything.
  //
  // One pooled number IS recoverable and it's the important one: hr_rate_pct
  // is total_hr_count / total_pool_size, which is a true pooled HR rate
  // (Top 15 board: 36 of 116 = 31.0%). So Pooled shows a real HR column and
  // leaves the rest blank rather than zero — blank means unmeasured, zero
  // means measured-and-failed, and the difference matters here more than
  // anywhere else on the site.
  const pooledAvailable = useMemo(
    () => tiers.some((t) => Object.keys(obj(obj(summary[t]).pooled_metrics)).length > 0),
    [tiers, summary],
  )

  const rows = useMemo(() => tiers.map((t) => {
    const s = obj(summary[t])
    const m = obj(s[basis])
    const isPooled = basis === 'pooled_metrics'
    const values = Object.fromEntries(metrics.map((k) => {
      if (k in m) return [k, n(m[k], null)]
      // Derived pooled HR rate — the only pooled figure the payload supports.
      if (isPooled && k === 'HR' && n(s.total_pool_size, 0) > 0) {
        return [k, (100 * n(s.total_hr_count, 0)) / n(s.total_pool_size, 1)]
      }
      return [k, null]
    }))
    return {
      label: label(t),
      key: t,
      values,
      days: n(s.days_seen, 0),
      pool: n(s.total_pool_size, 0),
      hrRate: n(s.hr_rate_pct, 0),
    }
  }), [tiers, summary, basis, metrics])

  const dayKeys = useMemo(() => Object.keys(perDay).sort(), [perDay])

  const trend = useMemo(() => tiers.map((t) => ({
    key: t,
    label: label(t),
    points: dayKeys
      .map((d) => ({ d, v: n(obj(obj(obj(perDay[d]).tiers)[t]).hr_rate_from_detail, null) }))
      .filter((p) => Number.isFinite(p.v)),
  })).filter((x) => x.points.length > 1), [tiers, dayKeys, perDay])

  if (!tiers.length) {
    return <Empty text="No backtest published yet — backtest_summary.json hasn't been written." />
  }

  return (
    <div>
      <PanelTitle
        title="Backtest"
        sub={`${dayKeys.length} graded days · base-hit accuracy ${n(bt.overall_base_hit_accuracy, 0).toFixed(1)}%`}
        right={
          <Toggle
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'pooled_metrics', label: 'Pooled' },
              { value: 'avg_metrics', label: 'Day average' },
            ]}
          />
        }
      />

      <RollingForm />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '8px 0 14px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10,
      }}>
        <strong style={{ color: C.text2 }}>Pooled</strong> counts every pick across every day as one
        sample. <strong style={{ color: C.text2 }}>Day average</strong> scores each day separately, then
        averages the days — which lets a single hot day on a tiny pool pull the whole number up. When
        the two disagree badly, trust pooled and treat the tier as unproven.
        {basis === 'pooled_metrics' && !pooledAvailable && (
          <div style={{ marginTop: 6, color: C.orange }}>
            Only the <b>HR</b> column is available pooled. <code>backtest_report.py</code> writes
            <code> pooled_metrics</code> as an empty object for every tier, so the other columns
            can&apos;t be pooled from this payload — HR is recomputed here from the
            total HR count over the total pool size, which is a genuine pooled rate. The blanks are
            unmeasured, not zero. Day average has all six.
          </div>
        )}
      </div>

      <Heatmap
        rows={rows}
        columns={metrics}
        title={`Hit rate by tier — ${basis === 'pooled_metrics' ? 'pooled across all days' : 'averaged per day'}`}
        labelWidth={130}
        fmt={(v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(0)}%` : '—')}
        caption="Every column scaled on its own. A bright HR cell means high relative to the other tiers, not high in absolute terms — check the pool sizes below before believing any of it."
      />

      <div style={{
        display: 'grid', gap: 8, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      }}>
        {rows.map((r) => (
          <div key={r.key} style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{r.label}</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 800, color: C.orange, marginTop: 2 }}>
              {r.hrRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              HR rate · {r.pool} picks over {r.days} days
            </div>
          </div>
        ))}
      </div>

      {trend.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, marginBottom: 7 }}>
            HR rate by day — is it holding up, or was it one good week?
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          }}>
            {trend.map((t) => {
              const vals = t.points.map((p) => p.v)
              const mean = vals.reduce((a, b) => a + b, 0) / vals.length
              const last = vals[vals.length - 1]
              return (
                <div key={t.key} style={{
                  background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 11px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{t.label}</span>
                    <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                      mean {mean.toFixed(0)}% · last {last.toFixed(0)}%
                    </span>
                  </div>
                  <Sparkline points={t.points} />
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 3 }}>
                    {t.points[0].d} → {t.points[t.points.length - 1].d} · {t.points.length} days
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 14, lineHeight: 1.6 }}>
        {dayKeys.length} graded days is a small sample. A tier sitting at 30% on twelve picks is one
        good night away from 40% and one bad night away from 20% — the dashed line on each sparkline is
        that tier&apos;s own mean, so what matters is whether the line wanders around it or trends.
      </div>
    </div>
  )
}
