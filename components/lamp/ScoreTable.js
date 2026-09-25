'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { TeamMark, LampDot, fmtPuckDrop } from './ui'

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

function GoalLines({ goals }) {
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
  return (
    <div className="lamp-scores" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}>
            <th style={th}>STATUS</th>
            <th style={th}>AWAY</th>
            <th style={{ ...th, textAlign: 'center' }}>SCORE</th>
            <th style={th}>HOME</th>
            {!compact && <th className="sm-hide" style={{ ...th, textAlign: 'right' }} title="Shots on goal, away-home">SOG</th>}
            <th style={{ ...th, textAlign: 'right' }}>GOALS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const live = g.state === 'live'
            const done = g.state === 'final'
            const scored = live || done
            const off = g.scheduleState !== 'OK'
            const status = g.statusLine || fmtPuckDrop(g.startUtc)
            const isOpen = open.has(g.id)
            const awayLead = scored && g.away.score > g.home.score
            const homeLead = scored && g.home.score > g.away.score
            return (
              <FragmentRow key={g.id}>
                <tr
                  onClick={() => onOpen?.(g.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(g.id) } }}
                  tabIndex={0} role="link" aria-label={`${g.away.abbrev} at ${g.home.abbrev}, ${status}. Open game.`}
                  style={{
                    cursor: 'pointer', borderTop: `1px solid ${C.border}`,
                    background: live ? `linear-gradient(90deg, ${C.lamp}12, transparent 40%)` : 'transparent',
                    opacity: off ? .55 : 1,
                  }}
                >
                  <td style={{ ...td, whiteSpace: 'nowrap', color: live ? C.lamp : done ? C.text2 : C.text3, font: `${live ? 900 : 800} 10px/1.2 ${NUM_FONT}`, letterSpacing: '.04em' }}>
                    {live && <LampDot />}{status}
                  </td>
                  <td style={td}><TeamMark abbrev={g.away.abbrev} name={compact ? null : g.away.name} bold={awayLead} /></td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap', font: `900 ${compact ? 15 : 18}px/1 ${NUM_FONT}` }}>
                    {scored
                      ? <><span style={{ color: awayLead ? C.text : C.text2 }}>{g.away.score ?? '–'}</span><span style={{ color: C.text3, margin: '0 6px', fontWeight: 400 }}>–</span><span style={{ color: homeLead ? C.text : C.text2 }}>{g.home.score ?? '–'}</span></>
                      : <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>@</span>}
                  </td>
                  <td style={td}><TeamMark abbrev={g.home.abbrev} name={compact ? null : g.home.name} bold={homeLead} /></td>
                  {!compact && (
                    <td className="sm-hide" style={{ ...td, textAlign: 'right', color: C.text3, fontFamily: NUM_FONT, fontSize: 10.5 }}>
                      {scored && g.away.sog != null ? `${g.away.sog}–${g.home.sog ?? '–'}` : '—'}
                    </td>
                  )}
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {g.goals?.length
                      ? <button type="button" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggle(g.id) }}
                          style={{ background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.text2, cursor: 'pointer', font: `800 9px/1 ${NUM_FONT}`, padding: '5px 7px' }}>
                          {g.goals.length} {isOpen ? '▴' : '▾'}
                        </button>
                      : <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{scored ? '0' : '—'}</span>}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={compact ? 5 : 6} style={{ padding: '0 8px', background: C.bg2 }}>
                      <GoalLines goals={g.goals} />
                    </td>
                  </tr>
                )}
              </FragmentRow>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A keyed fragment for the row pair without importing Fragment by name in
// three places.
function FragmentRow({ children }) { return <>{children}</> }

const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '9px 8px', verticalAlign: 'middle' }
