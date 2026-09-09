'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'

// Report Card — what the models actually did, before a single 2026 pick.
//
// The MLB side earns its receipts nightly. NFL gets one slate a week, so
// waiting for the record to accumulate means flying blind until November.
// Instead the card is CALIBRATED: the same models, run against completed
// seasons, graded on real outcomes.
//
// Two things this page refuses to do:
//   1. show only the season the weights were tuned on
//   2. show MODEL without FORM next to it
// The second is the one that matters. Every market beats "all eligible
// players" by 40-50 points, and almost all of that gap is just "this guy is a
// starter", which any sportsbook already knows. The column that means
// anything is the one comparing against ranking by trailing average — the
// dumbest possible model. Where we don't beat it, the page says so in red.

function Row({ k, m, tuned }) {
  const beat = m.vs_form > 0.5
  const flat = Math.abs(m.vs_form) <= 0.5
  const col = beat ? C.green : flat ? C.text3 : C.red
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td style={{ padding: '7px 8px', fontSize: 11.5, color: C.text, fontWeight: 600 }}>
        {m.label}
        <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}> · {m.bar}</span>
      </td>
      <td style={{
        padding: '7px 8px', textAlign: 'right', fontFamily: NUM_FONT,
        fontSize: 12.5, fontWeight: 900, color: C.text,
      }}>{m.model}%</td>
      <td style={{
        padding: '7px 8px', textAlign: 'right', fontFamily: NUM_FONT,
        fontSize: 11.5, color: C.text3,
      }}>{m.form}%</td>
      <td style={{
        padding: '7px 8px', textAlign: 'right', fontFamily: NUM_FONT,
        fontSize: 11.5, color: C.text3,
      }}>{m.base}%</td>
      <td style={{
        padding: '7px 8px', textAlign: 'right', fontFamily: NUM_FONT,
        fontSize: 12.5, fontWeight: 900, color: col,
      }}>{m.vs_form > 0 ? '+' : ''}{m.vs_form}</td>
    </tr>
  )
}

function Deciles({ m }) {
  const rows = Object.entries(m.deciles || {})
    .map(([d, v]) => ({ d: Number(d), ...v }))
    .sort((a, b) => b.d - a.d)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.rate), 1)
  return (
    <div style={{ marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.d} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
          <span style={{
            fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3, minWidth: 26,
          }}>D{r.d}</span>
          <div style={{ flex: 1, height: 9, background: 'rgba(255,255,255,.04)', borderRadius: 3 }}>
            <div style={{
              width: `${(r.rate / max) * 100}%`, height: '100%', borderRadius: 3,
              background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`,
            }} />
          </div>
          <span style={{
            fontFamily: NUM_FONT, fontSize: 10, color: C.text2, minWidth: 40, textAlign: 'right',
          }}>{r.rate}%</span>
        </div>
      ))}
    </div>
  )
}

export default function Report({ report }) {
  const seasons = Object.keys(report?.seasons || {}).sort().reverse()
  const [season, setSeason] = useState(seasons[0] || '')
  const [decMarket, setDecMarket] = useState('TD')

  if (!report || !seasons.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>Report card hasn&apos;t been published yet.</div>
    )
  }

  const blk = report.seasons[season] || {}
  const tuned = String(report.tuned_on) === String(season)
  const failing = Object.entries(blk).filter(([, m]) => m.vs_form <= 0.5)

  return (
    <div>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`,
        borderRadius: 10, padding: '11px 14px', marginBottom: 12,
        fontSize: 11.5, color: C.text2, lineHeight: 1.65,
      }}>
        <b style={{ color: C.text }}>Calibrated, not accumulated.</b> This page is the
        seven models run against completed past seasons on real outcomes — top{' '}
        {report.topk} per week, per market. It is not the running 2026 record; graded
        2026 calls (preseason included) live on The record.
        {' '}<b style={{ color: C.text }}>MODEL</b> is the score.
        {' '}<b style={{ color: C.text }}>FORM</b> is ranking by trailing average in the
        market&apos;s own stat — the dumbest model there is.
        {' '}<b style={{ color: C.text }}>BASE</b> is every eligible player.
        The only column worth reading is the last one.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {seasons.map((s) => (
          <button key={s} onClick={() => setSeason(s)} style={btnStyle(C.green, s === season)}>
            {s}{String(report.tuned_on) === s ? ' · tuned' : ' · out-of-sample'}
          </button>
        ))}
      </div>

      {tuned && (
        <div style={{
          background: `${C.yellow}12`, border: `1px solid ${C.yellow}3d`, borderRadius: 9,
          padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.text2, lineHeight: 1.6,
        }}>
          <b style={{ color: C.yellow }}>This is the season the weights were fit on.</b>{' '}
          Numbers here flatter the model by construction — the Anytime TD edge is
          +6.3 here and −0.7 out of sample, and the out-of-sample one is the true one.
        </div>
      )}

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,.03)' }}>
              {['Market · bar', 'MODEL', 'FORM', 'BASE', 'vs FORM'].map((h, i) => (
                <th key={h} style={{
                  padding: '7px 8px', fontSize: 9.5, fontWeight: 900, color: C.text3,
                  letterSpacing: '.08em', textAlign: i === 0 ? 'left' : 'right',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(blk).map(([k, m]) => <Row key={k} k={k} m={m} tuned={tuned} />)}
          </tbody>
        </table>
      </div>

      {failing.length > 0 && (
        <div style={{
          background: `${C.red}10`, border: `1px solid ${C.red}38`, borderRadius: 9,
          padding: '9px 12px', marginTop: 10, fontSize: 11, color: C.text2, lineHeight: 1.6,
        }}>
          <b style={{ color: C.red }}>Not beating the dumb model in {season}:</b>{' '}
          {failing.map(([, m]) => m.label).join(' · ')}. On these, ranking by trailing
          average is as good or better — read them as sorted tables, not as edges.
        </div>
      )}

      <div style={{
        fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        margin: '20px 0 8px',
      }}>SEPARATION — HIT RATE BY SCORE DECILE</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {Object.entries(blk).map(([k, m]) => (
          <button key={k} onClick={() => setDecMarket(k)} style={btnStyle(C.cyan, k === decMarket)}>
            {m.label}
          </button>
        ))}
      </div>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '12px 14px',
      }}>
        <div style={{ fontSize: 11, color: C.text3, marginBottom: 6, lineHeight: 1.6 }}>
          D10 is the highest-scoring tenth of the pool, D1 the lowest. A model can rank
          well and still not beat naive form on a top-15 slice — this is the chart that
          shows whether the <i>ordering</i> is real.
        </div>
        <Deciles m={blk[decMarket] || {}} />
      </div>
    </div>
  )
}
