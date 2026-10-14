'use client'
import RankCard from '../card/RankCard'
import PlayerFace from '../PlayerFace'
import FollowButton from '../FollowButton'
import { C } from '../../lib/theme'
import { nameOf, teamOf, oppOf, mlbId, clean } from '../../lib/player'
import { TWO_HR_NOTE } from '../../lib/mlb/twoHrScore'

// THE 2+ HR CARD: RankCard (the baseball-card frame every product's ranked list wears, the frame MOONSHOT's own PlayerCard
// is drawn in) with the two-homer ranking's number and its three biggest inputs. Not PlayerCard: that card explains the bot's
// HR / Hit / HRR score, and this board's number is a different, new one (lib/mlb/twoHrScore.js).
const SHORT = { hr: 'HR SCORE', rate: 'HR/PA', iso: 'ISO', brl: 'BARREL', arm: 'ARM HR/9', park: 'PARK', pa: 'PA' }   // box labels, nine characters at most

/** The inputs behind a row, as one sentence a tap can show. */
export const twoHrInputsText = (p) => (p?.hr2_parts || []).map((x) => `${x.label} ${Math.round(x.pct)}`).join(' · ') || 'No inputs published for him.'

export default function TwoHrCard({ p, rank, status, onClick, rankMove = null }) {
  const parts = p.hr2_parts || []
  const stats = parts.slice().sort((a, b) => b.weight * b.pct - a.weight * a.pct).slice(0, 3)
    .map((x) => ({ label: SHORT[x.key] || x.label.toUpperCase(), value: Math.round(x.pct), pct: x.pct, title: `${x.label}: ${Math.round(x.pct)} on a 0-100 scale among tonight's hitters` }))
  return (
    <RankCard accent={C.orange} status={status} rankMove={rankMove} pos={clean(p?.handedness || p?.bats, '')} rank={rank} sport="mlb" club={teamOf(p) || null} name={nameOf(p)} opp={oppOf(p) || null}
      role={`Bats ${clean(p?.lineup_spot, '—')}${p?.lineup_confirmed === false ? ' (proj.)' : ''}`}
      face={<PlayerFace sport="mlb" id={mlbId(p)} team={teamOf(p)} name={nameOf(p)} variant="tile" size={84} />}
      score={Math.round(p.hr2_score)} scoreWord="2+ HR"
      explain={`The two-homer ranking, 0–100: a rank among tonight's hitters, not a percentage. ${TWO_HR_NOTE}`}
      stats={stats} back={parts.length ? { rows: parts.map((x) => ({ label: x.label.toUpperCase(), value: Math.round(x.pct), pct: x.pct })), note: `Each input 0-100 among tonight's hitters. ${TWO_HR_NOTE}` } : null}
      onClick={onClick}
      foot={mlbId(p) ? <FollowButton sport="mlb" id={String(mlbId(p))} name={nameOf(p)} team={teamOf(p)} /> : null} />
  )
}
