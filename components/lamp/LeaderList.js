import { C, NUM_FONT } from '../../lib/nhl/theme'
import { kicker, table, td, num, more, playerHref, teamHref, linkStyle } from './StaticPage'

// One leader category as a server-rendered table: the top five, then 6-10
// behind one tap (phone first). Rows are reduceLeaders()'s: rank, id, name,
// pos, team, value. `fmt` prints the value the way the LAMP tab does.
const SHOWN = 5

function Row({ r, fmt }) {
  return (
    <tr>
      <td style={{ ...td, width: 22, fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{r.rank}</td>
      <td style={td}><a href={playerHref(r.id)} style={linkStyle}>{r.name}</a></td>
      <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, whiteSpace: 'nowrap' }}>
        <a href={teamHref(r.team)} style={{ color: C.text3, textDecoration: 'none' }}>{r.team}</a> {r.pos}
      </td>
      <td style={{ ...num, fontWeight: 900, color: r.rank === 1 ? C.ice : C.text }}>{fmt(r.value)}</td>
    </tr>
  )
}

export default function LeaderList({ title, rows, fmt }) {
  if (!rows?.length) return null
  return (
    <section aria-label={title}>
      <h2 style={kicker}>{title}</h2>
      <table style={table}><tbody>{rows.slice(0, SHOWN).map((r) => <Row key={r.id} r={r} fmt={fmt} />)}</tbody></table>
      {rows.length > SHOWN ? (
        <details>
          <summary style={more}>Show {SHOWN + 1}–{rows.length}</summary>
          <table style={table}><tbody>{rows.slice(SHOWN).map((r) => <Row key={r.id} r={r} fmt={fmt} />)}</tbody></table>
        </details>
      ) : null}
    </section>
  )
}
