const TEAM_TONES = {
  ARI:['#97233f','#ffb612'], ATL:['#a71930','#000000'], BAL:['#241773','#9e7c0c'], BUF:['#00338d','#c60c30'],
  CAR:['#0085ca','#101820'], CHI:['#0b162a','#c83803'], CIN:['#fb4f14','#000000'], CLE:['#311d00','#ff3c00'],
  DAL:['#003594','#869397'], DEN:['#fb4f14','#002244'], DET:['#0076b6','#b0b7bc'], GB:['#203731','#ffb612'],
  HOU:['#03202f','#a71930'], IND:['#002c5f','#a2aaad'], JAX:['#006778','#d7a22a'], KC:['#e31837','#ffb81c'],
  LV:['#000000','#a5acaf'], LAC:['#0080c6','#ffc20e'], LA:['#003594','#ffa300'], LAR:['#003594','#ffa300'],
  MIA:['#008e97','#fc4c02'], MIN:['#4f2683','#ffc62f'], NE:['#002244','#c60c30'], NO:['#101820','#d3bc8d'],
  NYG:['#0b2265','#a71930'], NYJ:['#125740','#ffffff'], PHI:['#004c54','#a5acaf'], PIT:['#101820','#ffb612'],
  SF:['#aa0000','#b3995d'], SEA:['#002244','#69be28'], TB:['#d50a0a','#ff7900'], TEN:['#0c2340','#4b92db'],
  WAS:['#5a1414','#ffb612'], FA:['#343434','#777777'],
}

export default function NflTeamMark({ team, size = 30 }) {
  const code = String(team || 'FA').toUpperCase()
  const [primary, secondary] = TEAM_TONES[code] || TEAM_TONES.FA
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
