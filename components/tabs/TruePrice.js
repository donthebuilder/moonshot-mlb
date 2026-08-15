'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { fetchJSON } from '../../lib/data'
import { oddsHistoryPaths } from '../../lib/dataSource'
import { fmtOdds } from '../../lib/odds'
import {
  flatten, priceText, historyLooksReal, readsAs, MARKET_LABEL, MARKET_ORDER,
} from '../../lib/oddsHistory'

// 🏷 TRUE PRICE
//
// Donovan, 2026-08-15: "a page where it track players who go at what price for
// certain props that way we can find the true price of a player to do certian
// things."
//
// Two prices per row and they are not the same kind of thing:
//
//   TRUE      what his own rate says the bet is worth
//   GOES AT   what the book has actually been paying him
//
// The gap between them is the entire product of this page. Positive means the
// market has been slow on him; negative means you have been paying up for a
// name. Everything else here exists to stop that gap being believed too early.
//
// FETCHED ON OPEN, not by the Dashboard. This payload is season-scale and does
// not change during a slate, so putting it in the poll would re-download a few
// hundred KB every 60 seconds to show the same numbers.

const SORTS = [
  ['gap', 'Biggest gap'],
  ['rate', 'Hit rate'],
  ['n', 'Most nights'],
  ['price', 'Longest true price'],
  ['name', 'Name'],
]

