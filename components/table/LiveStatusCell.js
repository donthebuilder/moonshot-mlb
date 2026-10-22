'use client'
// THE SHARED STATUS CELL (2026-10-22, lib/liveStatus.js has the why). One line, every sport, every prop lane:
//   [CALLED]  0/1 HR  ▲5  ·  [CALLED] 2 G ✓ 2nd   his call word, his count against the lane's bar (just the count once cleared), where his game is
// Cleared lights in the product's accent the moment it happens; a miss only reads as one once his game is final (quiet
// text, no red: the tables' no-red/green rule). Before his first at-bat / shift / snap it is the call word and the start time.
import CallStatusBadge from '../CallStatusBadge'

// badge: a product that draws its own call word (LAMP's ice chip) hands it in; the progress and clock are the shared part
export default function LiveStatusCell({ status, live, accent, C, NUM_FONT, gate = null, short = false, badge: badgeIn = null }) {
  const badge = badgeIn || <CallStatusBadge status={status} accent={accent} gate={gate} short={short} />
  if (!live) return badge
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      {badge}
      <LiveProgress live={live} accent={accent} C={C} NUM_FONT={NUM_FONT} />
    </span>
  )
}

/** The progress and the clock alone: the phone's name-cell chip line carries this (the Status column is off-screen there). */
export function LiveProgress({ live, accent, C, NUM_FONT, small = false }) {
  if (!live) return null
  const { state, n, bar, unit, cleared, clock } = live
  const hit = cleared === true
  const miss = cleared === false
  if (n == null && !clock) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: small ? 4 : 6, whiteSpace: 'nowrap' }}>
      {n != null && (
        <span title={`${n} of the ${bar} ${unit} this lane needs${hit ? ': cleared' : miss ? ': missed' : ''}`}
          style={{ font: `900 ${small ? 11 : 12}px/1 ${NUM_FONT}`, color: hit ? accent : miss ? C.text3 : C.text }}>
          {n}{hit ? null : <span style={{ fontWeight: 700, color: C.text3 }}>/{bar}</span>}
          <span style={{ font: `800 9.5px/1 ${NUM_FONT}`, letterSpacing: small ? 0 : '.04em', color: hit ? accent : C.text3, marginLeft: small ? 2 : 3 }}>{unit}{hit ? (small ? '✓' : ' ✓') : ''}</span>
        </span>
      )}
      {clock && (
        <span style={{ font: `800 9.5px/1 ${NUM_FONT}`, letterSpacing: '.06em', color: state === 'live' ? accent : C.text3 }}>
          {state === 'live' && !small ? '● ' : ''}{small ? String(clock).replace(/\s*·?\s*\d{1,2}:\d{2}$/, '') : clock}
        </span>
      )}
    </span>
  )
}
