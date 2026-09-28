'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { TYPE } from '../../lib/theme'
import { nhlMug } from '../../lib/nhl/format'
import PlayerFace from '../PlayerFace'
import { chipColor } from '../Heatmap'
import { useIsPhone } from '../MobileFold'
import { STATUS, CalledChip, LampDot, fmtSec } from './ui'

// ── LAMP'S CARDS VIEW (2026-09-28, MLB-PARITY-BOARDS plan C2) ──────────────
// The List | Cards toggle MOONSHOT and TUDDY have. The card is TUDDY's board
// card's shape (components/nfl/tabs/Touchdowns.js Card, itself MOONSHOT's
// PlayerCard family): rank, face, name, "pos · team vs opp", the score big
// with its status under it, the why line, then LAMP's own facts. Every value
// is a field the board row already carries -- nothing is computed here.
// Tables still lead: List is the default; Cards is the opt-in view.

// The three legs as small bars, the percentiles behind the score (r.pct).
// Shared with the table's LEGS column (tabs/Board.js).
export function PctBars({ r, market = 'GOAL', wide = false }) {
  if (!r.pct) return null
  const legs = market === 'SOG'
    ? [['S', r.pct.shotsPg, 'shots'], ['T', r.pct.toi, 'ice time'], ['O', r.pct.oppSaPg, 'opponent shots allowed']].filter(([, v]) => v != null)
    : [['S', r.pct.shotsPg, 'shots'], ['G', r.pct.goalsPg, 'goals'], ['T', r.pct.toi, 'ice time']]
  return (
    <span title={r.why} style={{ display: 'inline-flex', gap: wide ? 10 : 5, alignItems: 'center' }}>
      {legs.map(([k, v, word]) => (
        <span key={k} aria-label={`${word} ${Math.round(v)}th percentile`} style={{ display: 'inline-flex', alignItems: 'center', gap: wide ? 4 : 2 }}>
          <span style={{ color: C.text3, font: `800 ${wide ? 9 : 7.5}px/1 ${NUM_FONT}` }}>{wide ? word.toUpperCase() : k}</span>
          <span style={{ width: wide ? 40 : 22, height: 6, borderRadius: 3, background: C.border, overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, Math.min(100, v))}%`, background: chipColor(v, 0, 100) }} />
          </span>
        </span>
      ))}
    </span>
  )
}

const Fact = ({ k, v }) => (v == null || v === '' ? null : (
  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
    <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>{k}</span>
    <b style={{ color: C.text2, font: `800 11px/1 ${NUM_FONT}` }}>{v}</b>
  </span>
))

/**
 * One skater. row: the board row (r), g: its game, rank: the board's own rank
 * (By game) or tonight's (All games), facts: { ppvpk, rest } -- the two the
 * board works out from the game's spots, handed in rather than recomputed.
 */
export function LampCard({ r, g, rank, market = 'GOAL', facts = {}, onOpen }) {
  const called = r.status === 'called'
  const opp = g.game.home.abbrev === r.team ? g.game.away.abbrev : g.game.home.abbrev
  const sog = market === 'SOG'
  const graded = g.graded
  const n = sog ? r.value : r.goals
  const tone = called ? C.ice : C.text2
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen?.(r.playerId)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(r.playerId) }}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', minWidth: 0, overflow: 'hidden',
        border: `1px solid ${called ? `${C.ice}66` : C.border}`, borderRadius: 14, padding: '11px 12px 10px',
        background: `linear-gradient(158deg, ${tone}1c, ${C.bg2} 58%)`,
        opacity: graded && r.dressed === false ? 0.55 : 1,
      }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tone}, ${tone}00 72%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, color: called ? C.ice : C.text3, minWidth: 14 }}>{rank}</span>
        {/* No club code under the mug: NHL mugs are transparent, and the tile's
            fallback text showed through the face. */}
        <PlayerFace sport="nhl" variant="tile" photo={nhlMug(g.game.season, r.team, r.playerId)} team={null} name="" size={36} theme={C} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 700, color: C.text, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{r.name}</div>
          <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{r.pos} · {r.team} vs {opp}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, color: tone, lineHeight: 1 }}>{Math.round(r.score ?? 0)}</div>
          <div style={{ marginTop: 4 }}>
            {called ? <CalledChip style={{ marginRight: 0 }} /> : <span style={{ color: C.text3, font: `800 7.5px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[r.status]}</span>}
          </div>
        </div>
      </div>
      {r.why && <div style={{ fontSize: TYPE.micro, color: C.text2, lineHeight: 1.4 }}>{r.why}</div>}
      <PctBars r={r} market={market} wide />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Fact k="S/GP" v={r.legs && Number.isFinite(r.legs.shotsPg) ? r.legs.shotsPg.toFixed(2) : null} />
        {!sog && <Fact k="G/GP" v={r.legs && Number.isFinite(r.legs.goalsPg) ? r.legs.goalsPg.toFixed(2) : null} />}
        <Fact k="TOI" v={r.legs && Number.isFinite(r.legs.toi) ? fmtSec(r.legs.toi) : null} />
        {sog && <Fact k="OPP SA/60" v={r.legs && Number.isFinite(r.legs.oppSaPg) ? r.legs.oppSaPg.toFixed(1) : null} />}
        <Fact k="PP G" v={r.ppg ?? null} />
        <Fact k="PP v PK" v={facts.ppvpk || null} />
        <Fact k="REST" v={facts.rest || null} />
        {graded && (
          <span style={{ marginLeft: 'auto', font: `900 12px/1 ${NUM_FONT}`, color: r.hit ? C.lamp : C.text3 }}>
            {r.dressed === false ? 'VOID' : <>{r.hit && <LampDot />}{n ?? 0} {sog ? 'SOG' : (n === 1 ? 'GOAL' : 'GOALS')}</>}
          </span>
        )}
      </div>
    </div>
  )
}

/** The grid: 1 across on a phone, as many 300px columns as fit above it; a preview, then "Show all". */
export function LampCards({ items, market, onOpen, preview = null }) {
  const phone = useIsPhone()
  const [all, setAll] = useState(false)
  const cap = preview ?? (phone ? 5 : 9)
  const shown = all ? items : items.slice(0, cap)
  return (
    <div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
        {shown.map((it) => <LampCard key={it.key} {...it} market={market} onOpen={onOpen} />)}
      </div>
      {items.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.ice, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          Show all {items.length}
        </button>
      )}
    </div>
  )
}