const chip = (on) => ({
  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
  fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.orange : C.border}`,
  background: on ? 'rgba(249,115,22,.14)' : 'transparent',
  color: on ? C.orange : C.text3,
})

const th = { fontSize: 8.5, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 6px 4px', whiteSpace: 'nowrap' }

export default function TruePrice({ onPlayerClick }) {
  const [hist, setHist] = useState(undefined)   // undefined = loading, null = absent
  const [market, setMarket] = useState('all')
  const [minN, setMinN] = useState(10)
  const [sort, setSort] = useState('gap')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    fetchJSON(oddsHistoryPaths(), historyLooksReal)
      .then((j) => { if (alive) setHist(j || null) })
      .catch(() => { if (alive) setHist(null) })
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => flatten(hist, { minN }), [hist, minN])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = rows.filter((x) => x.n >= minN)
    if (market !== 'all') r = r.filter((x) => x.market === market)
    if (needle) r = r.filter((x) => x.name.toLowerCase().includes(needle) || x.team.toLowerCase().includes(needle))
    const by = {
      // DEFAULT. Sorted by the gap, but PROVEN gaps first — a 30-point gap on
      // eleven nights ranking above a 9-point gap on ninety would be the page
      // telling a lie with a sort order.
      gap: (a, b) => (rank(b) - rank(a)) || (b.edge - a.edge),
      rate: (a, b) => b.rate - a.rate,
      n: (a, b) => b.n - a.n,
      price: (a, b) => (b.truePrice ?? -1e9) - (a.truePrice ?? -1e9),
      name: (a, b) => a.name.localeCompare(b.name) || a.marketLabel.localeCompare(b.marketLabel),
    }
    return [...r].sort(by[sort] || by.gap)
  }, [rows, market, minN, sort, q])

  if (hist === undefined) {
    return <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 18 }}>Loading the price history…</div>
  }

  // ── nothing published yet ─────────────────────────────────────────────────
  if (!hist || !hist.days?.length) {
    return (
      <Shell>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px',
          background: C.bg2, fontSize: 12, lineHeight: 1.65, color: C.text2, maxWidth: 720,
        }}>
          <b style={{ color: C.text }}>No history yet.</b> This page starts filling the first night an
          odds snapshot and a graded results file exist for the <b>same date</b> — the bot keeps a
          dated copy of every pre-game price it fetches, then settles each one against that night&apos;s
          box score.
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 8 }}>
            Needs the odds workflow to have run before first pitch and the grading workflow to have
            run after. One night of both, and the first rows appear.
          </div>
          {hist?.priced_not_graded?.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.orange, marginTop: 8, fontFamily: NUM_FONT }}>
              Priced but not yet graded: {hist.priced_not_graded.join(', ')}
            </div>
          )}
        </div>
      </Shell>
    )
  }

  const marketsPresent = MARKET_ORDER.filter((m) => rows.some((r) => r.market === m))

  return (
    <Shell days={hist.days} settled={hist.settled_props} stamp={hist.generated_at_human}>
      {/* ── controls ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        <button onClick={() => setMarket('all')} style={chip(market === 'all')}>All props</button>
        {marketsPresent.map((m) => (
          <button key={m} onClick={() => setMarket(m)} style={chip(market === m)}>{MARKET_LABEL[m]}</button>
        ))}
        <span style={{ width: 8 }} />
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Min nights</span>
        {[5, 10, 20, 40].map((v) => (
          <button key={v} onClick={() => setMinN(v)} style={chip(minN === v)}
            title={`Only rows with at least ${v} graded nights at that exact line`}>{v}</button>
        ))}
        <span style={{ width: 8 }} />
        {SORTS.map(([k, label]) => (
          <button key={k} onClick={() => setSort(k)} style={chip(sort === k)}>{label}</button>
        ))}
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="player or team"
          style={{
            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10.5, padding: '4px 9px',
            borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text, minWidth: 130, outline: 'none',
          }}
        />
      </div>

      {!shown.length ? (
        <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.6, padding: '10px 2px' }}>
          Nothing at {minN}+ nights{market !== 'all' ? ` on ${MARKET_LABEL[market]}` : ''}
          {q ? ` matching "${q}"` : ''}. {hist.days.length < minN
            ? `The history is ${hist.days.length} night${hist.days.length === 1 ? '' : 's'} old, so no row can clear that bar yet — try 5.`
            : 'Try a lower minimum or another prop.'}
        </div>
      ) : (
        <div className="dense-scroll rail" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 2px', fontFamily: NUM_FONT }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Player</th>
                <th style={{ ...th, textAlign: 'left' }}>Prop</th>
                <th style={th} title="Nights he was priced at this exact line AND graded. Games he never batted in are void, not misses.">N</th>
                <th style={th}>Hit rate</th>
                <th style={th} title="The American price at which his own rate breaks even. This is the number the page is named after.">True</th>
                <th style={th} title="What the book has actually been paying him, averaged as probability and converted back.">Goes at</th>
                <th style={th} title="His rate minus what those prices needed. Positive = the market has been slow on him.">Gap</th>
                <th style={{ ...th, textAlign: 'left' }} title="Whether the gap is bigger than its own error bar.">Reads as</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((r) => {
                const t = readsAs(r.trust, r.edge)
                const isOpen = open === r.id
                return (
                  <Fragment key={r.id}>
                    <tr onClick={() => setOpen(isOpen ? null : r.id)}
                      style={{ cursor: 'pointer', background: isOpen ? 'rgba(249,115,22,.07)' : 'transparent' }}>
                      <td style={{ fontSize: 11.5, fontWeight: 700, color: C.text, padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        <span
                          onClick={(e) => { e.stopPropagation(); onPlayerClick?.({ player_id: r.pid, player_name: r.name, team: r.team }) }}
                          style={{ borderBottom: `1px dotted ${C.border2}` }}
                          title="Open his card"
                        >{r.name}</span>
                        {r.team && <span style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{r.team}</span>}
                      </td>
                      <td style={{ fontSize: 10.5, color: C.text2, padding: '4px 6px', whiteSpace: 'nowrap' }}>{r.label}</td>
                      <td style={{ ...cell, color: C.text3 }} title={`${r.hits} of ${r.n}`}>{r.n}</td>
                      <td style={{ ...cell, color: C.text, fontWeight: 900 }}
                        title={`${r.hits}/${r.n} · ±${r.se} points of error at this sample`}>
                        {r.rate.toFixed(0)}%
                      </td>
                      <td style={{ ...cell, color: C.orange, fontWeight: 900 }}>
                        {priceText(r.truePrice, r.rate, r.n)}
                      </td>
                      <td style={{ ...cell, color: C.text2 }} title={`needs ${r.avgImplied}% to break even`}>
                        {r.avgPrice != null ? fmtOdds(r.avgPrice) : '—'}
                      </td>
                      <td style={{
                        ...cell, fontWeight: 900,
                        color: r.trust === 'real' ? (r.edge > 0 ? '#4ade80' : '#f87171') : C.text2,
                      }} title={r.z != null ? `${r.edge > 0 ? '+' : ''}${r.edge} points, error bar ±${r.se} → ${r.z} standard errors` : ''}>
                        {r.edge > 0 ? '+' : ''}{r.edge.toFixed(0)}
                      </td>
                      <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                        <span title={t.why} style={{
                          fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '1.5px 7px',
                          borderRadius: 999, border: `1px solid ${t.tone}55`, background: `${t.tone}14`, color: t.tone,
                        }}>{t.label}</span>
                        {r.z != null && <span style={{ fontSize: 8.5, color: C.text3, marginLeft: 6 }}>{r.z > 0 ? '+' : ''}{r.z}σ</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: '2px 8px 8px' }}>
                          {/* THE RECEIPTS. Without these the two prices above are
                              a claim; with them they're checkable. */}
                          <div style={{
                            display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center',
                            fontSize: 9.5, color: C.text3,
                          }}>
                            <span>last {r.log.length} nights, newest first:</span>
                            {r.log.map(([date, over, got], i) => (
                              <span key={i} title={`${date} — priced ${fmtOdds(over)}, ${got ? 'cleared' : 'missed'}`} style={{
                                padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                                border: `1px solid ${got ? 'rgba(74,222,128,.35)' : C.border}`,
                                background: got ? 'rgba(74,222,128,.08)' : 'transparent',
                                color: got ? '#4ade80' : C.text3,
                              }}>{date.slice(5)} {fmtOdds(over)}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {shown.length > 300 && (
            <div style={{ fontSize: 9.5, color: C.text3, padding: '6px 2px' }}>
              Showing the first 300 of {shown.length} — narrow it with a prop filter or the search box.
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

const cell = { textAlign: 'center', fontSize: 11, padding: '4px 6px', whiteSpace: 'nowrap' }

// Rows sort by how much the sample backs them FIRST, so a proven small gap
// outranks an unproven big one. This is the whole reason the page can be
// trusted at a glance.
const RANK = { real: 3, leaning: 2, noise: 1, thin: 0 }
const rank = (r) => RANK[r.trust] ?? 0

function Shell({ days, settled, stamp, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 900 }}>🏷 True Price</span>
        {days && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {days.length} graded night{days.length === 1 ? '' : 's'} · {settled?.toLocaleString?.() || settled} settled props
            {days.length ? ` · ${days[0]} → ${days[days.length - 1]}` : ''}
            {stamp ? ` · built ${stamp}` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, maxWidth: 780, marginBottom: 11 }}>
        Every price the bot fetched before first pitch, settled against that night&apos;s box score.
        <b style={{ color: C.text }}> True</b> is what his own rate says the bet is worth;
        <b style={{ color: C.text }}> Goes at</b> is what the book has actually been paying him. The
        gap between the two is the point — but a gap is not an edge until it clears its own error
        bar, so rows that haven&apos;t are labelled and sorted below the ones that have.
      </div>
      {children}
    </div>
  )
}
