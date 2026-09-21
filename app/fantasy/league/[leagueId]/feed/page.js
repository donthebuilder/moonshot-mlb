import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { teamMonogram } from '../../../../../components/fantasy/teamIdentity'
import styles from '../../../fantasy.module.css'
import { createComment, createPost, toggleReaction } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import { leagueMoments, weekKickoffIndex } from '../../../../../lib/fantasy/moments'
import { matchupState, weekStates } from '../../../../../lib/fantasy/matchupState'
import { FANTASY_SEASON } from '../../../../../lib/fantasy/week'

const REACTIONS=[['fire','🔥'],['trophy','🏆'],['laugh','😂'],['smart','🧠']]

// ago() used to live here and ran Date.now() inside a SERVER component, so
// every "2m" on the page was the gap between the post and the moment Vercel
// rendered it, measured on Vercel's clock and frozen there. LocalTime already
// solved that class of bug for kickoffs; it now has a relative mode and this
// page uses it instead of keeping a second, wronger copy.
const ROLL_CALL_PREVIEW = 4
const COMMENT_PREVIEW = 2

export default async function FeedPage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows},{data:postRows},{data:transactionRows},{data:seasonMatchupRows},{data:seasonGameRows}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role,user_id').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId),
    supabase.from('fantasy_feed_posts').select('*').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(30),
    supabase.from('fantasy_transactions').select('*').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(20),
    // The league's own finished games, for THE TAPE below. ~56 rows.
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',FANTASY_SEASON).order('week'),
    // Slim and season-wide: only ever used to decide which weeks are over
    // (fantasy_matchups.status cannot -- see lib/fantasy/matchupState.js) and
    // to give each moment a real timestamp, since a matchup row has no
    // finished-at column to sort a stream by.
    supabase.from('nfl_week_games').select('week,status,season_type,kickoff').eq('season',FANTASY_SEASON),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  const posts=postRows||[]
  const transactions=transactionRows||[]
  // ── THE TAPE ──────────────────────────────────────────────────────────────
  // Derived, never stored: fantasy_feed_posts requires a real author_id and
  // team_id and has no column marking a post as generated, so a synthetic post
  // cannot go in that table without lying about who wrote it. See moments.js.
  const seasonMatchups=seasonMatchupRows||[]
  const seasonWeekStates=weekStates(seasonGameRows||[])
  const finals=seasonMatchups.filter((game)=>matchupState(game,seasonWeekStates[Number(game.week)])==='final')
  const moments=leagueMoments(finals,teams,weekKickoffIndex(seasonGameRows||[]))
  const postIds=posts.map((post)=>post.id)
  const authorIds=[...new Set(posts.map((post)=>post.author_id))]
  const playerIds=[...new Set(transactions.flatMap((item)=>[item.added_player_id,item.dropped_player_id]).filter(Boolean))]
  const [{data:commentRows},{data:reactionRows},{data:profileRows},{data:playerRows}]=await Promise.all([
    postIds.length?supabase.from('fantasy_feed_comments').select('*').in('post_id',postIds).order('created_at'):Promise.resolve({data:[]}),
    postIds.length?supabase.from('fantasy_feed_reactions').select('*').in('post_id',postIds):Promise.resolve({data:[]}),
    authorIds.length?supabase.from('profiles').select('id,display_name').in('id',authorIds):Promise.resolve({data:[]}),
    playerIds.length?supabase.from('nfl_players').select('id,name,position,team').in('id',playerIds):Promise.resolve({data:[]}),
  ])
  const comments=commentRows||[]
  const reactions=reactionRows||[]
  const profiles=profileRows||[]
  const players=playerRows||[]
  const profileName=(id)=>profiles.find((profile)=>profile.id===id)?.display_name||'League owner'
  const teamName=(id)=>teams.find((team)=>team.id===id)?.name||'Team'
  // The Feed used to build its own initials with name.slice(0,2). Every other
  // screen uses teamMonogram() via TeamMark - first letter of the first two
  // words, and it honours an owner-picked monogram. They disagree on any
  // multi-word name, so one team wore two marks depending on the tab.
  const teamMark=(id)=>teamMonogram(teams.find((team)=>team.id===id))
  const playerName=(id)=>players.find((player)=>player.id===id)?.name
  const events=[...posts.map((post)=>({kind:'post',time:post.created_at,data:post})),...transactions.map((transaction)=>({kind:'transaction',time:transaction.created_at,data:transaction}))].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,40)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>LEAGUE FEED</small><strong>{league.name}</strong></div><span>{teams.length} owners</span></header>
    <LeagueNav leagueId={leagueId} active="feed" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.feedHero}><div><p className={styles.panelLabel}>THE LOCKER ROOM</p><h1>Talk ball. Track every move.</h1><p>Posts, reactions, roster moves, and league conversation all live here.</p></div><div className={styles.roomStats}><span><small>POSTS</small><b>{posts.length}</b></span><span><small>MOVES</small><b>{transactions.length}</b></span><span><small>OWNERS</small><b>{teams.length}</b></span></div></section>
      <div className={styles.feedLayout}><section><form action={createPost} className={styles.feedComposer}><span>{teamMark(teams.find((team)=>team.owner_id===user.id)?.id)}</span><textarea name="body" maxLength="500" required placeholder="Say something to the league…"/><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Posting…">Post</SubmitButton></form><div className={styles.feedStream}>{events.map((event)=>event.kind==='post'?<PostCard key={`post-${event.data.id}`} post={event.data} leagueId={leagueId} user={user} comments={comments.filter((comment)=>comment.post_id===event.data.id)} reactions={reactions.filter((reaction)=>reaction.post_id===event.data.id)} profileName={profileName} teamName={teamName} teamMark={teamMark}/>:<TransactionCard key={`move-${event.data.id}`} transaction={event.data} teamName={teamName} playerName={playerName}/>)}{!events.length&&<p className={styles.feedEmpty}>The league is quiet. Start the conversation.</p>}</div></section><aside className={styles.feedSide}>
        {/* ── THE TAPE (2026-09-20) ────────────────────────────────────────
            This slot used to hold "DASH COACH / League pulse", whose entire
            content was a sentence restating a count already on the page --
            "N recent roster moves are shaping this league". Rule #6: a card
            that does not help you understand an event, comparison or signal
            comes out. What replaces it is what actually happened, summed off
            this league's finished games. On a phone .feedSide is order:-1, so
            this is the first thing in the room. */}
        <section className={styles.tapePanel}><div className={styles.boardHead}><div><p className={styles.panelLabel}>THE TAPE</p><h2>What happened</h2></div>{Boolean(moments.length)&&<span>WK {moments[0].week}</span>}</div>
          {moments.length
            ? <div className={styles.tapeList}>{moments.map((moment)=><div className={styles.tapeItem} key={moment.key} data-kind={moment.kind}>
                <span>{moment.glyph}</span>
                <div><b>{moment.headline}</b><small>{moment.detail}</small></div>
              </div>)}</div>
            : <p className={styles.emptyRoom}>No week has finished yet. Once a week is in the books, the high scores, the blowouts and the streaks show up here on their own.</p>}
        </section>
        <section className={styles.rollCall}><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE ROLL CALL</p><h2>Owners</h2></div><span>{teams.length}</span></div>
          {/* Preview four, the rest behind a tap. Ten owners above the whole
              conversation is a screen of scrolling before you reach a word
              anybody said -- and on a phone this column comes FIRST. */}
          {teams.slice(0,ROLL_CALL_PREVIEW).map((team)=><div className={styles.feedOwner} key={team.id}><span>{teamMonogram(team)}</span><div><b>{team.name}</b><small>{team.owner_id===user.id?'YOU':team.owner_id===league.commissioner_id?'COMMISSIONER':'MEMBER'}</small></div></div>)}
          {teams.length>ROLL_CALL_PREVIEW&&<details className={styles.moreFold}><summary>{teams.length-ROLL_CALL_PREVIEW} more {teams.length-ROLL_CALL_PREVIEW===1?'owner':'owners'}</summary>{teams.slice(ROLL_CALL_PREVIEW).map((team)=><div className={styles.feedOwner} key={team.id}><span>{teamMonogram(team)}</span><div><b>{team.name}</b><small>{team.owner_id===user.id?'YOU':team.owner_id===league.commissioner_id?'COMMISSIONER':'MEMBER'}</small></div></div>)}</details>}
        </section>
      </aside></div>
    </div>
  </main>
}

