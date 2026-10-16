'use client'
import { useMemo } from 'react'
import NflTable from './NflTable'
import CallStatusBadge from '../CallStatusBadge'
import { useCallGate } from '../MemberGate'
import { kickoffFor } from '../../lib/nfl/kickoff'
import { C, TYPE } from '../../lib/nfl/theme'
import { tdCallStatus } from '../../lib/callStatus'
import { withNflFullSet } from '../../lib/nfl/boardColumns'

// 🎯 THE WEEK'S CALLS, ONE ROW PER MARKET (Wave 2, 2026-10-11, Donovan: "everything
// moving toward simplicity with the ability to dive deep into stats").
//
// Picks used to stack three products before its first table row (the seven call
// cards, then the Shortlist, then the card). The simple read of Picks is "who is
// called this week, in each market"; this is that read as a table: the #1 rung of
// every market's card, in the card's order, and nothing else computed. The deep
// read is one tap away on the same page (the Shortlist under it ranks everyone
// the model scored; the cards fold below it).
//
// Every row is a rung on the card (picks.card[market].rungs[0]) -- the same
// object the call cards and Live read -- so the status is the card's own: a rung
// IS a call (tdCallStatus({ on_bot })). The word comes from lib/callStatus via
// CallStatusBadge. The player's stats come from withNflFullSet (the full column
// set after the call columns), found by the rung's player_id in the week file.
// the v2 sheet's group row (an object, as Bot.js's BOT_G): who and what he is called for, first
// the short market names the Props pills use (components/nfl/NflProps.js SHORT)
const SHORT = { TD: 'ATD', REC_YDS: 'Rec yds', REC: 'Rec', RUSH_YDS: 'Rush yds', RUSH_ATT: 'Rush att', PASS_YDS: 'Pass yds', KICK_PTS: 'Kick pts' }
const CALL_G = { key: 'call', label: 'Call', order: 0 }

export default function NflCalls({ data, picks, onPlayerClick }) {
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])
  const rows = useMemo(() => Object.entries(picks?.card || {}).map(([mk, blk]) => {
    const rung = blk?.rungs?.[0]
    const p = rung ? byId.get(String(rung.player_id)) : null
    if (!rung || !p) return null
    return {
      _key: `${mk}:${rung.player_id}`, _raw: p, mk,
      market: SHORT[mk] || mk.replace('_', ' '),
      name: p.name, pos: p.position, team: p.team, opp: p.opp || '',
      score: Number(rung.score ?? p.scores?.[mk]),
      bar: blk?.bar != null ? Number(blk.bar) : null,
      status: tdCallStatus({ on_bot: rung }),
    }
  }).filter(Boolean), [picks, byId])
  // MEMBERS LOCK (components/MemberGate.js): the week's #1 calls, keyed by player (the TD board's own key) with his game's kickoff; null for everyone but a free viewer
  const gateOf = useCallGate({ rows, statusOf: (r) => r.status, keyOf: (r) => String(r._raw.player_id), timeOf: (r) => kickoffFor(data?.games, r._raw) })
  if (!rows.length) return null
  const columns = [
    // subOnly: on a phone the market rides the sub-line under his name (it is short), so the row says what he is called for
    { key: 'market', label: 'Market', group: CALL_G, heat: false, w: 84, bold: true, subOnly: true },
    { key: 'name', label: 'Player', group: CALL_G, heat: false, w: 150, bold: true, sticky: true },
    { key: 'team', label: 'Tm', group: CALL_G, heat: false, w: 34, mono: true, dim: true, teamMark: 'nfl' },
    { key: 'opp', label: 'Opp', group: CALL_G, heat: false, w: 38, mono: true, dim: true },
    { key: 'pos', label: 'Pos', group: CALL_G, heat: false, w: 34, mono: true, dim: true },
    { key: 'score', label: 'Score', group: CALL_G, w: 52, dp: 0, primary: true,
      title: 'The 0-100 score in that market. A rank against this week’s field, not a probability.' },
    { key: 'bar', label: 'Bar', group: CALL_G, heat: false, w: 42, mono: true, fmt: (v) => (v == null ? '—' : `${v}+`) },
    { key: 'status', label: 'Status', group: CALL_G, heat: false, statusCol: true, w: 70,
      fmt: (v, r) => <CallStatusBadge status={v} accent={C.green} short gate={gateOf ? gateOf(r) : null} /> },
  ]
  return (
    <section aria-label="The week's calls" style={{ marginBottom: 10 }}>
      <div style={{ fontSize: TYPE.body, color: C.text3, margin: '0 0 6px' }}>
        The #1 call in each market. The sheet under it ranks everyone.
      </div>
      <NflTable
        {...withNflFullSet(rows, columns)}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r?._raw ?? r, r?.mk) : null}
        initialSort={null}
        heatMode="sorted"
        maxHeight={9999}
        maxRows={rows.length}
        caption="One row per market: the card’s #1. Tap a row for his card."
      />
    </section>
  )
}
