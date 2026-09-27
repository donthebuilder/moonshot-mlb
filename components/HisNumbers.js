'use client'
// 🔢 HIS NUMBERS (numerology step 7, 2026-09-27): one small block on the
// player card, all three products, reading the one engine
// (lib/numerology/*). Jersey, life path, personal day, his name in the 4
// base ciphers, initials, his next (and career-next, where the card has it)
// number, then whatever lines up with the date, from the same lane list the
// Numerology pages and the posts read.
//
// Flavour, not the headline: folded by default on a phone (open on a wide
// screen; a plain button, so it works by tap with no hover), at the bottom of the card, and it never touches a score, a board
// or a rank. A field the card doesn't have leaves its row out -- never a 0.
import { Fragment, useEffect, useState } from 'react'
import { digitRoot, lifePathOf, personal, isFib } from '../lib/numerology/core'
import { gematria, letters, BASE_CIPHERS, CIPHERS, dateWritten } from '../lib/numerology/gematria'
import { matchLanes } from '../lib/numerology/lanes'

const SHORT = { ordinal: 'Ordinal', fullReduction: 'Full Red.', reverseOrdinal: 'Rev. Ordinal', reverseReduction: 'Rev. Red.' }
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * name, jersey, birthDate, next (his next HR / TD / goal), career (his next
 * career one, optional), nextWord ('HR' | 'TD' | 'goal'), date (YYYY-MM-DD,
 * the slate's own), theme C (text/text2/text3/border), accent, numFont.
 */
export default function HisNumbers({ name, jersey = null, birthDate = null, next = null, career = null, nextWord = 'HR', date, theme: C, accent, numFont }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (window.matchMedia('(min-width: 700px)').matches) setOpen(true) } catch { /* folded */ }
  }, [])
  if (!name) return null

  const j = num(jersey); const n = num(next); const cn = num(career)
  const g = gematria(name)
  const L = letters(name)
  const lp = lifePathOf(birthDate)
  const pe = date ? personal(birthDate, date) : null
  const when = dateWritten(date)
  const matches = date ? matchLanes({ name, jersey: j, birthDate, next: n, team: null, opp: null }, { date }) : []
  const fib = (v) => (v != null && v > 0 && isFib(v) ? ' · Fibonacci' : '')

  const rows = [
    j != null && ['Jersey', `#${j} → ${digitRoot(j)}${fib(j)}`],
    lp != null && ['Life path', String(lp)],
    pe && when && ['Personal day', `${pe.day.value} on ${when.full}`],
    g?.full && ['Name', BASE_CIPHERS.map((c, i) => <Fragment key={c}>{i ? ' · ' : ''}<span style={{ whiteSpace: 'nowrap' }}>{SHORT[c]} {g.full[c].value}</span></Fragment>)],
    L && ['Initials', `${L.initials} (${L.sum}) · ${L.letters} letters`],
    n != null && [`Next ${nextWord}`, `#${n}${fib(n)}`],
    cn != null && [`Career ${nextWord}`, `#${cn}${fib(cn)}`],
  ].filter(Boolean)

  const label = { color: C.text3, font: `800 9px/1.4 ${numFont}`, letterSpacing: '.1em', textTransform: 'uppercase', padding: '6px 10px 6px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }
  const value = { color: C.text, fontFamily: numFont, fontSize: 12, padding: '6px 0', lineHeight: 1.4 }

  return (
    <section aria-label="His numbers" style={{ borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'transparent', textAlign: 'left', color: C.text2, font: `900 10px/1 ${numFont}`, letterSpacing: '.12em' }}>
        <span aria-hidden style={{ color: accent }}>{open ? '−' : '+'}</span>
        HIS NUMBERS
        {matches.length > 0 && <span style={{ color: accent, letterSpacing: '.06em' }}>· {matches.length} MATCH{matches.length === 1 ? '' : 'ES'}{when ? ` ON ${when.short}` : ''}</span>}
      </button>
      {open && <>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td style={label}>{k}</td><td style={value}>{v}</td></tr>)}
        </tbody>
      </table>
      {when && (
        matches.length
          ? <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {matches.map((m, i) => <li key={`${m.lane}-${i}`} style={{ color: C.text2, fontSize: 12, lineHeight: 1.45 }}><b style={{ color: accent }}>{m.label}:</b> {m.text}</li>)}
            </ul>
          : <p style={{ margin: '8px 0 0', color: C.text3, fontSize: 12 }}>Nothing lines up with {when.full}.</p>
      )}
      <p style={{ margin: '8px 0 10px', color: C.text3, fontSize: 11 }}>Pattern watching, not prediction. Names in {BASE_CIPHERS.map((c) => CIPHERS[c].label).join(', ')}.</p>
      </>}
    </section>
  )
}
