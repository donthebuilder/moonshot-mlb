import Link from 'next/link'

import styles from '../../app/fantasy/fantasy.module.css'
import TeamMark from './TeamMark'
import { colorForPosition } from './positionColor'
import { ACTIVITY_TYPES } from '../../lib/fantasy/activity'

// ESPN's Recent Activity: every move in the league, newest first.
export default function LeagueActivity({activity,leagueId,teams,type,team,page,week}){
  const teamOf=(id)=>teams.find((t)=>t.id===id)
  const base=(patch)=>{const f={type,team,page:1,...patch};return `/fantasy/league/${leagueId}/league?view=activity&week=${week}${f.type!=='all'?`&type=${f.type}`:''}${f.team!=='all'?`&team=${f.team}`:''}${f.page>1?`&page=${f.page}`:''}`}
  const name=(p)=>p?<span className={styles.activityPlayer}><b>{p.name}</b><small style={{color:colorForPosition(p.position)}}>{[p.position,p.team].filter(Boolean).join(' · ')}</small></span>:null
  const teamTag=(id)=>{const t=teamOf(id);return t?<Link className={styles.activityTeam} href={`/fantasy/league/${leagueId}/team/${t.id}`}><TeamMark team={t} size={18}/>{t.name}</Link>:<span className={styles.activityTeam}>Former team</span>}
  const filtered=type!=='all'||team!=='all'
  return <section className={styles.powerBoard}>
    <div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE ACTIVITY</p><h2>Every move, newest first</h2></div>
      <form className={styles.playerSearch} action={`/fantasy/league/${leagueId}/league`}><input type="hidden" name="view" value="activity"/><input type="hidden" name="week" value={week}/><input type="hidden" name="type" value={type}/><select aria-label="Team" name="team" defaultValue={team}><option value="all">All teams</option>{teams.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button>Show</button></form></div>
    <div className={styles.positionFilters}>{Object.entries(ACTIVITY_TYPES).map(([key,{label}])=><Link key={key} className={type===key?styles.positionActive:''} aria-current={type===key?'true':undefined} href={base({type:key})}>{label}</Link>)}</div>
    {activity?.failed&&<p className={styles.emptyRoom}>ACTIVITY DELAYED — the league log didn’t load. Refresh in a moment.</p>}
    {!activity?.failed&&!activity?.groups?.length&&<p className={styles.emptyRoom}>{page>1?'No older moves.':filtered?'No moves match that filter. Clear it above.':'No moves yet. Adds, drops, waiver claims and trades land here as they happen.'}</p>}
    {activity?.groups?.map((group)=><div key={group.label} className={styles.activityDay}><p className={styles.activityDate}>{group.label}</p>
      {group.rows.map((row)=><div key={row.id} className={styles.activityRow} data-kind={row.kind}>
        <div className={styles.activityMeta}><small>{row.label}</small><small><LocalTimeText value={row.at}/></small></div>
        {row.sides?<div className={styles.activitySides}>{row.sides.map((side)=><div key={side.teamId}>{teamTag(side.teamId)}<p>{side.gets.length?<>gets {side.gets.map((p,i)=><span key={p.id}>{i>0?', ':''}{name(p)}</span>)}</>:'details unavailable'}</p></div>)}</div>
        :<div className={styles.activitySides}><div>{teamTag(row.teamIds[0])}<p>{row.added&&<span className={styles.activityAdd}>+ {name(row.added)}</span>}{row.dropped&&<span className={styles.activityDrop}>− {name(row.dropped)}</span>}</p></div></div>}
      </div>)}
    </div>)}
    {(page>1||activity?.more)&&<div className={styles.activityPager}>{page>1?<Link href={base({page:page-1})}>‹ Newer</Link>:<span/>}{activity?.more&&<Link href={base({page:page+1})}>Older ›</Link>}</div>}
  </section>
}
const TIME={timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}
function LocalTimeText({value}){return <>{new Date(value).toLocaleTimeString('en-US',TIME)} ET</>}
