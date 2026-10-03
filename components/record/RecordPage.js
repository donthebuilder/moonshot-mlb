'use client'
// ONE RECORD PAGE, EVERY SPORT (BATCH-RECORD-PAGE step 1, 2026-10-02).
// MLB's record ran ~2,300 px on a phone: tiles, a "Last night" box, tabs, six
// numbered sections of sentences, and no single result at the top. This is
// the record as one page every product mounts with its own numbers
// (lib/record/page.js builds them from the files each page already reads):
//   HERO        the last night (week) graded, one line per market, and how the
//               night's scorers were caught (CALLED / ON THE BOARD / NOT ON
//               THE BOARD -- lib/callStatus STATUS_WORD via CallStatusBadge)
//   BY MARKET   calls · hits · % · the last 10 as dots, LAST 10 / LAST 30 /
//               SEASON; under 30 graded nights the % says "building (n=…)"
//   CALLED IT   three moments, then "show all";  WHAT GOT AWAY  three, then all
//   LATER       CHALK vs VALUE, the DASH line split: drawn only once they exist
//   RECEIPTS    the full grading tables, closed
// No sport branches here: the theme comes from SportTheme, the table from the
// product's own wrapper (Table), the words from the record model.
import { useMemo, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import CallStatusBadge from '../CallStatusBadge'
import { alpha } from '../../lib/scales'
import PlayerFace from '../PlayerFace'

export const RECORD_WINDOWS = [
  { key: 'l10', label: 'Last 10', take: 10 },
  { key: 'l30', label: 'Last 30', take: 30 },
  { key: 'season', label: 'Season', take: Infinity },
]
// Fewer graded nights (weeks) than this and a % is not yet a rate.
export const BUILDING_UNDER = 30

const sum = (list, key, f) => list.reduce((a, u) => a + (Number(u.markets?.[key]?.[f]) || 0), 0)
const pctOf = (h, n) => (n > 0 ? Math.round((h / n) * 100) : null)

/** The window's calls / hits per market, from the series (oldest -> newest). */
export function windowTotals(series = [], markets = [], take = Infinity) {
  const units = Number.isFinite(take) ? series.slice(-take) : series
  const sumLine = (key, f) => units.reduce((a, u) => a + (Number(u.markets?.[key]?.line?.[f]) || 0), 0)
  return markets.map((m) => ({ key: m.key, n: sum(units, m.key, 'n'), hit: sum(units, m.key, 'hit'), lineN: sumLine(m.key, 'n'), lineHit: sumLine(m.key, 'hit'), units: units.filter((u) => u.markets?.[m.key]?.n > 0).length }))
}

function Dots({ units, mk, C, accent, unitWord }) {
  const last = units.slice(-10)
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }} aria-label={`last ${last.length} ${unitWord}s`}>
      {last.map((u) => {
        const r = u.markets?.[mk]
        const has = r && r.n > 0
        const share = has ? r.hit / r.n : 0
        return (
          <span key={u.date} title={has ? `${u.label}: ${r.hit} of ${r.n}` : `${u.label}: no call`}
            style={{
              width: 6, height: 6, borderRadius: 6, display: 'inline-block',
              background: has && share > 0 ? alpha(accent, 0.25 + 0.75 * share) : 'transparent',
              border: `1px solid ${has ? alpha(accent, 0.7) : C.border2}`,
            }} />
        )
      })}
    </span>
  )
}

function Section({ title, sub, C, NUM_FONT, children, right = null }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }}>{title}</h3>
        {right}
      </div>
      {sub ? <p style={{ margin: '0 0 8px', fontSize: 12, color: C.text3, lineHeight: 1.45 }}>{sub}</p> : null}
      {children}
    </section>
  )
}

