'use client'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { TeamTap } from '../EntityTap'
import { fmtTip } from '../buckets/ui'

// OUR LINE BESIDE THE BOOK'S, FOR ONE GAME, ANY SPORT (2026-10-19 BUCKETS, 2026-10-20 MLB / NFL / NHL; Donovan: info
// only, no CALLED, no %). One small table: each club's spread from our margin (lib/gameLines.js), the book's spread
// (MLB's run line, NHL's puck line) and its moneyline (SGO, odds_game_lines). After the start it is the line locked
// before the start, or nothing. Never a chance of anything. The product's theme comes in: tokens, never typed colours.
export const OUR_LINE_WORDS = 'Our line'

/** -3.5 -> "-3.5", 2 -> "+2", 0 -> "PK" (pick'em). */
export const fmtSpread = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Math.abs(v) < 0.05 ? 'PK' : `${v > 0 ? '+' : ''}${Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 1)}`)
const fmtMl = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}`)

/**
 * line   one game of a lines answer (lib/gameLinesStore.js linesAnswer)
 * theme  { C, NUM_FONT }   accent  the product's accent   reads  the short "what went in" words for the sport
 * Kicker optional: the product's own section kicker (BUCKETS passes its own so its page stays as it was)
 */
export default function OurLineTable({ line, sport, theme, accent, reads, Kicker = null, onOpenTeam, onOpenPlayer }) {
  if (!line?.our) return null
  const { C, NUM_FONT } = theme
  const m = line.our.margin
  const bs = line.book?.spread_home
  const rows = [
    { abbrev: line.away, our: m, book: bs == null ? null : -bs, ml: line.book?.ml_away, out: line.out?.away, b2b: line.b2b?.away },
    { abbrev: line.home, our: -m, book: bs, ml: line.book?.ml_home, out: line.out?.home, b2b: line.b2b?.home },
  ]
  const cell = { padding: '0 6px', textAlign: 'right', fontFamily: NUM_FONT, fontSize: 13, minWidth: 44 }
  const outs = rows.flatMap((r) => (r.out || []).map((p) => ({ ...p, club: r.abbrev })))
  const title = `${OUR_LINE_WORDS.toUpperCase()}${line.locked && line.state !== 'pre' ? ' · LOCKED BEFORE THE START' : ''}`
  return (
    <section aria-label={OUR_LINE_WORDS}>
      {Kicker ? <Kicker>{title}</Kicker> : <div style={{ color: accent, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 8px' }}>{title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.bg2 }}>
        <caption className="sr-only">Our spread for each club beside the sportsbooks’ spread and moneyline. Information, not a pick.</caption>
        <thead><tr style={{ color: C.text3, fontSize: 11 }}>
          <th scope="col" style={{ ...cell, textAlign: 'left', height: 32 }}>CLUB</th>
          <th scope="col" style={{ ...cell, color: accent }}>OURS</th>
          <th scope="col" style={cell} title={line.book?.taken_at ? `The books’ consensus as of ${fmtTip(line.book.taken_at)}` : 'No book line on file yet'}>BOOK</th>
          <th scope="col" style={cell}>ML</th>
        </tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.abbrev} style={{ borderTop: `1px solid ${C.border}` }}>
            <th scope="row" style={{ ...cell, textAlign: 'left', height: 44 }}>
              {(() => {
                const body = <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TeamMark sport={sport} abbr={t.abbrev} variant="logo" px={20} />{t.abbrev}
                  {t.b2b ? <span title="Second night of a back-to-back" style={{ color: C.text3, fontSize: 11 }}>B2B</span> : null}</span>
                // the page's own team door when it hands one in, else the shell's (or the club's address)
                return onOpenTeam ? <Tap onClick={() => onOpenTeam(t.abbrev)} title={t.abbrev}>{body}</Tap> : <TeamTap abbr={t.abbrev} sport={sport}>{body}</TeamTap>
              })()}
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
        {reads}. Not a pick.
      </p>
    </section>
  )
}
