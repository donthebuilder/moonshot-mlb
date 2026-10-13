'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { TYPE } from '../../lib/theme'
import { nhlMug } from '../../lib/nhl/format'
import PlayerFace from '../PlayerFace'
import { chipColor } from '../Heatmap'
import { useIsPhone } from '../MobileFold'
import { LampDot, fmtSec } from './ui'
import { Card } from '../ui'
import StatStrip from '../StatStrip'
import FollowButton from '../FollowButton'
import StarMemory from '../watch/StarMemory'
import { SportTheme } from '../SportTheme'
import RankCard from '../card/RankCard'
import { canonPos } from '../../lib/positions'
import { nhlShareRows } from '../../lib/nhl/boardColumns'

// ── LAMP'S CARDS VIEW (2026-09-28, MLB-PARITY-BOARDS plan C2) ──────────────
// The List | Cards toggle MOONSHOT and TUDDY have. The card is TUDDY's board
// card's shape (components/nfl/tabs/Touchdowns.js Card, itself MOONSHOT's
// PlayerCard family): rank, face, name, "pos · team vs opp", the score big
// with its status under it, the why line, then LAMP's own facts. Every value
// is a field the board row already carries -- nothing is computed here.
// Tables still lead: List is the default; Cards is the opt-in view.

// The three legs as small bars, the percentiles behind the score (r.pct).
// Shared with the table's LEGS column (tabs/Board.js).
// Each market's three percentile legs (r.pct keys) and the words for them.
const LEG_DEFS = {
  GOAL: [['S', 'shotsPg', 'shots', 'Shots'], ['G', 'goalsPg', 'goals', 'Goals'], ['T', 'toi', 'ice time', 'Ice time']],
  SOG: [['S', 'shotsPg', 'shots', 'Shots'], ['T', 'toi', 'ice time', 'Ice time'], ['O', 'oppSaPg', 'opponent shots allowed', 'Opp SA']],
  PTS: [['P', 'ptsPg', 'points', 'Points'], ['T', 'toi', 'ice time', 'Ice time'], ['O', 'oppGaPg', 'opponent goals allowed', 'Opp GA']],
  AST: [['A', 'astPg', 'assists', 'Assists'], ['T', 'toi', 'ice time', 'Ice time'], ['O', 'oppGaPg', 'opponent goals allowed', 'Opp GA']],
}
// a leg is drawn only when it is a real number (a missing one never reaches the DOM as NaN)
const legsOf = (pct, market) => (pct ? (LEG_DEFS[market] || LEG_DEFS.GOAL).filter(([, key]) => Number.isFinite(pct[key])).map(([k, key, word, label]) => [k, pct[key], word, label]) : [])
// The count a graded row shows, per market: goals on the GOAL board, the
// market's own count (row.value) on SHOTS / POINTS / ASSISTS. null = not read.
export const countOf = (row, market) => {
  const n = market === 'GOAL' ? row.goals : row.value
  return Number.isFinite(n) ? n : null
}
const COUNT_UNIT = { SOG: 'SOG', PTS: 'PTS', AST: 'AST' }
const unitOf = (market, n) => COUNT_UNIT[market] || (n === 1 ? 'GOAL' : 'GOALS')
const SCORE_NOTE = {
  GOAL: 'The goal board score: the mean of three percentile ranks among tonight’s scored skaters -- shots, goals and ice time per game over his last 82 NHL games. A ranking, not a percentage.',
  SOG: 'The SHOTS 3+ board score: the mean of three percentile ranks among tonight’s scored skaters -- his shots and ice time per game, and how many shots his opponent allows. A ranking, not a percentage.',
  PTS: 'The POINTS 1+ board score (a test): the mean of three percentile ranks among tonight’s scored skaters -- his points and ice time per game, and how many goals his opponent allows. A ranking, not a percentage.',
  AST: 'The ASSISTS 1+ board score (a test): the mean of three percentile ranks among tonight’s scored skaters -- his assists and ice time per game, and how many goals his opponent allows. A ranking, not a percentage.',
}
export function PctBars({ r, market = 'GOAL', wide = false }) {
  if (!r.pct) return null
  const legs = legsOf(r.pct, market)
  if (!legs.length) return null
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

const fin = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : null)
const Fact = ({ k, v }) => (v == null || v === '' ? null : (
  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
    <span style={{ color: C.text3, font: `700 12px/1.2 ${NUM_FONT}` }}>{k}</span>
    <b style={{ color: C.text, font: `800 14px/1.2 ${NUM_FONT}` }}>{v}</b>
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
export function LampCard({ r, g, rank, market = 'GOAL', facts = {}, onOpen, rankMove = null }) {
  const called = r.status === 'called'
  const opp = g.game.home.abbrev === r.team ? g.game.away.abbrev : g.game.home.abbrev
  const sog = market === 'SOG'
  const graded = g.graded
  const n = countOf(r, market)
  const legs = legsOf(r.pct, market)
  // the card's three boxes: the percentile legs the score is made of, in the standout rule (RankCard)
  const stats = legs.map(([, v, , label]) => ({ label: label.toUpperCase(), value: Math.round(v), pct: v, title: `${label}: ${Math.round(v)}th percentile among tonight's scored skaters` }))
  // the back: the rates behind them, with the percentiles
  const rows = [
    ...(market === 'PTS' ? [['Points/game', fin(r.legs?.ptsPg, 2)]] : market === 'AST' ? [['Assists/game', fin(r.legs?.astPg, 2)]] : [['Shots/game', fin(r.legs?.shotsPg, 2)]]),
    ...(market === 'GOAL' ? [['Goals/game', fin(r.legs?.goalsPg, 2)]] : []),
    ['Ice time', Number.isFinite(r.legs?.toi) ? fmtSec(r.legs.toi) : null],
    ...(sog ? [['OPP SA/60', fin(r.legs?.oppSaPg, 1)]] : []),
    ...(market === 'PTS' || market === 'AST' ? [['OPP GA/GP', fin(r.legs?.oppGaPg, 2)]] : []),
    ['PP goals', r.ppg ?? null], ['Power play', facts.pp ? `${facts.pp}%` : null], ['Their penalty kill', facts.pk ? `${facts.pk}%` : null], ['Rest', facts.rest || null],
  ].filter(([, v]) => v != null && v !== '').map(([label, value]) => ({ label, value })).concat(nhlShareRows(r))   // + his share of his club (lib/shares.js)
  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
      <RankCard accent={C.ice} status={r.status} rankMove={rankMove} pos={canonPos('nhl', r.pos)} rank={rank} sport="nhl" club={r.team} name={r.name} opp={opp}
        face={<PlayerFace sport="nhl" variant="tile" photo={nhlMug(g.game.season, r.team, r.playerId)} team={null} name="" size={84} theme={C} />}
        score={Math.round(r.score ?? 0)} scoreWord="LAMP" explain={SCORE_NOTE[market] || SCORE_NOTE.GOAL}
        reason={r.why && !stats.length ? r.why : null}
        stats={stats} back={rows.length ? { rows, note: 'Per game over his last 82 NHL games. A ranking, not a percentage. Share rows are a percent of his club this season.' } : null}
        dim={graded && r.dressed === false} onClick={() => onOpen?.(r.playerId)}
        foot={<>
          <FollowButton sport="nhl" id={String(r.playerId)} name={r.name} team={r.team} position={r.pos} />
          <StarMemory sport="nhl" id={String(r.playerId)} />
          {graded && (
            <span style={{ marginLeft: 'auto', font: `900 12px/1 ${NUM_FONT}`, color: r.hit ? C.ice : C.text3 }}>
              {r.dressed === false ? 'VOID' : n == null ? '\u2014' : <>{r.hit && <LampDot />}{n} {unitOf(market, n)}</>}
            </span>
          )}
        </>} />
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
        {shown.map(({ key, ...it }) => <LampCard key={key} {...it} market={market} onOpen={onOpen} />)}
      </div>
      {items.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.ice, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          Show all {items.length}
        </button>
      )}
    </div>
  )
}
