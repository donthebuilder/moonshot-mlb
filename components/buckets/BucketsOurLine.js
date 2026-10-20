'use client'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { Kicker, fmtTip } from './ui'

// 🏀 OUR LINE BESIDE THE BOOK'S, FOR ONE GAME (2026-10-19, Donovan: info only, no CALLED, no %). One small table, the
// Expected points table's look: each club's spread from our margin (lib/nba/gameLines.js), the book's spread and its
// moneyline (SGO, odds_game_lines). After tip it is the line locked before tip, or nothing. Never a chance of anything.
export const OUR_LINE_WORDS = 'Our line'

/** -3.5 -> "-3.5", 2 -> "+2", 0 -> "PK" (pick'em). */
export const fmtSpread = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Math.abs(v) < 0.05 ? 'PK' : `${v > 0 ? '+' : ''}${Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 1)}`)
const fmtMl = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}`)

export default function BucketsOurLine({ line, onOpenTeam, onOpenPlayer }) {
  if (!line?.our) return null
  const m = line.our.margin
  const bs = line.book?.spread_home
  const rows = [
    { abbrev: line.away, our: m, book: bs == null ? null : -bs, ml: line.book?.ml_away, out: line.out?.away, b2b: line.b2b?.away },
    { abbrev: line.home, our: -m, book: bs, ml: line.book?.ml_home, out: line.out?.home, b2b: line.b2b?.home },
  ]
  const cell = { padding: '0 6px', textAlign: 'right', fontFamily: NUM_FONT, fontSize: 13, minWidth: 44 }
  const outs = rows.flatMap((r) => (r.out || []).map((p) => ({ ...p, club: r.abbrev })))
  const counted = rows.every((r) => r.out != null)
  return (
    <section aria-label={OUR_LINE_WORDS}>
      <Kicker>{OUR_LINE_WORDS.toUpperCase()}{line.locked && line.state !== 'pre' ? ' · LOCKED BEFORE TIP' : ''}</Kicker>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.bg2 }}>
        <caption className="sr-only">Our spread for each club beside the sportsbooks’ spread and moneyline. Information, not a pick.</caption>
        <thead><tr style={{ color: C.text3, fontSize: 11 }}>
          <th scope="col" style={{ ...cell, textAlign: 'left', height: 32 }}>CLUB</th>
          <th scope="col" style={{ ...cell, color: C.purple }}>OURS</th>
          <th scope="col" style={cell}>BOOK</th>
          <th scope="col" style={cell}>ML</th>
        </tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.abbrev} style={{ borderTop: `1px solid ${C.border}` }}>
            <th scope="row" style={{ ...cell, textAlign: 'left', height: 44 }}>
              <Tap onClick={() => onOpenTeam?.(t.abbrev)} title={t.abbrev}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TeamMark sport="nba" abbr={t.abbrev} variant="logo" px={20} />{t.abbrev}
                  {t.b2b ? <span title="Second night of a back-to-back" style={{ color: C.text3, fontSize: 11 }}>B2B</span> : null}</span>
              </Tap>
            </th>
            <td style={{ ...cell, fontWeight: 900, color: C.text }}>{fmtSpread(t.our)}</td>
            <td style={{ ...cell, color: C.text2 }}>{fmtSpread(t.book)}</td>
            <td style={{ ...cell, color: C.text2 }}>{fmtMl(t.ml)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.4, color: C.text3 }}>
        {outs.length ? <>Counted out: {outs.map((p, i) => (
          <span key={p.id}>{i ? ', ' : ''}<Tap onClick={() => onOpenPlayer?.(p.id)} title={p.name}><span style={{ color: C.text2 }}>{p.name}</span></Tap> ({p.club})</span>
        ))}. </> : null}
        Ratings, rest, home court{counted ? ' and who’s out' : ''}. Info, not a pick.
        {line.book?.taken_at ? ` Book as of ${fmtTip(line.book.taken_at)}.` : ' No book line yet.'}
      </p>
    </section>
  )
}
