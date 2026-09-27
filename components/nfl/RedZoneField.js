'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import NflFace from './NflFace'
import { dueByTheNumbers } from '../../lib/nfl/storylines'
import { surname } from '../../lib/nfl/statLabels'

// THE RED ZONE, DRAWN (2026-09-27, BATCH-FACES step 9). The last 20 yards
// to scale -- the 20, the 10, the 5, the goal line and a ten-yard end zone
// (30 yards, so every line sits at its true share of the width) -- and one
// team's players on it: where the ball goes, visually. The table below it is
// unchanged.
//
// EVERY MARK IS A FIELD (nfl_week.json players[].stats unless named):
//   the long bar, from the 20      RZ   red-zone opportunities a game
//   the short bar, from the 10     GL   goal-line opportunities a game
//                                       (inside-10 targets + inside-5 carries)
//   "due by the numbers"           xTD vs TD, the storylines rule itself
//                                  (lib/nfl/storylines.js dueByTheNumbers)
//   "6 TDs on 43 red-zone touches" nfl_matchup.json red_zone[player_id]
//                                  (touches, tds, rate) -- his conversion
// Bars are scaled to the team's own leader so the shape reads at a glance;
// the number beside each bar is the value itself. The opponent's side is not
// drawn: the matchup payload has no red-zone rate ALLOWED per defense.
//
// Built from HTML boxes rather than SVG text, so names and numbers keep their
// real sizes on a phone instead of shrinking with a viewBox.

const YARDS = 30                                  // 20 of field + 10 of end zone
const at = (ydsFromGoal) => `${((20 - ydsFromGoal) / YARDS) * 100}%`   // left edge %
const GOAL = at(0)
const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const one = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10))
// The lane label: his surname, keeping a "St." surname whole (Amon-Ra St. Brown).
const laneName = (name) => (String(name || '').match(/\bSt\.?\s+\S+$/) || [])[0] || surname(name)

