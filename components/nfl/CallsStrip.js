'use client'
// THE CALL CARDS (moved out of WriteupBlock.js, 2026-10-18, when the NFL write-up moved onto components/GameWriteupBlock): the closed view of TUDDY's
// game write-up. Markup unchanged.
import { useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import CallStatusBadge from '../CallStatusBadge'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import TeamMark from '../TeamMark'
import PlayerInjuryChip from '../injuries/PlayerInjuryChip'

// ── THE CALLS AS CARDS (2026-10-10, Donovan: "show the top touchdown cards ... better on the games") ──────────────────
// The headline of the game page. The player-card look (lib/cards/playerCard.js) at screen size: a thin frame, the status word
// letter-spaced on top, the face over a faded club mark, the score big and slanted, the name in heavy capitals, club logo and role,
// ONE reason, a thin bar. Foil only on CALLED. The called men first (the bot's calls for this game, unchanged), then this game's
// top touchdown scores that are not calls, wearing their own board word (tdCallStatus on their board rank). One row you swipe on a
// phone; three show, "+N more" opens the rest. The tap opens the player page.
export function CallCard({ x, onPlayerClick, onOpenTeam }) {
  const called = x.status === 'called'
  const sc = Number.isFinite(Number(x.score)) ? Math.round(x.score) : null
  const col = gradeFor(x.score).color
  return (
    <div data-call-card={x.player_id} style={{ position: 'relative', flex: '0 0 min(272px, 80%)', scrollSnapAlign: 'start', minWidth: 0, boxSizing: 'border-box', border: `2px solid ${called ? `${C.green}88` : C.border2}`, borderRadius: 14, overflow: 'hidden', background: `radial-gradient(circle at 12% 0%, ${called ? `${C.green}24` : `${C.text}0d`} 0%, transparent 60%), ${C.bg2}` }}>
      <div aria-hidden="true" style={{ height: 4, background: called ? `linear-gradient(100deg, ${C.green}, ${C.text} 22%, ${C.green} 44%, ${C.text2} 66%, ${C.green})` : 'transparent' }} />
      <div style={{ position: 'absolute', right: -14, top: 26, opacity: 0.12, pointerEvents: 'none' }}><TeamMark sport="nfl" abbr={x.team} variant="logo" px={110} /></div>
      <div style={{ position: 'relative', padding: '8px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
          <CallStatusBadge status={x.status} />
          <PlayerInjuryChip who={{ player_id: x.player_id, name: x.name, team: x.team }} C={C} font={NUM_FONT} size={9} />
          <span style={{ flex: 1, height: 1, background: called ? `${C.green}55` : C.border }} />
          <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: x.role === 'TOP' ? C.green : C.text2 }}>{x.role === 'TOP' ? 'TOP CALL' : x.role === 'TD' ? 'TD CALL' : `#${x.rank} OF ${x.of}`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <PlayerFace sport="nfl" espnId={x.espn_id} team={x.team} name={x.name} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Tap onClick={onPlayerClick ? () => onPlayerClick(x.row || { player_id: x.player_id, name: x.name }, 'TD') : null}
              style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 17, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.01em', lineHeight: 1.05, color: C.text, transform: 'skewX(-8deg)', transformOrigin: 'left center' }}>{x.name}</Tap>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.text2, marginTop: -4 }}>
              <Tap onClick={onOpenTeam && (() => onOpenTeam(x.team))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 4 }}><TeamMark sport="nfl" abbr={x.team} variant="logo" px={16} /></Tap>
              <span>· {x.depth_role || x.position}</span>
            </div>
          </div>
          {sc != null && <b title="Touchdown score, out of 100" style={{ fontFamily: NUM_FONT, fontSize: 38, fontWeight: 900, lineHeight: 1, color: col, transform: 'skewX(-8deg)', letterSpacing: '-.02em' }}>{sc}</b>}
        </div>
        {sc != null && <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: `${C.text}1a`, marginTop: 6 }}><div style={{ width: `${Math.max(4, Math.min(100, sc))}%`, height: 4, borderRadius: 2, background: col }} /></div>}
        {x.reason && <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4, color: C.text2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.reason}</div>}
      </div>
    </div>
  )
}

export function CallsStrip({ cards, onPlayerClick, onOpenTeam, bleed = 14 }) {
  const [all, setAll] = useState(false)
  const shown = all ? cards : cards.slice(0, 3)
  const more = cards.length - shown.length
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x proximity', margin: `6px -${bleed}px 0`, padding: `2px ${bleed}px 8px`, WebkitOverflowScrolling: 'touch' }}>
      {shown.map((x) => <CallCard key={x.player_id} x={x} onPlayerClick={onPlayerClick} onOpenTeam={onOpenTeam} />)}
      {more > 0 && (
        <button type="button" onClick={() => setAll(true)} style={{ flex: '0 0 72px', minHeight: 120, border: `1px dashed ${C.border2}`, borderRadius: 14, background: 'transparent', color: C.green, font: `800 13px/1.3 ${NUM_FONT}`, cursor: 'pointer', scrollSnapAlign: 'start' }}>+{more}<br />more</button>
      )}
    </div>
  )
}

