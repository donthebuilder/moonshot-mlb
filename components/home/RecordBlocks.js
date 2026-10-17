'use client'
// THE RECORD, ONE COMPONENT FOR EVERY SPORT (2026-10-17, front door; "make cohesive"). Each block is the same: the sport's name in its accent, the one-line question,
// "the record" link, a MOONSHOT DenseTable in the same columns (Group | Scored | Rate | 95% range | Base) with n on every row, one footnote and the same
// "How this is counted" fold. The rows come from lib/dash/recordBlocks.js; nothing is typed or worked out here. The status words (CALLED, ON THE BOARD,
// NOT ON THE BOARD) are lib/callStatus STATUS_WORD's, drawn by CallStatusBadge. Rows of a MOONSHOT or TUDDY block are different questions (each call type
// has its own bar), so those tables are never ranked or heated; LAMP's ladder is nested groups on one question, so its rate column carries the standouts.
import Link from 'next/link'
import DenseTable from '../DenseTable'
import CallStatusBadge from '../CallStatusBadge'
import { Themed } from '../record/LadderBlock'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'
import { C as NFL_C, NUM_FONT as NFL_NUM } from '../../lib/nfl/theme'
import { C as NHL_C, NUM_FONT as NHL_NUM } from '../../lib/nhl/theme'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { BRAND } from '../../lib/routes'

const THEME = { mlb: { C: MLB_C, num: MLB_NUM }, nfl: { C: NFL_C, num: NFL_NUM }, nhl: { C: NHL_C, num: NHL_NUM } }

function columns(accent, T, heat) {
  return [
    {
      key: 'label', label: 'Group', group: 'Call', sticky: true, heat: false, plain: true, w: 140,
      fmt: (v, r) => (r.status ? <CallStatusBadge status={r.status} accent={accent} size={10} /> : <b>{v}</b>),
    },
    { key: 'bar', label: 'Graded on', group: 'Call', heat: false, w: 84, fmt: (v) => v || '—', title: 'The bar a call had to clear' },
    { key: 'scored', label: 'Scored', group: 'Result', heat: false, mono: true, w: 84, title: 'Calls that cleared, of all graded' },
    { key: 'ratev', label: 'Rate', group: 'Result', heat, numeric: true, w: 64, fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`), title: 'Cleared, as a share of graded' },
    { key: 'band', label: '95% range', group: 'Result', heat: false, mono: true, w: 82, title: 'Where the true rate plausibly sits, given how many calls there are' },
    { key: 'base', label: 'Every player', group: 'Base', heat: false, mono: true, w: 108, title: 'The rate for everyone on the same bar: the number a call has to beat' },
  ]
}

function Block({ b }) {
  const { C: T, num } = THEME[b.sport]
  const accent = SPORT_ACCENT[b.sport]
  return (
    <section aria-label={`${BRAND[b.sport].name} record`} style={{ margin: '0 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', margin: '0 0 8px' }}>
        <span style={{ fontFamily: num, fontSize: 12, fontWeight: 900, letterSpacing: '.14em', color: accent }}>{BRAND[b.sport].name} · {BRAND[b.sport].league}</span>
        <span style={{ fontSize: 12, color: T.text2 }}>{b.question}</span>
        <Link href={b.href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginLeft: 'auto', color: T.text, fontSize: 12, fontWeight: 700 }}>the record →</Link>
      </div>
      <Themed sport={b.sport}>
        <DenseTable rows={b.rows} columns={columns(accent, T, b.heat)} heatMode={b.heat ? 'standouts' : 'none'} bare maxHeight={9999} maxRows={b.rows.length}
          accent={accent} caption={`${BRAND[b.sport].name} record: ${b.question}`} />
      </Themed>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: T.text3 }}>{b.foot}</p>
      {b.aside ? <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: T.text3 }}><b style={{ color: T.text2, fontFamily: num, letterSpacing: '.06em', fontSize: 11 }}>{b.aside.label}</b> {b.aside.text}</p> : null}
      <details style={{ borderTop: `1px solid ${T.border}`, marginTop: 8 }}>
        <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 700 }}>
          <span style={{ color: accent, marginRight: 6 }}>+</span> How this is counted
        </summary>
        <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.6, color: T.text3 }}>
          {b.how}
        </p>
        <Link href={b.ledger} style={{ display: 'flex', alignItems: 'center', minHeight: 44, color: T.text2, fontSize: 12, textDecoration: 'underline' }}>Every night behind these numbers: the Ledger&apos;s Record tab →</Link>
      </details>
    </section>
  )
}

export default function RecordBlocks({ blocks }) {
  return <>{blocks.map((b) => <Block key={b.sport} b={b} />)}</>
}
