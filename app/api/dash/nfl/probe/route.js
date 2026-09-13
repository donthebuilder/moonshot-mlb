// 2026-09-13 DIAGNOSTIC v2 — the SUMMARY endpoint from Vercel, per host.
// Scoreboard on site.web.api works from Vercel; the tick still reports
// plays:0, so summary is failing silently. This finds a live game from the
// scoreboard, then fetches its summary on both hosts. Auth-gated; delete after.
import { timingSafeEqual } from 'node:crypto'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
const SB = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
const SUMHOSTS = [
  'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary',
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary',
  'https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=',
]
function authorized(request){const s=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';if(!s)return false;return [process.env.CRON_SECRET,process.env.FRANCHISE_CRON_SECRET,process.env.CALLEDIT_SECRET].filter(Boolean).some((e)=>{const a=Buffer.from(e),b=Buffer.from(s);return a.length===b.length&&timingSafeEqual(a,b)})}
export async function GET(request){
  if(!authorized(request))return Response.json({error:'Unauthorized'},{status:401})
  const out={}
  let live=''
  try{
    const sb=await (await fetch(SB,{cache:'no-store'})).json()
    const e=(sb.events||[]).find((e)=>e.competitions[0].status.type.state==='in')
    live=e?e.id:((sb.events||[])[0]?.id||'')
    out.liveGame=live; out.sbOk=true
  }catch(err){out.sbErr=String(err?.message||err)}
  out.summary=[]
  for(const h of SUMHOSTS){
    const url=h.endsWith('=')?`${h}${live}`:`${h}?event=${live}`
    const t=Date.now()
    try{
      const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(9000)})
      const body=await res.text()
      let sp=null; try{const j=JSON.parse(body); sp=Array.isArray(j.scoringPlays)?j.scoringPlays.length:(j.gamepackageJSON?.scoringPlays?.length ?? 'n/a')}catch{}
      out.summary.push({host:h,status:res.status,ms:Date.now()-t,bytes:body.length,scoringPlays:sp})
    }catch(err){out.summary.push({host:h,error:String(err?.message||err),ms:Date.now()-t})}
  }
  return Response.json(out)
}
