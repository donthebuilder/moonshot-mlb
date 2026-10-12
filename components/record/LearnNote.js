'use client'
// WHAT GOT AWAY, COUNTED AND EXPLAINED (2026-10-12, accuracy loop). One block under the Record page's WHAT GOT AWAY
// list, for every sport: simple first, depth on tap.
//   FIRST   the window's counts: how many produced without a call, how many of them were ON THE BOARD and how many
//           were NOT ON THE BOARD (the words come from lib/callStatus through CallStatusBadge)
//   THEN    the ON THE BOARD, NO CALL result rate beside the CALLED rate, n and the 95% range on both; "tracking"
//           under 30 in a group
//   TAP     "What separated them": up to three description lines, shown only when the feature cleared the floors and
//           held in both halves of the season (lib/learn/separators.js); otherwise one honest sentence saying not yet;
//           and the other markets, one line each
// It describes graded history. It never predicts, never says who is due or hot, and never tells the model what to do.
// The numbers come from lib/learn/published.json (scripts/learn-report.mjs --publish); nothing is typed here.
import { useMemo } from 'react'
import { useSportTheme } from '../SportTheme'
import CallStatusBadge from '../CallStatusBadge'
import { learnFor } from '../../lib/learn/published'
import { LEARN_SPORTS } from '../../lib/learn/sports'

const md = (ymd) => {
  const t = Date.parse(`${ymd}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''
}
const rateWords = (c, floor) => {
  if (!c || !c.n) return 'none yet'
  const base = `${c.hits} of ${c.n}`
  return c.n < floor ? `${base} · tracking` : `${base} (${Math.round(c.rate)}%, range ${Math.round(c.range[0])}-${Math.round(c.range[1])}%)`
}

export default function LearnNote({ sport }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const entry = useMemo(() => learnFor(sport), [sport])
  const S = LEARN_SPORTS[sport]
  if (!entry || !S) return null
  const lead = entry.markets.find((m) => m.market === S.markets.find((x) => x.lead)?.key) || entry.markets[0]
  const rest = entry.markets.filter((m) => m !== lead)
  const w = lead.window
  const floor = lead.floor
  const unit = w.units === 1 ? w.unit : `${w.unit}s`
  const span = w.from && w.to && w.from !== w.to ? `${md(w.from)} to ${md(w.to)}` : md(w.to)
  const row = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }
  const small = { fontSize: 12, lineHeight: 1.5, color: C.text3 }
  return (
    <div aria-label="What got away, counted" style={{ marginBottom: 10, border: `1px solid ${C.border2}`, borderRadius: 12, padding: '10px 12px', background: C.bg2 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: NUM_FONT }}>{lead.label.toUpperCase()} · {span} · {w.units} {unit}</div>
      <div style={{ ...row, marginTop: 6, fontSize: 13, color: C.text2 }}>
        <b style={{ color: C.text, fontFamily: NUM_FONT }}>{lead.gotAway.n}</b> got away (cleared the bar, no call):
        <b style={{ fontFamily: NUM_FONT, color: C.text }}>{lead.gotAway.onBoard}</b> <CallStatusBadge status="board" accent={accent} />
        <b style={{ fontFamily: NUM_FONT, color: C.text }}>{lead.gotAway.notOnBoard}</b> <CallStatusBadge status="off" accent={accent} />
      </div>
      <div style={{ ...small, marginTop: 6 }}>
        Season so far ({lead.season.units} {lead.season.units === 1 ? lead.window.unit : `${lead.window.unit}s`}), each group against the same bar:{' '}
        <CallStatusBadge status="board" accent={accent} /> no call <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rateWords(lead.season.boardNoCall, floor)}</b>
        {' · '}<CallStatusBadge status="called" accent={accent} /> <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{rateWords(lead.season.called, floor)}</b>
        {lead.boardNoCallReadout === 'tracking' ? ' · under 30 in a group, so no comparison yet' : lead.boardNoCallReadout === 'not clearly different' ? ' · the ranges overlap' : ''}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ display: 'flex', alignItems: 'center', minHeight: 44, cursor: 'pointer', fontSize: 12, fontWeight: 800, color: accent, listStyle: 'none' }}>What separated them (?)</summary>
        {lead.lines.length ? (
          <ul style={{ margin: '0 0 8px', paddingLeft: 18, ...small }}>
            {lead.lines.map((l) => <li key={l.feature}>{l.text}</li>)}
          </ul>
        ) : (
          <p style={{ margin: '0 0 8px', ...small }}>Nothing separates them yet. A feature is only named once at least {floor} players are in each group, the difference holds up under a many-features check, and it points the same way in both halves of the season.</p>
        )}
        {rest.length ? (
          <div style={{ display: 'grid', gap: 4, ...small }}>
            {rest.map((m) => (
              <div key={m.market}>
                <b style={{ color: C.text2 }}>{m.label}</b>: {m.gotAway.n} got away ({m.gotAway.onBoard} on the board, {m.gotAway.notOnBoard} not) · no call {rateWords(m.season.boardNoCall, floor)} · called {rateWords(m.season.called, floor)}
                {m.lines.length ? <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{m.lines.map((l) => <li key={l.feature}>{l.text}</li>)}</ul> : null}
              </div>
            ))}
          </div>
        ) : null}
        <p style={{ margin: '8px 0 0', ...small }}>This counts graded rows as of {md(entry.asOf)} and describes them. It is not a forecast. Rows in the same game are not independent, so read ranges as loose.</p>
      </details>
    </div>
  )
}
