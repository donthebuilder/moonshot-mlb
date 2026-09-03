import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import InviteCode from '../../../../../components/fantasy/InviteCode'
import styles from '../../../fantasy.module.css'
import { deleteLeague, regenerateInviteCode, resetDraft, updateLeagueSettings } from './actions'

export default async function SettingsPage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('id,name').eq('league_id',leagueId),
  ])
  if(!league||!membership)notFound()
  if(membership.role!=='commissioner')return <main className={styles.roomApp}><div className={styles.roomBody}><section className={styles.waitingRoom}><span>⚙</span><div><p className={styles.panelLabel}>COMMISSIONER ONLY</p><strong>Only the commissioner can open the control room.</strong><small>Ask them to change a league rule for you.</small></div></section><p><Link href={`/fantasy/league/${leagueId}/league`}>← Back to League HQ</Link></p></div></main>
  const teams=teamRows||[]
  const locked=league.status!=='setup'
  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href={`/fantasy/league/${leagueId}/league`}>← LEAGUE HQ</Link><div><small>COMMISSIONER</small><strong>{league.name}</strong></div><span>{locked?'Settings locked':'Pre-draft setup'}</span></header>
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.settingsHero}><div><p className={styles.panelLabel}>CONTROL ROOM</p><h1>Shape the league.</h1><p>Structural rules lock when the draft begins. The league name and commissioner tools remain available throughout the season.</p></div><span>⚙</span></section>
      <div className={styles.settingsLayout}><form action={updateLeagueSettings} className={styles.settingsPanel}><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE RULES</p><h2>Core settings</h2></div><span>{locked?'DRAFT STARTED':'EDITABLE'}</span></div><div className={styles.settingsFields}><label>League name<input name="name" defaultValue={league.name} maxLength="60" required/></label><label>Teams<select name="teamCount" defaultValue={league.team_count} disabled={locked}>{[8,10,12,14].map((count)=><option key={count}>{count}</option>)}</select></label><label>Scoring<select name="scoring" defaultValue={league.scoring} disabled={locked}><option value="ppr">PPR</option><option value="half_ppr">Half-PPR</option><option value="standard">Standard</option></select></label><label>Draft timer<select name="draftTimer" defaultValue={league.draft_timer_seconds} disabled={locked}>{[30,60,90,120].map((seconds)=><option value={seconds} key={seconds}>{seconds} seconds</option>)}</select></label><label>Draft order<select name="draftOrder" defaultValue={league.draft_order_method} disabled={locked}><option value="random">Random</option><option value="manual">Manual</option></select></label><label>IR slots<select name="irSlots" defaultValue={league.ir_slots} disabled={locked}>{[0,1,2,3].map((count)=><option key={count}>{count}</option>)}</select></label><div className={styles.settingsChecks}><label><input name="hasKicker" type="checkbox" defaultChecked={league.has_kicker} disabled={locked}/> Kicker</label><label><input name="hasDefense" type="checkbox" defaultChecked={league.has_defense} disabled={locked}/> Defense</label></div></div><input type="hidden" name="leagueId" value={leagueId}/>{locked&&<><input type="hidden" name="teamCount" value={league.team_count}/><input type="hidden" name="scoring" value={league.scoring}/><input type="hidden" name="draftTimer" value={league.draft_timer_seconds}/><input type="hidden" name="draftOrder" value={league.draft_order_method}/><input type="hidden" name="irSlots" value={league.ir_slots}/>{league.has_kicker&&<input type="hidden" name="hasKicker" value="on"/>}{league.has_defense&&<input type="hidden" name="hasDefense" value="on"/>}</>}<SubmitButton className={styles.settingsSave} pendingLabel="Saving…">Save settings</SubmitButton></form><aside className={styles.settingsSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>PRIVATE ACCESS</p><h2>Invite code</h2></div></div><InviteCode codeClassName={styles.settingsCode} code={league.invite_code} label={null} /><p>Regenerating immediately retires the old code. Existing members stay in the league.</p><form action={regenerateInviteCode}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Generating…">Generate new code</SubmitButton></form></section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE CAPACITY</p><h2>{teams.length}/{league.team_count} joined</h2></div></div>{teams.map((team,index)=><div className={styles.settingsTeam} key={team.id}><span>{index+1}</span><TeamMark size={20} team={team}/><b>{team.name}</b></div>)}</section></aside></div>
      {locked && <section className={styles.resetZone}><div><p className={styles.panelLabel}>START OVER</p><h2>Reset the draft</h2><p>Clears every pick and drafted roster, puts the board back to pre-draft, and <b>re-opens the invite code</b> so anyone who missed the start can still join. Settings unlock again. Refused once the season has played a real game.</p></div><form action={resetDraft}><input type="hidden" name="leagueId" value={leagueId}/><label>Type <b>{league.name}</b> to confirm<input name="confirmation" autoComplete="off" required/></label><SubmitButton pendingLabel="Resetting…">Reset the draft</SubmitButton></form></section>}

      <section className={styles.dangerZone}><div><p className={styles.panelLabel}>DANGER ZONE</p><h2>Delete this league</h2><p>This permanently removes every team, roster, matchup, trade, post, and league record. This cannot be undone.</p></div><form action={deleteLeague}><input type="hidden" name="leagueId" value={leagueId}/><label>Type <b>{league.name}</b> to confirm<input name="confirmation" autoComplete="off" required/></label><SubmitButton pendingLabel="Deleting…">Delete league permanently</SubmitButton></form></section>
    </div>
  </main>
}
