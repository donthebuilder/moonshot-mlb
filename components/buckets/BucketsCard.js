'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { TYPE } from '../../lib/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import PlayerFace from '../PlayerFace'
import { chipColor } from '../Heatmap'
import { useIsPhone } from '../MobileFold'
import { Card, Chip } from '../ui'
import StatStrip from '../StatStrip'
import FollowButton from '../FollowButton'
import StarMemory from '../watch/StarMemory'
import { SportTheme } from '../SportTheme'
import { CardName, ScoreBadge, ExplainStrip } from '../card/CardParts'
import TeamMark from '../TeamMark'

// 🏀 BUCKETS' PROP CARD (2026-10-03, the visual pass: "the props page should
// have the cards like MLB ... the basketball shit don't got none of this").
// MOONSHOT's card frame through components/card/CardParts.js -- the same
// parts LAMP's LampCard uses: name line, the score badge that explains itself
// on a tap, one chip row, MOONSHOT's StatStrip for the model's percentile
// legs, Follow + the star. The market's own per-game number (33.5 PTS/G) is
// the card's dominant figure -- Donovan: "make the important number dominant".
const LEG_WORD = { ptsPg: 'Points', rebPg: 'Rebounds', astPg: 'Assists', minPg: 'Minutes', fgaPg: 'Shots', ftaPg: 'Free throws', tpmPg: 'Threes', tpaPg: '3PA', tpPct: '3P%', praPg: 'PRA', fgaShare: 'Shot share', oppPts: 'Opp PTS', oppReb: 'Opp REB', oppAst: 'Opp AST', oppTpm: 'Opp 3PM' }
const MAIN = { pts: ['ptsPg', 'PTS/G'], reb: ['rebPg', 'REB/G'], ast: ['astPg', 'AST/G'], '3pm': ['tpmPg', '3PM/G'], pra: ['praPg', 'PRA/G'], first: ['fgaShare', 'SHOT SHARE'] }
const STATUS = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }

export function BucketsCard({ r, rank, market = 'pts', onOpen }) {
  const [openScore, setOpenScore] = useState(false)
  const M = NBA_MARKETS[market] || NBA_MARKETS.pts
  const called = r.status === 'called'
  const preview = r.locked === false
  const tone = called ? C.purple : C.text2
  const [mainKey, mainLabel] = MAIN[market] || MAIN.pts
  const mainV = Number(r[mainKey] ?? r.legs?.[mainKey])
  const main = Number.isFinite(mainV) ? (mainKey === 'fgaShare' ? `${Math.round(mainV * 100)}%` : mainV.toFixed(1)) : '—'
  const min = Number(r.minPg ?? r.legs?.minPg)
  const legs = (M.legs || []).filter((k) => k !== mainKey && r.pct?.[k] != null)
    .map((k) => ({ id: k, label: LEG_WORD[k] || k, text: `${Math.round(r.pct[k])}`, color: chipColor(r.pct[k], 0, 100), title: `${LEG_WORD[k] || k}: ${Math.round(r.pct[k])}th percentile among tonight's players` }))
  return (
    <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
      <Card color={`${tone}55`} onClick={() => onOpen?.(String(r.playerId))} style={{ opacity: r.voidReason ? 0.55 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, color: called ? C.purple : C.text3, minWidth: 14 }}>{rank}</span>
            <PlayerFace sport="nba" id={r.playerId} name={r.name} variant="tile" size={36} theme={C} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, color: C.text }}><CardName name={r.name} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
                <TeamMark sport="nba" abbr={r.team} variant="logo" px={16} />{r.pos ? `${r.pos} · ` : ''}{r.home ? 'vs' : '@'} {r.opp}
              </div>
            </div>
          </div>
          <ScoreBadge label="BUCKETS" score={Math.round(r.score ?? 0)} sub={STATUS[r.status]} color={tone} open={openScore} onToggle={() => setOpenScore((v) => !v)} />
        </div>
        <ExplainStrip notes={[openScore && `The ${M.label} board score: his percentile ranks among tonight's players on this board's legs, averaged. A ranking, not a percentage.`]} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <b style={{ font: `900 28px/1 ${NUM_FONT}`, color: called ? C.purple : C.text, letterSpacing: '-.02em' }}>{main}</b>
          <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.06em' }}>{mainLabel}</span>
          {Number.isFinite(min) && market !== 'first' && <span style={{ marginLeft: 'auto', font: `700 11px/1 ${NUM_FONT}`, color: C.text2 }}>{min.toFixed(1)} MIN/G</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {called ? <Chip color={C.purple}>CALLED{r.role ? ` · ${r.role}` : ''}</Chip> : <Chip color={C.text3}>{STATUS[r.status] || 'RANKED'}</Chip>}
          {preview && <Chip color={C.amber}>PREVIEW</Chip>}
          {r.injury && <Chip color={C.amber}>{String(r.injury).toUpperCase()}</Chip>}
        </div>
        {legs.length > 0 && <StatStrip stats={legs} style={{ marginBottom: 8 }} />}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <FollowButton sport="nba" id={String(r.playerId)} name={r.name} team={r.team} position={r.pos} />
          <StarMemory sport="nba" id={String(r.playerId)} />
        </div>
      </Card>
    </SportTheme>
  )
}

/** The grid, LampCards' rules: 1 across on a phone, 300px columns above; a preview, then "Show all". */
export function BucketsCards({ rows, market, onOpen }) {
  const phone = useIsPhone()
  const [all, setAll] = useState(false)
  const cap = phone ? 5 : 9
  const shown = all ? rows : rows.slice(0, cap)
  return (
    <div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
        {shown.map((r, i) => <BucketsCard key={r._id || `${r.gameId}-${r.playerId}`} r={r} rank={i + 1} market={market} onOpen={onOpen} />)}
      </div>
      {rows.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.purple, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
          Show all {rows.length}
        </button>
      )}
    </div>
  )
}
