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
import { digitRoot, lifePathOf, personal, universal, isFib } from '../lib/numerology/core'
import { gematria, letters, BASE_CIPHERS, CIPHERS, dateWritten } from '../lib/numerology/gematria'
import { matchLanes, displayLanes, LANE_SHORT } from '../lib/numerology/lanes'

const SHORT = { ordinal: 'Ordinal', fullReduction: 'Full Red.', reverseOrdinal: 'Rev. Ordinal', reverseReduction: 'Rev. Red.' }
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * name, jersey, birthDate, next (his next HR / TD / goal), career (his next
 * career one, optional), nextWord ('HR' | 'TD' | 'goal'), date (YYYY-MM-DD,
 * the slate's own), theme C (text/text2/text3/border), accent, numFont.
 */
export default function HisNumbers({ name, jersey = null, birthDate = null, next = null, career = null, nextWord = 'HR', date, theme: C, accent, numFont, look = 'block' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (window.matchMedia('(min-width: 700px)').matches) setOpen(true) } catch { /* folded */ }
  }, [])
  if (look === 'strip') return <NumbersStrip {...{ name, jersey, birthDate, next, nextWord, date, C, accent, numFont }} />
  if (!name) return null

  const j = num(jersey); const n = num(next); const cn = num(career)
  const g = gematria(name)
  const L = letters(name)
  const lp = lifePathOf(birthDate)
  const pe = date ? personal(birthDate, date) : null
  const when = dateWritten(date)
  const matches = date ? displayLanes(matchLanes({ name, jersey: j, birthDate, next: n, team: null, opp: null }, { date })) : []
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

// THE STRIP (2026-10-22, Donovan: "the jersey number reduce and the life path and the personal day number and their next HR
// are the ones people look at the most. So keep that towards the top ... and if they're matching or aligning, just kind of
// let them know. The gematria stuff is only cool when they match"). Four tiles near the top of the card; a tile lights when
// its number is shared with another tile or tonight's Universal Day, and the ALIGNED line names what lines up. The name
// ciphers never print here: a cipher shows only as a match (its lane tag), and the full workings live in the Ledger.
function NumbersStrip({ name, jersey, birthDate, next, nextWord, date, C, accent, numFont }) {
  if (!name) return null
  const j = num(jersey); const n = num(next)
  const lp = lifePathOf(birthDate)
  const pe = date ? personal(birthDate, date) : null
  const ud = date ? universal(date) : null
  const tiles = [
    j != null && { k: 'Jersey', big: `#${j}`, root: digitRoot(j), sub: `→ ${digitRoot(j)}` },
    lp != null && { k: 'Life path', big: String(lp), root: digitRoot(lp), sub: null },
    pe && { k: 'Personal day', big: String(pe.day.value), root: pe.day.root, sub: pe.day.value !== pe.day.root ? `→ ${pe.day.root}` : null },
    n != null && { k: `Next ${nextWord}`, big: `#${n}`, root: digitRoot(n), sub: `→ ${digitRoot(n)}` },
  ].filter(Boolean)
  if (!tiles.length) return null
  const udRoot = ud?.day?.root ?? null
  const roots = tiles.map((t) => t.root).concat(udRoot != null ? [udRoot] : [])
  const lit = (t) => roots.filter((r) => r === t.root).length > 1
  // what lines up: the tiles that share a root (and the Universal Day), then every lane that matched tonight
  const shared = [...new Set(tiles.filter(lit).map((t) => t.root))].map((r) => {
    const who = tiles.filter((t) => t.root === r).map((t) => t.k.toLowerCase())
    if (udRoot === r) who.push('the day')
    return `${who.join(' · ')} = ${r}`
  })
  const lanes = date ? displayLanes(matchLanes({ name, jersey: j, birthDate, next: n, team: null, opp: null }, { date })) : []
  const cipherHits = lanes.filter((m) => m.cipher).map((m) => ({ tag: LANE_SHORT[m.lane] || m.short, text: m.text }))
  const aligned = shared.length > 0 || cipherHits.length > 0
  return (
    <section aria-label="His numbers" style={{ margin: '0 0 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 6 }}>
        {tiles.map((t) => {
          const on = lit(t)
          return (
            <div key={t.k} title={on ? 'Lines up with another number tonight' : undefined}
              style={{ border: `1px solid ${on ? accent : C.border}`, borderRadius: 8, padding: '5px 8px', minWidth: 0 }}>
              <div style={{ color: on ? accent : C.text3, font: `800 9px/1.3 ${numFont}`, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t.k}</div>
              <div style={{ color: on ? accent : C.text, font: `900 16px/1.2 ${numFont}`, whiteSpace: 'nowrap' }}>
                {t.big}{t.sub && <span style={{ color: on ? accent : C.text3, fontSize: 11, fontWeight: 700 }}> {t.sub}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 4, font: `700 10px/1.45 ${numFont}`, color: aligned ? accent : C.text3, letterSpacing: '.03em' }}>
        {aligned
          ? <>ALIGNED · {[...shared, ...cipherHits.map((h) => h.tag)].map((x, i) => <span key={i} title={cipherHits.find((h) => h.tag === x)?.text}>{i ? ' · ' : ''}{x}</span>)}</>
          : <>Nothing lines up tonight{udRoot != null ? ` (Universal Day ${udRoot})` : ''}.</>}
      </div>
    </section>
  )
}
