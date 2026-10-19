'use client'
import { useEffect, useState } from 'react'
import { dateNumberRows, dayBefore, NUMBERS_NOTE } from '../../lib/numerology/dayNumbers'

// TODAY'S NUMBERS and YESTERDAY (2026-10-10, Donovan). Two tables that name the day's numbers: each with the sum that
// makes it and its reduction (11 / 22 / 33 flagged as master), then what ran hot today and what YESTERDAY'S numbers
// did on the graded night (real rows from /api/numerology/day and /api/numerology/hot; "not recorded" when there are
// none, never a guess). `date` is the GAME's own date; yesterday is the calendar day before it, never the wall clock.
// Shared by every sport's Numerology tab and Ledger (MOONSHOT's chip/table look, the sport's accent). Phone: four rows
// each, the rest behind one tap. Information only.
const PREVIEW = 4
const pct = (v) => (v == null ? '—' : `${(100 * v).toFixed(1)}%`)
const fmt = (d) => String(d || '').slice(5).replace('-', '/').replace(/^0/, '')

function useJson(url) {
  const [d, setD] = useState(undefined)
  useEffect(() => {
    if (!url) return undefined
    let alive = true
    setD(undefined)
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setD(j) }).catch(() => { if (alive) setD(null) })
    return () => { alive = false }
  }, [url])
  return d
}

