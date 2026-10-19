'use client'
import PlayerFace from '../PlayerFace'
import TeamMark from '../TeamMark'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { nflTones } from '../../lib/nfl/teamColors'

// THE LINE-UP (2026-10-10, Donovan: "add to the field who lines up where, make looks drop"). The men of lib/nfl/whoLines.js
// drawn on a short turf panel: the defence above the line of scrimmage, the offence below it, three columns LEFT / MIDDLE /
// RIGHT as the offence sees them (facing up the page at the defence). Each man is a face in a club ring over the club's faded
// mark, a slanted name, his depth role, and a small side tag (L / MID / R, or SLOT for the chart's slot corner) so the SIDE is
// never left to guess. A solid ring = placed by his own numbers; a dashed ring = by role only. The dim chips under the panel
// are the men with no basis for a spot, and the men who are OUT (never drawn as playing).
const SIDE_X = { left: [10, 27, 16.7], middle: [41, 59, 50], right: [90, 73, 83.3] }   // outer, inner, lone (percent across)
const SIDE_TAG = { left: 'L', middle: 'MID', right: 'R' }
const SIDE_WORD = { left: 'left', middle: 'middle', right: 'right' }
const ROW_Y = { def: 19, line: 47, qb: 68, rb: 89 }
const HEIGHT = 360

const xOf = (m, lone) => (lone ? SIDE_X[m.side][2] : SIDE_X[m.side][Math.min(1, m.slot || 0)])