export default function RedZoneField({ data, matchup, onPlayerClick }) {
  const byTeam = useMemo(() => {
    const m = new Map()
    for (const p of data?.players || []) {
      if (p.on_bye || !(n(p.stats?.RZ) > 0)) continue
      if (!m.has(p.team)) m.set(p.team, [])
      m.get(p.team).push(p)
    }
    for (const list of m.values()) list.sort((a, b) => n(b.stats.RZ) - n(a.stats.RZ))
    return m
  }, [data])
  // Default: the team of the league's #1 red-zone row (the table's own top).
  const leader = useMemo(() => [...byTeam.values()].map((l) => l[0]).sort((a, b) => n(b.stats.RZ) - n(a.stats.RZ))[0], [byTeam])
  const [team, setTeam] = useState(null)
  const [all, setAll] = useState(false)
  const shown = team || leader?.team
  const due = useMemo(() => new Set(dueByTheNumbers(data, { limit: 999 }).map((r) => String(r.player.player_id))), [data])
  if (!shown || !byTeam.get(shown)) return null

  // Four lanes preview, the rest behind one tap (the long-list rule): the
  // table under this is the page's real content, and on a phone six lanes
  // plus notes pushed its first row from 350px to 936px.
  const pool = byTeam.get(shown).slice(0, 6)
  const players = all ? pool : pool.slice(0, 4)
  const maxRz = Math.max(...players.map((p) => n(p.stats.RZ) || 0), 0.01)
  const maxGl = Math.max(...players.map((p) => n(p.stats.GL) || 0), 0.01)
  const teams = [...byTeam.keys()].sort()
  const line = (y, label, strong = false) => (
    <div key={label} aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: at(y), width: 0, borderLeft: `1px ${strong ? 'solid' : 'dashed'} ${strong ? C.text2 : C.border2}` }} />
  )
  const opp = byTeam.get(shown)[0]?.opp

  return (
    <section aria-label={`${shown} red-zone usage, drawn`} style={{ margin: '0 0 12px', padding: '12px 12px 10px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.green, fontFamily: NUM_FONT }}>THE LAST 20 YARDS</span>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text3 }}>
          Team
          <select value={shown} onChange={(e) => { setTeam(e.target.value); setAll(false) }} aria-label="Team on the field"
            style={{ minHeight: 36, padding: '0 8px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.text, fontSize: 13 }}>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {/* the ruler: yard lines at their true share of 30 yards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 30%) 1fr', gap: 8, alignItems: 'end' }}>
        <span style={{ fontSize: 11, color: C.text3 }}>{shown}{opp ? ` vs ${opp}` : ''}</span>
        <div style={{ position: 'relative', height: 16, fontFamily: NUM_FONT, fontSize: 11, color: C.text3 }}>
          {[[20, '20'], [10, '10'], [5, '5'], [0, 'G']].map(([y, t]) => <span key={t} style={{ position: 'absolute', left: at(y), transform: 'translateX(-50%)' }}>{t}</span>)}
          <span style={{ position: 'absolute', left: `calc(${GOAL} + 7px)`, right: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>END ZONE</span>
        </div>
      </div>

      {players.map((p) => {
        const rz = n(p.stats.RZ)
        const gl = n(p.stats.GL)
        return (
          <div key={p.player_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 30%) 1fr', gap: 8, alignItems: 'center', padding: '5px 0', borderTop: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => onPlayerClick?.(p, 'TD')} aria-label={`${p.name}, ${p.position} -- open his card`} title={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, minHeight: 44, padding: 0, border: 0, background: 'transparent', color: C.text, textAlign: 'left', cursor: 'pointer' }}>
              <NflFace player={p} size={28} />
              <span style={{ minWidth: 0 }}>
                {/* The surname on the lane (the full name is in the notes and the
                    button's label): at 390 the full names were cut to "Jahmyr ...". */}
                <span style={{ display: 'block', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{laneName(p.name)}</span>
                <span style={{ display: 'block', fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{p.position}</span>
              </span>
            </button>
            <div style={{ position: 'relative', height: 34, borderRadius: 4, background: C.bg }}>
              {/* the end zone, shaded */}
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: GOAL, right: 0, background: `${C.green}14`, borderRadius: '0 4px 4px 0' }} />
              {line(20, 'l20')}{line(10, 'l10')}{line(5, 'l5')}{line(0, 'lg', true)}
              {/* red-zone opportunities, from the 20 */}
              <div title={`${one(rz)} red-zone opportunities a game`} style={{ position: 'absolute', top: 6, height: 8, left: at(20), width: `${(rz / maxRz) * (20 / YARDS) * 100}%`, background: C.amber, borderRadius: 3 }} />
              {/* goal-line opportunities, from the 10 */}
              {gl ? <div title={`${one(gl)} goal-line opportunities a game`} style={{ position: 'absolute', top: 20, height: 8, left: at(10), width: `${(gl / maxGl) * (10 / YARDS) * 100}%`, background: C.green, borderRadius: 3 }} /> : null}
              <span style={{ position: 'absolute', right: 4, top: 1, fontFamily: NUM_FONT, fontSize: 11, color: C.text, fontWeight: 800 }}>{one(rz)}</span>
              <span style={{ position: 'absolute', right: 4, top: 17, fontFamily: NUM_FONT, fontSize: 11, color: C.green, fontWeight: 800 }}>{gl ? one(gl) : '0'}</span>
            </div>
          </div>
        )
      })}

      {pool.length > players.length || all ? (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          style={{ marginTop: 6, minHeight: 36, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: C.green, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          {all ? 'Show four' : `+${pool.length - players.length} more`}
        </button>
      ) : null}
      <div style={{ marginTop: 8, fontSize: 11, color: C.text3 }}>
        <i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 6, background: C.amber, borderRadius: 2, marginRight: 4 }} />red zone{' '}
        <i aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 6, background: C.green, borderRadius: 2, margin: '0 4px 0 8px' }} />goal line · opportunities a game
      </div>
      {(() => {
        const notes = players.map((p) => {
          const bits = []
          const conv = matchup?.red_zone?.[p.player_id]
          if (conv && Number.isFinite(Number(conv.touches)) && Number(conv.touches) > 0) bits.push(`${conv.tds} TD${Number(conv.tds) === 1 ? '' : 's'} on ${conv.touches} red-zone touches (${Math.round(Number(conv.rate))}%)`)
          if (due.has(String(p.player_id))) bits.push(`due by the numbers: xTD ${one(n(p.stats.xTD))} vs ${one(n(p.stats.TD))} TD a game`)
          return bits.length ? { p, text: bits.join(' · ') } : null
        }).filter(Boolean).slice(0, 3)
        return notes.length ? (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {notes.map(({ p, text }) => <li key={p.player_id} style={{ fontSize: 12, color: C.text2 }}><b style={{ color: C.text }}>{p.name}</b> · {text}</li>)}
          </ul>
        ) : null
      })()}
    </section>
  )
}
