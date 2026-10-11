'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { TYPE } from '../../lib/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import { RATE_LEGS } from '../../lib/nba/legs'
import PlayerFace from '../PlayerFace'
import { chipColor } from '../Heatmap'
import { useIsPhone } from '../MobileFold'
import { Card, Chip } from '../ui'
import StatStrip from '../StatStrip'
import FollowButton from '../FollowButton'
import StarMemory from '../watch/StarMemory'
import { SportTheme } from '../SportTheme'
import RankCard from '../card/RankCard'

// 🏀 BUCKETS' PROP CARD (2026-10-03, the visual pass: "the props page should
// have the cards like MLB ... the basketball shit don't got none of this").
// MOONSHOT's card frame through components/card/CardParts.js -- the same
// parts LAMP's LampCard uses: name line, the score badge that explains itself
// on a tap, one chip row, MOONSHOT's StatStrip for the model's percentile
// legs, Follow + the star. The market's own per-game number (33.5 PTS/G) is
// the card's dominant figure -- Donovan: "make the important number dominant".
const LEG_WORD = { ptsPg: 'Points', rebPg: 'Rebounds', astPg: 'Assists', minPg: 'Minutes', fgaPg: 'Shots', ftaPg: 'Free throws', tpmPg: 'Threes', tpaPg: '3PA', tpPct: '3P%', praPg: 'PRA', fgaShare: 'Shot share', ddRate: 'DD games', ddAdj: 'DD games × opp', ddRecentAdj: 'DD last 10 × opp', tdAdj: 'TD games × opp', ddRecent: 'DD last 10', tdRate: 'TD games', oppPts: 'Opp PTS', oppReb: 'Opp REB', oppAst: 'Opp AST', oppTpm: 'Opp 3PM' }
const MAIN = { pts: ['ptsPg', 'PTS/G'], reb: ['rebPg', 'REB/G'], ast: ['astPg', 'AST/G'], '3pm': ['tpmPg', '3PM/G'], pra: ['praPg', 'PRA/G'], dd: ['ddRate', 'OF HIS GAMES'], td: ['tdRate', 'OF HIS GAMES'], first: ['fgaShare', 'SHOT SHARE'] }

export function BucketsCard({ r, rank, market = 'pts', onOpen }) {
  const M = NBA_MARKETS[market] || NBA_MARKETS.pts
  const called = r.status === 'called'
  const preview = r.locked === false
  const [mainKey, mainLabel] = MAIN[market] || MAIN.pts
  const mainV = Number(r[mainKey] ?? r.legs?.[mainKey])
  const main = Number.isFinite(mainV) ? (mainKey === 'fgaShare' || RATE_LEGS.has(mainKey) ? `${Math.round(mainV * 100)}%` : mainV.toFixed(1)) : '—'
  const min = Number(r.minPg ?? r.legs?.minPg)
  const legs = (M.legs || []).filter((k) => k !== mainKey && r.pct?.[k] != null)
    .map((k) => ({ label: String(LEG_WORD[k] || k).toUpperCase(), value: Math.round(r.pct[k]), pct: r.pct[k], title: `${LEG_WORD[k] || k}: ${Math.round(r.pct[k])}th percentile among tonight's players` }))
  return (
    <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
      <RankCard accent={C.purple} status={r.status} pos={r.pos || ''} rank={rank} sport="nba" club={r.team} name={r.name} opp={r.opp} home={r.home}
        role={called && r.role ? r.role : ''}
        face={<PlayerFace sport="nba" id={r.playerId} name={r.name} variant="tile" size={84} theme={C} />}
        score={Math.round(r.score ?? 0)} scoreWord="BUCKETS" explain={`The ${M.label} board score: his percentile ranks among tonight's players on this board's legs, averaged. A ranking, not a percentage.`}
        rankTags={[...(preview ? ['PREVIEW'] : []), ...(r.injury ? [String(r.injury).toUpperCase()] : [])]}
        extraLine={<span style={{ marginLeft: 'auto', textAlign: 'right' }}><b style={{ font: `900 20px/1 ${NUM_FONT}`, color: called ? C.purple : C.text }}>{main}</b> <span style={{ font: `800 10px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.06em' }}>{mainLabel}</span></span>}
        stats={legs.slice(0, 3)}
        back={legs.length || Number.isFinite(min) ? { rows: [{ label: mainLabel, value: main }, ...(Number.isFinite(min) && market !== 'first' ? [{ label: 'MIN/G', value: min.toFixed(1) }] : []), ...legs.map((l) => ({ label: l.label, value: l.value, pct: l.pct }))], note: "Percentiles among tonight's players. A ranking, not a percentage." } : null}
        dim={Boolean(r.voidReason)} onClick={() => onOpen?.(String(r.playerId))}
        foot={<>
          <FollowButton sport="nba" id={String(r.playerId)} name={r.name} team={r.team} position={r.pos} />
          <StarMemory sport="nba" id={String(r.playerId)} />
        </>} />
    </SportTheme>
  )
}

/** The grid, LampCards' rules: 1 across on a phone, 300px columns above; a preview, then "Show all". */
export function BucketsCards({ rows, market, onOpen, rankOf = null }) {
  const phone = useIsPhone()
  const [all, setAll] = useState(false)
  const cap = phone ? 5 : 9
  const shown = all ? rows : rows.slice(0, cap)
  return (
    <div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
        {shown.map((r, i) => <BucketsCard key={r._id || `${r.gameId}-${r.playerId}`} r={r} rank={rankOf?.(r) ?? i + 1} market={market} onOpen={onOpen} />)}
      </div>
      {rows.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.purple, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          Show all {rows.length}
        </button>
      )}
    </div>
  )
}
