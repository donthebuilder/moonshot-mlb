'use client'
// IN THE LEDGER (2026-10-07), on the player card of every sport. A short fold, in the Ledger's own words:
//   HIS ROWS   every home run / touchdown / goal night of his this season, in the Called table, counted by
//              CALLED / ON THE BOARD / NOT ON THE BOARD (the words are lib/callStatus STATUS_WORD, drawn by
//              CallStatusBadge), and his last few rows -- the day, the opponent, the status
//   HIS LANES  the numerology lanes that matched tonight, from the same lane list HIS NUMBERS reads
//              (lib/numerology/lanes.js matchLanes) -- pattern watching, said so
//   THE WAY IN a link to The Ledger's Called table, where all of it is
// The rows come from /api/ledger/player (lib/ledger/playerRows.js: the same readers /called uses), fetched
// when the card opens, cached five minutes. No rows is said plainly -- nothing is filled in. Folded by default:
// the summary line (counts) is the button, so the fold already says something before it is opened.
import { useEffect, useMemo, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import CallStatusBadge from '../CallStatusBadge'
import { STATUS_WORD } from '../../lib/callStatus'
import { matchLanes } from '../../lib/numerology/lanes'
import { ledgerHash } from '../../lib/ledger/views'
import { isHiddenSport } from '../../lib/routes'

const SHOW = 5
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * sport, id (his id in that sport), name; jersey / birthDate / next / date feed the lane match
 * (the same props HisNumbers takes on the card, so the two can't disagree).
 */
export default function InTheLedger({ sport, id, name = '', jersey = null, birthDate = null, next = null, date = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [d, setD] = useState(null)
  const [state, setState] = useState('loading')
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const key = id != null ? String(id) : ''
  useEffect(() => {
    if (!key || isHiddenSport(sport)) return undefined
    let live = true
    setState('loading'); setD(null); setAll(false)
    fetch(`/api/ledger/player?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) { setD(j); setState('ok') } })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [sport, key])
  const lanes = useMemo(() => (name && date ? matchLanes({ name, jersey: num(jersey), birthDate, next: num(next), team: null, opp: null }, { date }) : []), [name, jersey, birthDate, next, date])
  if (!key || isHiddenSport(sport)) return null
  // a delay is said once, quietly; the card never waits on it
  if (state === 'error') return null

  const unit = d?.unit || { one: 'row', many: 'rows' }
  const c = d?.counts
  const rows = d?.rows || []
  const shown = all ? rows : rows.slice(0, SHOW)
  const summary = state === 'loading' ? '' : c?.total
    ? `${c.total} ${c.total === 1 ? unit.one : unit.many} this season`
    : `no ${unit.many} this season`
  const th = { textAlign: 'left', color: C.text3, font: `800 10px/1.4 ${NUM_FONT}`, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px 8px 4px 0' }
  const td = { color: C.text, fontFamily: NUM_FONT, fontSize: 12, padding: '7px 8px 7px 0', borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap' }

  return (
    <section aria-label="In the ledger" style={{ borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'transparent', textAlign: 'left', color: C.text2, font: `900 10px/1.3 ${NUM_FONT}`, letterSpacing: '.12em', flexWrap: 'wrap' }}>
        <span aria-hidden style={{ color: accent }}>{open ? '−' : '+'}</span>
        <span>IN THE LEDGER</span>
        {summary && <span style={{ color: c?.total ? accent : C.text3, letterSpacing: '.04em', fontWeight: 800 }}>· {summary}</span>}
        {c?.called > 0 && <span style={{ color: C.text2, letterSpacing: '.04em' }}>· {c.called} {STATUS_WORD.called}</span>}
      </button>
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {state === 'loading' && <p style={{ margin: '4px 0 10px', color: C.text3, fontSize: 12 }}>Reading his rows…</p>}
          {state === 'ok' && !rows.length && (
            <p style={{ margin: '4px 0 10px', color: C.text3, fontSize: 12, lineHeight: 1.5 }}>He has no {unit.many} in the Called table this season, so no row to tag.</p>
          )}
          {state === 'ok' && rows.length > 0 && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', margin: '2px 0 6px', font: `800 11px/1.5 ${NUM_FONT}`, color: C.text2 }}>
                {['called', 'board', 'off'].map((k) => <span key={k}><b style={{ color: k === 'called' ? accent : C.text }}>{c[k]}</b> {STATUS_WORD[k]}</span>)}
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <caption style={{ position: 'absolute', left: -9999 }}>His {unit.many} this season, newest first, each tagged called, on the board or not on the board.</caption>
                <thead><tr><th style={th}>Day</th><th style={th}>vs</th><th style={th}>Status</th></tr></thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.day}-${i}`}>
                      <td style={td}>{day(r.day)}{r.goals > 1 ? ` ×${r.goals}` : ''}</td>
                      <td style={{ ...td, color: C.text2 }}>{r.opp || '—'}</td>
                      <td style={td}><CallStatusBadge status={r.status} size={10} />{r.score != null && r.status !== 'off' ? <span style={{ marginLeft: 6, color: C.text3 }}>{Math.round(r.score)}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > SHOW && (
                <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
                  style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: C.text2, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
                  {all ? 'fewer rows' : `+${rows.length - SHOW} more rows`}
                </button>
              )}
            </>
          )}
          {date && (
            <p style={{ margin: '4px 0 6px', color: C.text2, fontSize: 12, lineHeight: 1.5 }}>
              <b style={{ color: C.text, fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.08em' }}>HIS LANES TONIGHT </b>
              {lanes.length
                ? <>{lanes.length} matched: {[...new Set(lanes.map((m) => m.label))].join(', ')}. Pattern watching, not a prediction.</>
                : <>none line up with the date.</>}
            </p>
          )}
          <a href={ledgerHash(sport, 'called')} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: accent, font: `800 12px/1 ${NUM_FONT}`, textDecoration: 'none' }}>The Ledger, Called table ›</a>
        </div>
      )}
    </section>
  )
}