export default function DayNumbers({ sport, date, theme: C, numFont, accent, eventWord = 'events' }) {
  const yday = dayBefore(date)
  const hot = useJson(date ? `/api/numerology/hot?sport=${encodeURIComponent(sport)}` : null)
  const recap = useJson(yday ? `/api/numerology/day?sport=${encodeURIComponent(sport)}&day=${yday}` : null)
  const [openT, setOpenT] = useState(false)
  const [openY, setOpenY] = useState(false)
  const [yOpen, setYOpen] = useState(false)
  if (!date) return null
  const box = { padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }
  const head = (t, d) => <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont, marginBottom: 4 }}>{t} <span style={{ color: C.text3 }}>· {fmt(d)}</span></div>
  const small = { fontSize: 11, color: C.text3, lineHeight: 1.45 }
  const numCols = [
    { key: 'label', label: 'Number', heat: false, sticky: true, w: 118, fmt: (v, r) => <b>{v}{r.master ? <span style={{ marginLeft: 4, fontSize: 10, color: accent }}>master</span> : null}</b> },
    { key: 'value', label: 'Is', heat: false, w: 44, dp: 0 },
    { key: 'reduces', label: 'Reduces', heat: false, w: 104, fmt: (v) => <span style={{ fontFamily: numFont }}>{v}</span> },
    { key: 'how', label: 'How', heat: false, w: 150, fmt: (v) => <span style={{ color: C.text3, whiteSpace: 'normal' }}>{v}</span> },
  ]
  // THE NUMBERS AS TILES (Donovan 10-18: "make this easier to read, chip things up, make it look cool"). Each number is a tile in an
  // even grid: its name small, the number big, its reduction beside it (11 / 22 / 33 marked master); the sum that makes it rides the
  // tile's title. Four show, then all of them. Same rows as the table that was here (dateNumberRows).
  const table = (rows, open, setOpen, cap) => {
    const shown = open ? rows : rows.slice(0, PREVIEW)
    return (
      <>
        <div role="list" aria-label={cap} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {shown.map((r) => (
            <div role="listitem" key={r.key} title={r.how} style={{ padding: '7px 9px', border: `1px solid ${r.master ? accent : C.border}`, borderRadius: 9, background: C.bg }}>
              <div style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}{r.master ? <span style={{ marginLeft: 4, color: accent, fontWeight: 800 }}>master</span> : null}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <b style={{ fontFamily: numFont, fontSize: 20, color: C.text }}>{r.value}</b>
                {r.reduces && String(r.reduces) !== String(r.value) ? <span style={{ fontFamily: numFont, fontSize: 11, color: C.text3 }}>{String(r.reduces).replace(/^\S+\s*/, '')}</span> : null}
              </div>
            </div>
          ))}
        </div>
        {rows.length > PREVIEW && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ marginTop: 6, minHeight: 44, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{open ? 'Fewer' : `All ${rows.length} numbers`}</button>}
      </>
    )
  }
  // today's hot values: the live count so far when there is one, else the last graded night; then the trend
  const hotRows = (() => {
    if (!hot?.configured) return []
    const lead = hot.live?.hot?.length ? hot.live.hot : hot.today?.hot || []
    const src = hot.live?.hot?.length ? 'so far' : hot.today?.day ? `graded ${fmt(hot.today.day)}` : ''
    return [...lead.map((r) => ({ ...r, when: src || 'today' })), ...(hot.trending || []).slice(0, 3).map((r) => ({ ...r, when: `last ${hot.windowDays}d` }))]
      .map((r, i) => ({ ...r, _key: `${r.when}|${r.kind}|${r.value}|${i}` }))
  })()
  const y = recap && recap.graded ? recap : null
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section aria-label="Today's numbers" style={box}>
        {head("TODAY'S NUMBERS", date)}
        {table(dateNumberRows(date), openT, setOpenT, `The numbers for ${date}`)}
        {hotRows.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...small, fontWeight: 800, color: C.text2 }}>HOT AND TRENDING NUMBERS</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {hotRows.slice(0, 4).map((r) => (
                <li key={r._key} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', alignItems: 'baseline', padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
                  <b style={{ fontFamily: numFont, fontSize: 16, minWidth: 30, color: C.text }}>{r.value}</b>
                  <span style={{ color: C.text2 }}>{r.label} <span style={{ color: C.text3 }}>· {r.when}</span></span>
                  <span style={{ marginLeft: 'auto', fontFamily: numFont, color: C.text3, fontSize: 11 }}>{r.events} {eventWord} vs {Number(r.expected).toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ ...small, marginTop: 6 }}>{NUMBERS_NOTE}</div>
      </section>
      {/* YESTERDAY, FOLDED (10-18: less scroll): one row until it is opened; the same numbers and what they did */}
      {yday && (
        <section aria-label="Yesterday's numbers" style={box}>
          <button type="button" onClick={() => setYOpen((v) => !v)} aria-expanded={yOpen}
            style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, margin: '-8px 0', padding: 0, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ flex: 1 }}>{head('YESTERDAY', yday)}</span>
            <span aria-hidden="true" style={{ color: accent, fontFamily: numFont, fontSize: 12 }}>{yOpen ? '▴' : 'what they did ▾'}</span>
          </button>
          {yOpen && <div style={{ marginTop: 10 }}>{table(dateNumberRows(yday), openY, setOpenY, `The numbers for ${yday}`)}</div>}
          {yOpen && <div style={{ marginTop: 8 }}>
            <div style={{ ...small, fontWeight: 800, color: C.text2 }}>WHAT THEY DID</div>
            {recap === undefined ? <div style={small}>Loading the record…</div>
              : !y ? <div style={small}>Nothing graded for {fmt(yday)} yet (a day with no game stays empty). It fills in after the finals; nothing is guessed.</div>
                : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {y.udRows.slice(0, 3).map((r) => (
                      <li key={`ud${r.kind}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', alignItems: 'baseline', padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
                        <span style={{ color: C.text2 }}>{r.label} {r.value} <span style={{ color: C.text3 }}>(the Universal Day)</span></span>
                        <span style={{ marginLeft: 'auto', fontFamily: numFont, color: C.text3, fontSize: 11 }}>{r.events} {eventWord} vs {Number(r.expected).toFixed(1)}</span>
                      </li>
                    ))}
                    {y.lanes.slice(0, 3).map((l) => (
                      <li key={l.lane} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', alignItems: 'baseline', padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
                        <span style={{ color: C.text2, minWidth: 0 }}>{l.label}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: numFont, color: C.text3, fontSize: 11, whiteSpace: 'nowrap' }}>{l.hits}/{l.matched} · all {pct(l.eligible ? l.eligibleHits / l.eligible : null)}</span>
                      </li>
                    ))}
                    {!y.udRows.length && !y.lanes.length && <li style={small}>{y.events} {eventWord} on the night; no recorded value or date lane to report.</li>}
                    {(y.udRows.length > 3 || y.lanes.length > 3) && <li style={small}>+{Math.max(0, y.udRows.length - 3) + Math.max(0, y.lanes.length - 3)} more in the lane scoreboard below</li>}
                  </ul>
                )}
          </div>}
        </section>
      )}
    </div>
  )
}
