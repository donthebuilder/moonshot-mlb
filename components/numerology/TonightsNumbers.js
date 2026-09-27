'use client'
import { dateNumbers, universal, isFib, MASTER } from '../../lib/numerology/core'

// TONIGHT'S NUMBERS (2026-09-27, BATCH-NUMEROLOGY step 4): what every lane
// is matched against, at the top of each product's Numerology page. The
// UNIVERSAL DAY leads (every digit of the date, reduced; 11 / 22 / 33 shown
// as themselves), then the date numbers. From the GAME's own date the page
// hands in -- never the wall clock. Pattern watching; never in a score.
export default function TonightsNumbers({ date, theme: C, numFont, accent, label = null }) {
  const dn = dateNumbers(date)
  const u = universal(date)
  if (!dn || !u) return null
  const chips = [
    ['FULL', dn.full, 'month + day + every year digit'],
    ['SHORT', dn.short, 'month + day + the last two year digits'],
    ['M+D', dn.md, 'month + day'],
    ['ROOT', dn.root, 'every digit, reduced'],
    ['DAY', dn.dayOfYear, `day of the year (${dn.daysLeft} left)`],
  ]
  // ROOT is always 1-9, and five of those nine are Fibonacci -- never flagged.
  const fibs = chips.filter(([k, v]) => k !== 'ROOT' && isFib(v)).map(([k]) => k)
  return (
    <section aria-label="Tonight's numbers" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 96 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont }}>UNIVERSAL DAY</span>
        <span style={{ fontFamily: numFont, fontSize: 30, fontWeight: 900, lineHeight: 1.05, color: C.text }}>
          {u.day.value}{MASTER.has(u.day.value) ? <span style={{ fontSize: 11, color: C.text3, marginLeft: 6 }}>master · {u.day.root}</span> : null}
        </span>
        {label && <span style={{ fontSize: 11, color: C.text3 }}>{label}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {chips.map(([k, v, title]) => (
          <span key={k} title={title} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: numFont }}>
            <span style={{ fontSize: 11, color: C.text3, fontWeight: 800 }}>{k}</span>
            <b style={{ fontSize: 14, color: C.text }}>{v}</b>
          </span>
        ))}
      </div>
      <span style={{ flexBasis: '100%', fontSize: 11, color: C.text3 }}>
        Universal year {u.year.value} · month {u.month.value}{fibs.length ? ` · Fibonacci tonight: ${fibs.join(', ')}` : ''}. Pattern watching, never part of a score.
      </span>
    </section>
  )
}
