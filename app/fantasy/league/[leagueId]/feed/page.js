import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
import { createComment, createPost, toggleReaction } from './actions'

const REACTIONS=[['fire','🔥'],['trophy','🏆'],['laugh','😂'],['smart','🧠']]

function ago(value) {
  const seconds=Math.max(1,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(seconds<60)return 'now'
  if(seconds<3600)return `${Math.floor(seconds/60)}m`
  if(seconds<86400)return `${Math.floor(seconds/3600)}h`
  return `${Math.floor(seconds/86400)}d`
}

export default async function FeedPage({params,searchParams}) {
  const leagueId=params.leagueId
  const supabase=await createSupabaseServerClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teams=[]},{data:posts=[]},{data:transactions=[]}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role,user_id').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId),
    supabase.from('fantasy_feed_posts').select('*').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(30),
    supabase.from('fantasy_transactions').select('*').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(20),
  ])
  if(!league||!membership)notFound()
  const postIds=posts.map((post)=>post.id)
  const authorIds=[...new Set(posts.map((post)=>post.author_id))]
  const playerIds=[...new Set(transactions.flatMap((item)=>[item.added_player_id,item.dropped_player_id]).filter(Boolean))]
  const [{data:comments=[]},{data:reactions=[]},{data:profiles=[]},{data:players=[]}]=await Promise.all([
    postIds.length?supabase.from('fantasy_feed_comments').select('*').in('post_id',postIds).order('created_at'):Promise.resolve({data:[]}),
    postIds.length?supabase.from('fantasy_feed_reactions').select('*').in('post_id',postIds):Promise.resolve({data:[]}),
    authorIds.length?supabase.from('profiles').select('id,display_name').in('id',authorIds):Promise.resolve({data:[]}),
    playerIds.length?supabase.from('nfl_players').select('id,name,position,team').in('id',playerIds):Promise.resolve({data:[]}),
  ])
  const profileName=(id)=>profiles.find((profile)=>profile.id===id)?.display_name||'League owner'
  const teamName=(id)=>teams.find((team)=>team.id===id)?.name||'Team'
  const playerName=(id)=>players.find((player)=>player.id===id)?.name
  const events=[...posts.map((post)=>({kind:'post',time:post.created_at,data:post})),...transactions.map((transaction)=>({kind:'transaction',time:transaction.created_at,data:transaction}))].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,40)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>LEAGUE FEED</small><strong>{league.name}</strong></div><span>{teams.length} owners</span></header>
    <nav className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><a className={styles.roomActive}>Feed</a><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
    <div className={styles.roomBody}>
      {(searchParams?.error||searchParams?.message)&&<p className={searchParams.error?styles.error:styles.message}>{searchParams.error||searchParams.message}</p>}
      <section className={styles.feedHero}><div><p className={styles.panelLabel}>THE LOCKER ROOM</p><h1>Talk ball. Track every move.</h1><p>Posts, reactions, roster moves, and league conversation all live here.</p></div><div className={styles.roomStats}><span><small>POSTS</small><b>{posts.length}</b></span><span><small>MOVES</small><b>{transactions.length}</b></span><span><small>OWNERS</small><b>{teams.length}</b></span></div></section>
      <div className={styles.feedLayout}><section><form action={createPost} className={styles.feedComposer}><span>{teamName(teams.find((team)=>team.owner_id===user.id)?.id).slice(0,2).toUpperCase()}</span><textarea name="body" maxLength="500" required placeholder="Say something to the league…"/><input type="hidden" name="leagueId" value={leagueId}/><button>Post</button></form><div className={styles.feedStream}>{events.map((event)=>event.kind==='post'?<PostCard key={`post-${event.data.id}`} post={event.data} leagueId={leagueId} user={user} comments={comments.filter((comment)=>comment.post_id===event.data.id)} reactions={reactions.filter((reaction)=>reaction.post_id===event.data.id)} profileName={profileName} teamName={teamName}/>:<TransactionCard key={`move-${event.data.id}`} transaction={event.data} teamName={teamName} playerName={playerName}/>)}{!events.length&&<p className={styles.feedEmpty}>The league is quiet. Start the conversation.</p>}</div></section><aside className={styles.feedSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE ROLL CALL</p><h2>Owners</h2></div></div>{teams.map((team)=><div className={styles.feedOwner} key={team.id}><span>{team.name.slice(0,2).toUpperCase()}</span><div><b>{team.name}</b><small>{team.owner_id===user.id?'YOU':team.owner_id===league.commissioner_id?'COMMISSIONER':'MEMBER'}</small></div></div>)}</section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>League pulse</h2></div></div><p className={styles.emptyRoom}>{transactions.length?`${transactions.length} recent roster moves are shaping this league.`:'Once the draft and player moves begin, activity will appear here automatically.'}</p></section></aside></div>
    </div>
  </main>
}

function PostCard({post,leagueId,user,comments,reactions,profileName,teamName}) {
  return <article className={styles.feedPost}><div className={styles.feedPostHead}><span>{teamName(post.team_id).slice(0,2).toUpperCase()}</span><div><b>{profileName(post.author_id)}</b><small>{teamName(post.team_id)} · {ago(post.created_at)}</small></div></div><p>{post.body}</p><div className={styles.reactionBar}>{REACTIONS.map(([name,emoji])=>{const count=reactions.filter((reaction)=>reaction.reaction===name).length;const mine=reactions.some((reaction)=>reaction.reaction===name&&reaction.user_id===user.id);return <form action={toggleReaction} key={name}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="postId" value={post.id}/><input type="hidden" name="reaction" value={name}/><button className={mine?styles.reacted:''}>{emoji}{count>0&&<span>{count}</span>}</button></form>})}</div>{comments.length>0&&<div className={styles.commentList}>{comments.map((comment)=><div key={comment.id}><b>{teamName(comment.team_id)}</b><p>{comment.body}</p><small>{ago(comment.created_at)}</small></div>)}</div>}<form action={createComment} className={styles.commentForm}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="postId" value={post.id}/><input name="body" maxLength="280" required placeholder="Write a comment…"/><button>Reply</button></form></article>
}

function TransactionCard({transaction,teamName,playerName}) {
  const type=transaction.transaction_type.replace('_',' ')
  return <article className={styles.feedTransaction}><span>{transaction.transaction_type==='trade'?'⇄':'⚡'}</span><div><small>{type.toUpperCase()} · {ago(transaction.created_at)}</small><b>{teamName(transaction.team_id)}</b><p>{transaction.added_player_id?`Added ${playerName(transaction.added_player_id)||'a player'}`:'Completed a trade'}{transaction.dropped_player_id?` · Dropped ${playerName(transaction.dropped_player_id)||'a player'}`:''}</p></div></article>
}