function ShowAll({ n, open, setOpen, C, accent }) {
  if (n <= 0) return null
  return (
    <button onClick={() => setOpen(!open)} style={{ minHeight: 44, padding: '0 14px', marginTop: 6, borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: accent, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
      {open ? 'Show fewer' : `Show all · +${n} more`}
    </button>
  )
}

function Moment({ m, C, NUM_FONT, accent, Face }) {
  const body = (
    <>
      {Face && m.face ? <Face {...m.face} size={34} /> : null}
      <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{m.name}</span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{m.sub}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <CallStatusBadge status={m.status} accent={accent} />
          {m.stat ? <b style={{ fontFamily: NUM_FONT, fontSize: 12, color: accent }}>{m.stat}</b> : null}
        </span>
      </span>
    </>
  )
  const style = { display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '10px 12px', minHeight: 44, borderRadius: 12, border: `1px solid ${alpha(accent, 0.35)}`, background: C.bg2, color: 'inherit', width: '100%' }
  return m.onClick
    ? <button type="button" onClick={m.onClick} style={{ ...style, cursor: 'pointer' }}>{body}</button>
    : <div style={style}>{body}</div>
}

/**
 * record: {
 *   unit: 'night' | 'week', since: label | null, note: one sentence | null,
 *   markets: [{ key, label, job }],
 *   last: { label, live, markets: { [key]: { hit, n } }, capture: { word, total, called, board, off } | null } | null,
 *   series: [{ date, label, markets: { [key]: { hit, n } } }]   oldest -> newest, graded units only
 *   called: [{ key, name, sub, stat, status, face, onClick }],  gotAway: same shape,
 *   later: [{ key, label, value, sub }]   (CHALK vs VALUE, the DASH line) -- drawn only when present
 * }
 */
export default function RecordPage({ record, Table, Face = PlayerFace, receipts = null, receiptsLabel = 'Every graded pick, in full', top = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [win, setWin] = useState('l10')
  const [allCalled, setAllCalled] = useState(false)
  const [allAway, setAllAway] = useState(false)
  const r = record || {}
  const markets = r.markets || []
  const series = r.series || []
  const unitWord = r.unit === 'week' ? 'week' : 'night'
  const building = series.length < BUILDING_UNDER
  const take = RECORD_WINDOWS.find((w) => w.key === win)?.take ?? Infinity
  const totals = useMemo(() => windowTotals(series, markets, take), [series, markets, take])

  const rows = markets.map((m, i) => {
    const t = totals[i]
    return { _id: m.key, market: m.label, job: m.job || '', calls: t.n, hits: t.hit, pct: pctOf(t.hit, t.n), units: t.units, _key: m.key, lineN: t.lineN, lineHit: t.lineHit, vsline: t.lineN ? pctOf(t.lineHit, t.lineN) : null }
  })
  const columns = [
    { key: 'market', label: 'Market', group: 'Market', sticky: true, heat: false, w: 84, fmt: (v, row) => (
      <span style={{ display: 'grid', lineHeight: 1.2 }}><b style={{ color: C.text }}>{v}</b>{row.job ? <span style={{ fontSize: 10, color: C.text3 }}>{row.job}</span> : null}</span>) },
    { key: 'calls', label: 'Calls', group: 'Record', w: 44, heat: false, numeric: true },
    { key: 'hits', label: 'Hits', group: 'Record', w: 40, heat: false, numeric: true },
    { key: 'pct', label: '%', group: 'Record', w: 52, primary: true, scale: 'seq', domain: [0, 100], numeric: true,
      title: building ? `Fewer than ${BUILDING_UNDER} graded ${unitWord}s: the % is shown as building, with its n.` : 'Hits ÷ calls in the window.',
      fmt: (v, row) => (v == null ? '—' : building
        ? <span title={`${v}% so far`} style={{ display: 'grid', lineHeight: 1.15, color: C.text3, fontSize: 10.5 }}><span>building</span><span>(n={row.calls})</span></span>
        : `${v}%`) },
    // BEAT THE LINE (M3, 2026-10-03): only when the record carries book lines
    // (TUDDY's card does); clearing our bar and beating the book's are two claims.
    ...(rows.some((x) => x.lineN > 0) ? [{ key: 'vsline', label: 'Beat line', group: 'Record', w: 64, heat: false, numeric: true,
      title: "Of the graded calls with the book's line on file at lock, the share whose result beat that line -- a harder test than clearing our own bar.",
      fmt: (v, row) => (row.lineN ? <span style={{ display: 'grid', lineHeight: 1.15 }}><span>{v}%</span><span style={{ fontSize: 10, color: C.text3 }}>{row.lineHit}/{row.lineN}</span></span> : '—') }] : []),
    { key: 'dots', label: 'Last 10', group: 'Form', w: 84, heat: false, sortable: false,
      fmt: (v, row) => <Dots units={series} mk={row._key} C={C} accent={accent} unitWord={unitWord} /> },
  ]

  const last = r.last
  const cap = last?.capture
  const called = r.called || []
  const away = r.gotAway || []
  const later = (r.later || []).filter((x) => x && x.value != null)

  return (
    <div className="record-page">
      {top}
      {/* HERO: the last graded night, one line */}
      {last ? (
        <section aria-label={`Last ${unitWord}`} style={{ border: `1px solid ${alpha(accent, 0.4)}`, borderRadius: 14, padding: '12px 14px', background: C.bg2 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: NUM_FONT }}>{last.live ? (r.unit === 'week' ? 'THIS WEEK' : 'LIVE') : 'FINAL'}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{last.label}</span>
          </div>
          {last.note ? <div style={{ fontSize: 12, color: C.text3, marginBottom: 4 }}>{last.note}</div> : null}
          <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 13, color: C.text2 }}>
            {markets.filter((m) => last.markets?.[m.key]?.n > 0).map((m) => {
              const x = last.markets[m.key]
              return <span key={m.key}><b style={{ color: C.text3, fontSize: 11, letterSpacing: '.06em' }}>{m.label.toUpperCase()}</b> <b style={{ color: x.hit > 0 ? accent : C.text }}>{x.hit}</b> of {x.n}</span>
            })}
          </div>
          {cap && cap.total > 0 ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: C.text2 }}>
              <span><b style={{ color: C.text, fontFamily: NUM_FONT }}>{cap.called + cap.board} of {cap.total}</b> {cap.word} caught{last.live ? ' so far' : ''}</span>
              <CallStatusBadge status="called" accent={accent} /><b style={{ fontFamily: NUM_FONT }}>{cap.called}</b>
              <CallStatusBadge status="board" accent={accent} /><b style={{ fontFamily: NUM_FONT }}>{cap.board}</b>
              <CallStatusBadge status="off" accent={accent} /><b style={{ fontFamily: NUM_FONT }}>{cap.off}</b>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* BY MARKET */}
      <Section C={C} NUM_FONT={NUM_FONT} title="BY MARKET"
        sub={`${series.length} graded ${unitWord}${series.length === 1 ? '' : 's'}${r.since ? ` since ${r.since}` : ''}${r.note ? ` · ${r.note}` : ''}.`}
        right={(
          <div role="tablist" style={{ display: 'flex', gap: 4 }}>
            {RECORD_WINDOWS.map((w) => (
              <button key={w.key} role="tab" aria-selected={win === w.key} onClick={() => setWin(w.key)}
                style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: `1px solid ${win === w.key ? accent : C.border2}`, background: win === w.key ? alpha(accent, 0.14) : 'transparent', color: win === w.key ? accent : C.text2, fontWeight: 800, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {w.label}
              </button>
            ))}
          </div>
        )}>
        {rows.length
          ? <Table rows={rows} columns={columns} heatMode="sorted" maxRows={rows.length} maxHeight={9999} caption={`Each market against its own job. Last 10: one dot a ${unitWord}, filled by the share that hit.${rows.some((x) => x.lineN > 0) ? ` Beat line counts only the calls with the book's line on file at lock (n under it); a ${unitWord} without one is left out.` : ''}`} />
          : <p style={{ fontSize: 12, color: C.text3 }}>Nothing graded yet.</p>}
      </Section>

      {/* CALLED IT / WHAT GOT AWAY */}
      {called.length ? (
        <Section C={C} NUM_FONT={NUM_FONT} title="CALLED IT">
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {(allCalled ? called : called.slice(0, 3)).map((m) => <Moment key={m.key} m={m} C={C} NUM_FONT={NUM_FONT} accent={accent} Face={Face} />)}
          </div>
          <ShowAll n={called.length - 3} open={allCalled} setOpen={setAllCalled} C={C} accent={accent} />
        </Section>
      ) : null}
      {away.length ? (
        <Section C={C} NUM_FONT={NUM_FONT} title="WHAT GOT AWAY">
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {(allAway ? away : away.slice(0, 3)).map((m) => <Moment key={m.key} m={m} C={C} NUM_FONT={NUM_FONT} accent={C.text3} Face={Face} />)}
          </div>
          <ShowAll n={away.length - 3} open={allAway} setOpen={setAllAway} C={C} accent={accent} />
        </Section>
      ) : null}

      {/* LATER: CHALK vs VALUE, the DASH line split -- only once they exist */}
      {later.length ? (
        <Section C={C} NUM_FONT={NUM_FONT} title="MORE RECORDS">
          {later.map((x) => <div key={x.key} style={{ fontSize: 12, color: C.text2 }}><b style={{ color: C.text }}>{x.label}</b> <span style={{ fontFamily: NUM_FONT }}>{x.value}</span>{x.sub ? <span style={{ color: C.text3 }}> · {x.sub}</span> : null}</div>)}
        </Section>
      ) : null}

      {/* RECEIPTS */}
      {receipts ? (
        <details style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }}>
            RECEIPTS <span style={{ marginLeft: 8, fontWeight: 600, letterSpacing: 0, color: C.text3, fontFamily: 'inherit', fontSize: 12 }}>{receiptsLabel}</span>
          </summary>
          <div style={{ marginTop: 8 }}>{receipts}</div>
        </details>
      ) : null}
    </div>
  )
}
