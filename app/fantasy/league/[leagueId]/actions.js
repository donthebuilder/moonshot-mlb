'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import weekSlate from '../../../../public/data/nfl/week.json'
import { normalizeNflCatalog } from '../../../../lib/nfl/playerCatalog'
import { fantasyDefenseCatalog } from '../../../../lib/nfl/teams'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { syncCatalogChunked } from '../../../../lib/fantasy/sync'

const routeFor = (leagueId, type, message, view) => {
  const params = new URLSearchParams()
  if (view?.position && view.position !== 'ALL') params.set('position', view.position)
  if (view?.q) params.set('q', view.q)
  params.set(type, message)
  return `/fantasy/league/${leagueId}?${params.toString()}`
}
const viewFrom = (formData) => ({
  position: String(formData.get('viewPosition') || ''),
  q: String(formData.get('viewQuery') || ''),
})

async function clientAndUser() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy?error=Franchise%20is%20not%20configured%20yet')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy?error=Sign%20in%20first')
  return { supabase, user }
}

export async function syncPlayerCatalog(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const raw = weekSlate
  const normalized = normalizeNflCatalog(raw)
  const season = Number(raw.season || raw.stat_season)
  const catalog = [...normalized, ...fantasyDefenseCatalog(season)]
  let data
  try { data = await syncCatalogChunked(supabase, catalog) }
  catch (error) { redirect(routeFor(leagueId, 'error', String(error?.message || error))) }
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', `${data} NFL players synced`))
}

export async function prepareDraft(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { data: league, error: leagueError } = await supabase
    .from('fantasy_leagues').select('draft_order_method').eq('id', leagueId).single()
  const { data: teams, error: teamError } = await supabase
    .from('fantasy_teams').select('id').eq('league_id', leagueId).order('created_at')
  if (leagueError || teamError || !teams?.length) redirect(routeFor(leagueId, 'error', leagueError?.message || teamError?.message || 'No teams found'))

  let order = teams.map((team) => team.id)
  if (league.draft_order_method === 'random') {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  } else {
    order = teams.map((team) => ({ id: team.id, position: Number(formData.get(`position_${team.id}`)) || 999 }))
      .sort((a, b) => a.position - b.position).map((team) => team.id)
  }

  // A hardcoded 15 rounds builds more picks than there are draftable players
  // (15 x 12 teams = 180 picks against a ~134-row catalog), so the board could
  // never be completed. Cap the rounds at what the catalog can actually fill.
  const { data: leagueRules } = await supabase
    .from('fantasy_leagues').select('has_kicker,has_defense').eq('id', leagueId).single()
  const excluded = []
  if (!leagueRules?.has_kicker) excluded.push('K')
  if (!leagueRules?.has_defense) excluded.push('DEF')
  let catalogQuery = supabase.from('nfl_players').select('id', { count: 'exact', head: true }).eq('active', true)
  for (const position of excluded) catalogQuery = catalogQuery.neq('position', position)
  const { count: catalogSize } = await catalogQuery
  // Leave a full round of slack. Running the pool exactly dry means the last
  // round is forced garbage, and one inactive row means auto-pick raises
  // 'No eligible players remain' — which aborts without advancing the clock,
  // so the draft hangs with no way out short of raw SQL.
  const eligible = Number(catalogSize || 0)
  const maxRounds = Math.floor(eligible / Math.max(order.length, 1)) - 1
  const rounds = Math.max(1, Math.min(15, maxRounds > 0 ? maxRounds : 1))
  const { error } = await supabase.rpc('prepare_fantasy_draft', {
    p_league_id: leagueId, p_order_team_ids: order, p_rounds: rounds,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', `Snake draft board prepared — ${rounds} rounds from ${eligible} eligible players`))
}

export async function startDraft(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('start_fantasy_draft', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', 'The draft is live'))
}

export async function draftPlayer(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const expectedPick = Number(formData.get('overallPick'))
  const view = viewFrom(formData)
  const { supabase } = await clientAndUser()
  if (Number.isInteger(expectedPick)) {
    const { data: draft } = await supabase
      .from('fantasy_drafts').select('current_overall_pick,status').eq('league_id', leagueId).maybeSingle()
    if (draft && draft.current_overall_pick !== expectedPick) {
      redirect(routeFor(leagueId, 'error', `Pick ${expectedPick} was already made — the board moved on to pick ${draft.current_overall_pick}. Nothing was drafted.`, view))
    }
  }
  const { error } = await supabase.rpc('make_fantasy_draft_pick', {
    p_league_id: leagueId, p_player_id: playerId,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message, view))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', 'Pick locked in', view))
}

export async function setDraftState(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const state = String(formData.get('state') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('set_fantasy_draft_state', {
    p_league_id: leagueId, p_state: state,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', state === 'paused' ? 'Draft paused' : 'Draft resumed'))
}

export async function addToQueue(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const view = viewFrom(formData)
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('add_fantasy_draft_queue', { p_league_id: leagueId, p_player_id: playerId })
  if (error) redirect(routeFor(leagueId, 'error', error.message, view))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', 'Player added to your queue', view))
}

export async function removeFromQueue(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const playerId = String(formData.get('playerId') || '')
  const view = viewFrom(formData)
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('remove_fantasy_draft_queue', { p_league_id: leagueId, p_player_id: playerId })
  if (error) redirect(routeFor(leagueId, 'error', error.message, view))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', 'Player removed from queue', view))
}

export async function runAutoPick(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('run_expired_fantasy_auto_pick', { p_league_id: leagueId })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', 'Expired pick completed automatically'))
}

export async function assignDraftPick(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const overallPick = Number(formData.get('overallPick'))
  const playerId = String(formData.get('playerId') || '')
  const { supabase } = await clientAndUser()
  const { error } = await supabase.rpc('commissioner_assign_fantasy_pick', {
    p_league_id: leagueId, p_overall_pick: overallPick, p_player_id: playerId,
  })
  if (error) redirect(routeFor(leagueId, 'error', error.message))
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(routeFor(leagueId, 'message', `Pick ${overallPick} assigned`))
}

// Called from the draft room's live poller. Unlike runAutoPick it never
// redirects, so a background tick can't yank the drafter off the page.
export async function tickAutoPick(leagueId) {
  const id = String(leagueId || '')
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const { error } = await supabase.rpc('run_expired_fantasy_auto_pick', { p_league_id: id })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/fantasy/league/${id}`, 'layout')
  return { ok: true }
}
