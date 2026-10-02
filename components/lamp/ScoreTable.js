'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { TeamMark, LampDot, GoalLabel, fmtPuckDrop } from './ui'
import LampTable from './LampTable'

// 🏒 THE SCORE TABLE — one row per game, a table not a card grid (Donovan's
// standing rule). Every value is a field off score/{date} reduced by
// lib/nhl/reduce.js: status is statusLine (gameState + clock), the score is
// awayTeam.score / homeTeam.score (null pre-game, so nothing prints a 0 that
// isn't one), SOG is team.sog, the goals are goals[].
//
// TAP THE ROW → the game page. The goals column is a fold that opens the
// scorers inline (stopPropagation, so it never steals the row's tap): the
// question "who scored?" is answered without leaving the table.
//
// ORDER: live first, then games still to come by puck drop, then finals —
// same rank rule TUDDY's GameScoreboard uses, so the two products agree.
const rank = (g) => (g.state === 'live' ? 0 : g.state === 'pre' ? 1 : 2)
export const sortGames = (games) => [...games].sort((a, b) =>
  rank(a) - rank(b) || Date.parse(a.startUtc || 0) - Date.parse(b.startUtc || 0))

const STR = { ev: 'EV', pp: 'PP', sh: 'SH' }
export const strengthTag = (g) => (g.modifier === 'empty-net' ? 'EN' : g.modifier === 'penalty-shot' ? 'PS' : STR[g.strength] || 'EV')

export function GoalLines({ goals }) {
  if (!goals?.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', columnGap: 10, rowGap: 3, padding: '6px 0 8px 6px' }}>
      {goals.map((g, i) => (
        <div key={`${g.period}-${g.time}-${g.scorer?.id ?? i}`} style={{ display: 'contents' }}>
          <span style={{ color: C.text3, font: `800 9px/1.5 ${NUM_FONT}` }}>{g.periodLabel} {g.time}</span>
          <span style={{ color: C.text2, font: `900 9px/1.5 ${NUM_FONT}` }}>{g.team}</span>
          <span style={{ color: g.strength === 'pp' ? C.teal : C.text3, font: `800 8px/1.6 ${NUM_FONT}`, letterSpacing: '.06em' }}>{strengthTag(g)}</span>
          <span style={{ color: C.text, fontSize: 11.5, lineHeight: 1.3, minWidth: 0 }}>
            {g.scorer?.name}{g.scorer?.goalsToDate != null ? <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}> ({g.scorer.goalsToDate})</span> : null}
            <GoalLabel label={g.label} />
            {g.assists?.length ? <span style={{ color: C.text3, fontSize: 10.5 }}> · {g.assists.map((a) => a.name).join(', ')}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ScoreTable({ games = [], onOpen, compact = false }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const rows = sortGames(games)
  // THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b; Donovan: "convert
  // them all"). Live first, then by puck drop, as before; a live game wears
  // the lamp edge, a postponed one is dimmed, a row opens the game. The goals
  // button still opens that game's goal lines -- under the sheet now (it has
  // no expanding rows), one panel per opened game.
  return (
    <div className="lamp-scores">
      <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={Math.max(rows.length, 1)} caption="Every game on the date"
        rows={rows.map((g) => ({ ...g, _key: g.id, ord: rank(g) * 1e13 + (Date.parse(g.startUtc || 0) || 0), awayTm: g.away.abbrev, homeTm: g.home.abbrev, goalsN: g.goals?.length ?? null }))}
        onRowClick={onOpen ? (g) => onOpen(g.id) : undefined}
        rowEdge={(g) => (g.state === 'live' ? C.lamp : null)}
        dimRow={(g) => g.scheduleState !== 'OK'}
        columns={[
          { key: 'ord', label: 'Status', heat: false, numeric: false, sticky: true, w: 96, fmt: (_, g) => {
            const live = g.state === 'live'; const done = g.state === 'final'
            return <span style={{ whiteSpace: 'nowrap', color: live ? C.lamp : done ? C.text2 : C.text3, font: `${live ? 900 : 800} 10px/1.2 ${NUM_FONT}`, letterSpacing: '.04em' }}>{live && <LampDot />}{g.statusLine || fmtPuckDrop(g.startUtc)}</span> } },
          { key: 'awayTm', label: 'Away', heat: false, w: compact ? 60 : 150, fmt: (_, g) => <TeamMark abbrev={g.away.abbrev} name={compact ? null : g.away.name} bold={(g.state === 'live' || g.state === 'final') && g.away.score > g.home.score} /> },
          { key: 'score', label: 'Score', heat: false, numeric: false, w: 80, fmt: (_, g) => {
            const scored = g.state === 'live' || g.state === 'final'
            const awayLead = scored && g.away.score > g.home.score, homeLead = scored && g.home.score > g.away.score
            return scored
              ? <span style={{ whiteSpace: 'nowrap', font: `900 ${compact ? 15 : 17}px/1 ${NUM_FONT}` }}><span style={{ color: awayLead ? C.text : C.text2 }}>{g.away.score ?? '–'}</span><span style={{ color: C.text3, margin: '0 6px', fontWeight: 400 }}>–</span><span style={{ color: homeLead ? C.text : C.text2 }}>{g.home.score ?? '–'}</span></span>
              : <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>@</span> } },
          { key: 'homeTm', label: 'Home', heat: false, w: compact ? 60 : 150, fmt: (_, g) => <TeamMark abbrev={g.home.abbrev} name={compact ? null : g.home.name} bold={(g.state === 'live' || g.state === 'final') && g.home.score > g.away.score} /> },
          ...(compact ? [] : [{ key: 'sog', label: 'SOG', heat: false, numeric: false, w: 60, title: 'Shots on goal, away-home', fmt: (_, g) => <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5 }}>{(g.state === 'live' || g.state === 'final') && g.away.sog != null ? `${g.away.sog}–${g.home.sog ?? '–'}` : '—'}</span> }]),
          { key: 'goalsN', label: 'Goals', heat: false, numeric: false, w: 64, fmt: (n, g) => (n
            ? <button type="button" aria-expanded={open.has(g.id)} onClick={(e) => { e.stopPropagation(); toggle(g.id) }}
                style={{ background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.text2, cursor: 'pointer', font: `800 9px/1 ${NUM_FONT}`, padding: '5px 7px', minHeight: 30 }}>
                {n} {open.has(g.id) ? '▴' : '▾'}
              </button>
            : <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{g.state === 'live' || g.state === 'final' ? '0' : '—'}</span>) },
        ]} />
      {rows.filter((g) => open.has(g.id) && g.goals?.length).map((g) => (
        <div key={`goals-${g.id}`} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 10px', marginTop: 6 }}>
          <div style={{ color: C.text3, font: `900 9px/1.4 ${NUM_FONT}`, letterSpacing: '.1em' }}>{g.away.abbrev} @ {g.home.abbrev} · GOALS</div>
          <GoalLines goals={g.goals} />
        </div>
      ))}
    </div>
  )
}

