'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { TYPE } from '../../lib/theme'
import { nhlMug } from '../../lib/nhl/format'
import PlayerFace from '../PlayerFace'
import { chipColor } from '../Heatmap'
import { useIsPhone } from '../MobileFold'
import { STATUS, LampDot, fmtSec } from './ui'
import { Card, Chip } from '../ui'
import StatStrip from '../StatStrip'
import FollowButton from '../FollowButton'
import { SportTheme } from '../SportTheme'
import { CardName, ScoreBadge, ExplainStrip } from '../card/CardParts'

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
 *
 * MOONSHOT'S CARD FRAME (2026-09-29, parity plan E; components/PlayerCard.js
 * via components/card/CardParts.js): the name line, the demoted score badge
 * that explains itself on a tap, one chip row, MOONSHOT's StatStrip for the
 * three percentile legs (coloured on LAMP's heat, like the table's LEGS), then
 * LAMP's own facts where MOONSHOT prints its slash line, and a footer with
 * Follow (LAMP's watchlist) where MOONSHOT has Add to Slip + the star. The face
 * and the why line are LAMP's own additions.
 */
export function LampCard({ r, g, rank, market = 'GOAL', facts = {}, onOpen }) {
  const [openScore, setOpenScore] = useState(false)
  const called = r.status === 'called'
  const opp = g.game.home.abbrev === r.team ? g.game.away.abbrev : g.game.home.abbrev
  const sog = market === 'SOG'
  const graded = g.graded
  const n = sog ? r.value : r.goals
  const tone = called ? C.ice : C.text2
  const legs = !r.pct ? [] : (sog
    ? [['s', 'Shots', r.pct.shotsPg], ['t', 'Ice time', r.pct.toi], ['o', 'Opp SA', r.pct.oppSaPg]]
    : [['s', 'Shots', r.pct.shotsPg], ['g', 'Goals', r.pct.goalsPg], ['t', 'Ice time', r.pct.toi]])
    .filter(([, , v]) => v != null)
    .map(([id, label, v]) => ({ id, label, text: `${Math.round(v)}`, color: chipColor(v, 0, 100), title: `${label}: ${Math.round(v)}th percentile among tonight's scored skaters` }))
  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
    <Card color={`${tone}55`} onClick={() => onOpen?.(r.playerId)} style={{ opacity: graded && r.dressed === false ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, color: called ? C.ice : C.text3, minWidth: 14 }}>{rank}</span>
          {/* No club code under the mug: NHL mugs are transparent, and the tile's
              fallback text showed through the face. */}
          <PlayerFace sport="nhl" variant="tile" photo={nhlMug(g.game.season, r.team, r.playerId)} team={null} name="" size={32} theme={C} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, color: C.text }}><CardName name={r.name} /></div>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{r.pos} · {r.team} vs {opp}</div>
          </div>
        </div>
        <ScoreBadge label="LAMP" score={Math.round(r.score ?? 0)} sub={STATUS[r.status]} color={tone}
          open={openScore} onToggle={() => setOpenScore((v) => !v)} />
      </div>
      <ExplainStrip notes={[openScore && (sog
        ? 'The SHOTS 3+ board score: the mean of three percentile ranks among tonight’s scored skaters -- his shots and ice time per game, and how many shots his opponent allows. A ranking, not a percentage.'
        : 'The goal board score: the mean of three percentile ranks among tonight’s scored skaters -- shots, goals and ice time per game over his last 82 NHL games. A ranking, not a percentage.')]} />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {called ? <Chip color={C.ice}>CALLED</Chip> : <Chip color={C.text3}>{STATUS[r.status]}</Chip>}
        {facts.ppvpk && <Chip color={C.teal}>PP v PK {facts.ppvpk}</Chip>}
        {facts.rest && <Chip color={C.text2}>REST {facts.rest}</Chip>}
      </div>
      {/* The why line is the three percentiles in words; the strip below prints
          them, so it only shows when there is no strip (a reason he's off the board). */}
      {r.why && !legs.length && <div style={{ fontSize: TYPE.micro, color: C.text2, lineHeight: 1.4, marginBottom: 7 }}>{r.why}</div>}
      {legs.length > 0 && <StatStrip stats={legs} style={{ marginBottom: 7 }} />}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
        <Fact k="S/GP" v={r.legs && Number.isFinite(r.legs.shotsPg) ? r.legs.shotsPg.toFixed(2) : null} />
        {!sog && <Fact k="G/GP" v={r.legs && Number.isFinite(r.legs.goalsPg) ? r.legs.goalsPg.toFixed(2) : null} />}
        <Fact k="TOI" v={r.legs && Number.isFinite(r.legs.toi) ? fmtSec(r.legs.toi) : null} />
        {sog && <Fact k="OPP SA/60" v={r.legs && Number.isFinite(r.legs.oppSaPg) ? r.legs.oppSaPg.toFixed(1) : null} />}
        <Fact k="PP G" v={r.ppg ?? null} />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <FollowButton sport="nhl" id={String(r.playerId)} name={r.name} team={r.team} position={r.pos} />
        {graded && (
          <span style={{ marginLeft: 'auto', font: `900 12px/1 ${NUM_FONT}`, color: r.hit ? C.lamp : C.text3 }}>
            {r.dressed === false ? 'VOID' : <>{r.hit && <LampDot />}{n ?? 0} {sog ? 'SOG' : (n === 1 ? 'GOAL' : 'GOALS')}</>}
          </span>
        )}
      </div>
    </Card>
    </SportTheme>
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
