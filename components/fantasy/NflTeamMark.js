// The club palette used to live in this file — thirty-four two-colour pairs
// inlined above a twelve-line render. It is a registry, so it now lives in
// one: lib/nfl/teamColors.js, beside lib/mlbTeams.js's equivalent. This file
// draws the mark and nothing else.
import { nflTones } from '../../lib/nfl/teamColors'

export default function NflTeamMark({ team, size = 30 }) {
  const code = String(team || 'FA').toUpperCase()
  const [primary, secondary] = nflTones(code)
  return (
    <span title={code === 'FA' ? 'Free agent' : code} aria-label={code} style={{
      display:'inline-grid',placeItems:'center',flex:'0 0 auto',width:size,height:size,
      border:`1px solid ${secondary}99`,borderRadius:Math.max(7,Math.round(size*.28)),
      background:`linear-gradient(145deg,${primary} 0 68%,${secondary} 69% 100%)`,
      boxShadow:`inset 0 1px 0 rgba(255,255,255,.14),0 5px 14px ${primary}44`,
      color:'#fff',textShadow:'0 1px 3px #000',font:`900 ${Math.max(7,Math.round(size*.27))}px/1 monospace`,
      letterSpacing:'-.04em',
    }}>{code.slice(0,3)}</span>
  )
}