function Tile({ m, y, x, onPlayer, ring, def }) {
  const [club] = nflTones(m.team)
  const dashed = m.basis === 'role'
  const tag = def ? (m.role === 'NB' ? 'SLOT' : m.role) : SIDE_TAG[m.side]
  const word = m.word || m.role
  const inner = (
    <>
      <span style={{ position: 'relative', display: 'block', width: 44, height: 44, margin: '0 auto' }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', padding: 2, boxSizing: 'border-box', background: dashed ? 'transparent' : `conic-gradient(from 210deg, ${club}, ${ring}, ${club} 55%, ${ring}, ${club})`, border: dashed ? `2px dashed ${ring}` : 'none', boxShadow: dashed ? 'none' : `0 0 12px ${ring}66` }}>
          <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: C.bg2 }}>
            <PlayerFace sport="nfl" espnId={m.espn_id} team={m.team} name={m.name} size={dashed ? 36 : 38} />
          </span>
        </span>
        <span aria-hidden="true" style={{ position: 'absolute', right: -7, top: -5, minWidth: 20, height: 20, padding: '0 4px', boxSizing: 'border-box', borderRadius: 10, display: 'grid', placeItems: 'center', background: C.bg, color: C.text, border: `1px solid ${ring}`, borderStyle: dashed ? 'dashed' : 'solid', font: `900 11px/1 ${NUM_FONT}` }}>{tag}</span>
      </span>
      <span style={{ display: 'block', marginTop: 2, font: `900 12px/1.15 ${NUM_FONT}`, textTransform: 'uppercase', color: C.text, transform: 'skewX(-8deg)', whiteSpace: 'nowrap', textShadow: `0 1px 3px ${C.bg}` }}>{m.last}</span>
      <span style={{ display: 'block', font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.04em', color: ring, whiteSpace: 'nowrap' }}>{word}</span>
    </>
  )
  const box = { position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', width: 62, textAlign: 'center', background: 'none', border: 0, padding: 0, color: 'inherit', animation: 'luIn .35s ease-out both' }
  const label = `${m.name}, ${word}, ${SIDE_WORD[m.side]}${dashed ? ', by role' : ''}`
  if (def || !onPlayer) return <div role="img" aria-label={label} title={label} style={box}>{inner}</div>
  return <button type="button" aria-label={`${label}. Open his card`} title={label} onClick={() => onPlayer(m.row)} style={{ ...box, cursor: 'pointer', minHeight: 44 }}>{inner}</button>
}

export function WhoChips({ chips, onPlayer }) {
  if (!chips?.length) return null
  const CAP = 6
  const shown = [...chips].sort((a, b) => Number(Boolean(b.out)) - Number(Boolean(a.out))).slice(0, CAP)
  const why = { out: 'OUT', depth: 'depth man', spread: 'targets all over', more: 'also plays' }
  return (
    <div aria-label="Also in the game" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 8 }}>
      <span style={{ gridColumn: '1 / -1', font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>ALSO IN THE GAME · NOT PLACED</span>
      {shown.map((c) => {
        const word = c.out ? (c.status?.word || 'OUT').toUpperCase() : why[c.reason] || ''
        const inner = (
          <>
            <PlayerFace sport="nfl" espnId={c.espn_id} team={c.team} name={c.name} size={28} />
            <span style={{ textAlign: 'left', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ display: 'block', font: `800 12px/1.2 ${NUM_FONT}`, color: C.text, textDecoration: c.out ? 'line-through' : 'none' }}>{c.last}</span>
              <span style={{ display: 'block', font: `700 11px/1.2 ${NUM_FONT}`, color: c.out ? C.red : C.text2 }}>{c.role} · {word}</span>
            </span>
          </>
        )
        const st = { display: 'flex', minWidth: 0, alignItems: 'center', gap: 6, minHeight: 44, padding: '0 10px 0 6px', borderRadius: 22, border: `1px solid ${c.out ? `${C.red}66` : C.border}`, background: 'rgba(255,255,255,.035)', opacity: c.out ? 0.6 : 1, color: 'inherit' }
        return onPlayer && c.row
          ? <button key={c.id} type="button" onClick={() => onPlayer(c.row)} style={{ ...st, cursor: 'pointer' }}>{inner}</button>
          : <span key={`${c.id}${c.role}`} style={st}>{inner}</span>
      })}
      {chips.length > CAP && <span style={{ gridColumn: '1 / -1', font: `700 12px/1.3 ${NUM_FONT}`, color: C.text3 }}>+{chips.length - CAP} more, all in the players table</span>}
    </div>
  )
}

export default function LineUp({ off, def, offMen = [], defMen = [], pass, onPlayer }) {
  const loneOf = (list, m) => list.filter((q) => q.side === m.side && q.back === m.back).length === 1
  const offTiles = offMen.map((m) => {
    const y = m.back ? [ROW_Y.qb, ROW_Y.rb][m.row_i || 0] : ROW_Y.line
    const x = m.back ? SIDE_X[m.side][2] : xOf(m, loneOf(offMen, m))
    return <Tile key={m.id} m={m} y={y} x={x} ring={C.green} onPlayer={onPlayer} />
  })
  const defTiles = defMen.map((m) => <Tile key={m.id} m={m} y={ROW_Y.def} x={xOf(m, loneOf(defMen, m))} ring={C.text2} def />)
  const col = (t, i) => (
    <div key={t} style={{ flex: '1 1 0', textAlign: 'center', borderLeft: i ? `1px dashed ${C.text}26` : 'none', paddingTop: 5 }}>
      <span style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.18em', color: C.text2 }}>{t}</span>
    </div>
  )
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440, height: HEIGHT, margin: '0 auto', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border2}`,
      background: `repeating-linear-gradient(180deg, ${C.turf1}8c 0 38px, transparent 38px 76px), ${C.turf2}` }}>
      <style>{`@keyframes luIn{from{opacity:0;transform:translate(-50%,-44%)}to{opacity:1;transform:translate(-50%,-50%)}}@media (prefers-reduced-motion:reduce){[style*="luIn"]{animation:none!important}}`}</style>
      {/* the two clubs' marks, faded under their own half */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '19%', transform: 'translate(-50%,-50%)', opacity: 0.1, pointerEvents: 'none' }}><TeamMark sport="nfl" abbr={def} variant="logo" px={96} /></div>
      <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '72%', transform: 'translate(-50%,-50%)', opacity: 0.1, pointerEvents: 'none' }}><TeamMark sport="nfl" abbr={off} variant="logo" px={112} /></div>
      {/* the three columns, named on the field itself */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex' }}>{['LEFT', 'MIDDLE', 'RIGHT'].map(col)}</div>
      {/* the line of scrimmage */}
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '34%', height: 3, background: C.text, boxShadow: `0 0 8px ${C.green}` }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: 8, top: '30%', font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2 }}>{def} DEFENSE</span>
      <span aria-hidden="true" style={{ position: 'absolute', right: 8, bottom: 8, font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text2 }}>{off} OFFENCE</span>
      {defMen.length === 0 && (
        <span style={{ position: 'absolute', left: 10, right: 10, top: '19%', transform: 'translateY(-50%)', textAlign: 'center', font: `700 12px/1.4 ${NUM_FONT}`, color: C.text3 }}>{pass ? `${def}'s line-up: no corner on the chart` : `How ${def} line up against the run is not published`}</span>
      )}
      {defTiles}
      {offTiles}
      {offMen.length === 0 && (
        <span style={{ position: 'absolute', left: 10, right: 10, top: '56%', textAlign: 'center', font: `700 12px/1.4 ${NUM_FONT}`, color: C.text3 }}>No {off} player has enough {pass ? 'targets' : 'carries'} yet to place him</span>
      )}
    </div>
  )
}