function PostCard({post,leagueId,user,comments,reactions,profileName,teamName,teamMark}) {
  // Newest comments are the ones being replied to, but a thread reads oldest
  // first, so the preview takes the LAST few and the fold holds the rest.
  const folded=comments.length>COMMENT_PREVIEW+1?comments.slice(0,comments.length-COMMENT_PREVIEW):[]
  const shown=folded.length?comments.slice(comments.length-COMMENT_PREVIEW):comments
  return <article className={styles.feedPost}><div className={styles.feedPostHead}><span>{teamMark(post.team_id)}</span><div><b>{profileName(post.author_id)}</b><small>{teamName(post.team_id)} · <LocalTime value={post.created_at} mode="relative"/></small></div></div><p>{post.body}</p><div className={styles.reactionBar}>{REACTIONS.map(([name,emoji])=>{const count=reactions.filter((reaction)=>reaction.reaction===name).length;const mine=reactions.some((reaction)=>reaction.reaction===name&&reaction.user_id===user.id);return <form action={toggleReaction} key={name}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="postId" value={post.id}/><input type="hidden" name="reaction" value={name}/><SubmitButton aria-label={`React ${name}`} className={mine?styles.reacted:''} pendingLabel={emoji}>{emoji}{count>0&&<span>{count}</span>}</SubmitButton></form>})}</div>{comments.length>0&&<div className={styles.commentList}>{folded.length>0&&<details className={styles.moreFold}><summary>{folded.length} earlier {folded.length===1?'reply':'replies'}</summary>{folded.map((comment)=><div key={comment.id}><b>{teamName(comment.team_id)}</b><p>{comment.body}</p><small><LocalTime value={comment.created_at} mode="relative"/></small></div>)}</details>}{shown.map((comment)=><div key={comment.id}><b>{teamName(comment.team_id)}</b><p>{comment.body}</p><small><LocalTime value={comment.created_at} mode="relative"/></small></div>)}</div>}<form action={createComment} className={styles.commentForm}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="postId" value={post.id}/><input name="body" maxLength="280" required placeholder="Write a comment…"/><SubmitButton pendingLabel="…">Reply</SubmitButton></form></article>
}

function TransactionCard({transaction,teamName,playerName}) {
  const type=String(transaction.transaction_type||'move').replaceAll('_',' ')
  return <article className={styles.feedTransaction}><span>{transaction.transaction_type==='trade'?'⇄':'⚡'}</span><div><small>{type.toUpperCase()} · <LocalTime value={transaction.created_at} mode="relative"/></small><b>{teamName(transaction.team_id)}</b><p>{transaction.added_player_id?`Added ${playerName(transaction.added_player_id)||'a player'}`:'Completed a trade'}{transaction.dropped_player_id?` · Dropped ${playerName(transaction.dropped_player_id)||'a player'}`:''}</p></div></article>
}
