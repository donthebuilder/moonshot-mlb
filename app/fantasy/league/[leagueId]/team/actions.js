'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'

export async function saveLineupSlot(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const season = Number(formData.get('season'))
  const week = Number(formData.get('week'))
  const slot = String(formData.get('slot') || '')
  const slotIndex = Number(formData.get('slotIndex'))
  const playerId = String(formData.get('playerId') || '') || null
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const { error } = await supabase.rpc('set_fantasy_lineup_slot', {
    p_league_id: leagueId, p_season: season, p_week: week,
    p_slot: slot, p_slot_index: slotIndex, p_player_id: playerId,
  })
  const route = `/fantasy/league/${leagueId}/team`
  if (error) redirect(`${route}?week=${week}&error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(`${route}?week=${week}&message=${encodeURIComponent(`${slot}${slotIndex > 1 ? ` ${slotIndex}` : ''} saved`)}`)
}

// Team identity — owner-picked color + monogram (2026-08-29, C4 de-bland).
// RLS ("owners update teams") already scopes the update to the caller's own
// row; the .eq guards here are belt on top of that suspender.
export async function saveTeamIdentity(formData) {
  const { isValidTeamColor, cleanMonogram } = await import('../../../../../components/fantasy/teamIdentity')
  const leagueId = String(formData.get('leagueId') || '')
  const route = `/fantasy/league/${leagueId}/team`
  const color = String(formData.get('color') || '')
  const monogram = cleanMonogram(formData.get('monogram'))

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  if (!isValidTeamColor(color)) redirect(`${route}?error=${encodeURIComponent('Pick one of the colors')}`)

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ color, monogram: monogram || null })
    .eq('league_id', leagueId)
    .eq('owner_id', user.id)
  if (error) redirect(`${route}?error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  redirect(`${route}?message=${encodeURIComponent('Team look saved — it shows everywhere your team does')}`)
}

// ── MOVE A MAN, RATHER THAN EDIT NINE DROPDOWNS ────────────────────────────
//
// The lineup board used to be one <form> per slot: fifteen <select>s and
// fifteen Save buttons, and putting your RB2 into the FLEX meant finding him in
// the FLEX dropdown, saving, then going back to RB2 and emptying it. Two
// round-trips and a window in between where the same man was in two slots or in
// none. Every fantasy product instead moves the PLAYER: pick him up, and the
// slots that will take him light up.
//
// It is expressed as a query parameter (`?move=RB-2`), not client state, so the
// whole interaction is links and form submits and works with no JavaScript at
// all -- the same reason the Wire pages itself with `?limit=`.
//
// FOUR RPC CALLS, NOT A TRANSACTION, AND DELIBERATELY SO. set_fantasy_lineup_slot
// is where every rule about ownership, locks and eligibility lives; going around
// it to write both rows in one statement would mean restating all of that here,
// in a second place, where it would drift. So a swap is: empty both slots, then
// fill them the other way round. The order matters -- both are cleared before
// either is filled, because the function rejects a player who is already in a
// starting slot, and a naive "write the destination first" would trip on the man
// we are in the middle of moving.
//
// If a later call fails, the lineup is left with an empty slot rather than a
// duplicated player. That is the safe side to fail on: an empty slot is visible
// on the board and scores nothing, and the page says what went wrong.
export async function moveLineupPlayer(formData) {
  const leagueId = String(formData.get('leagueId') || '')
  const season = Number(formData.get('season'))
  const week = Number(formData.get('week'))
  // fromSlot is EMPTY for a player who is not in the lineup at all. Nothing
  // creates a lineup row when a man is drafted, so straight after a draft every
  // one of your fifteen players is in exactly that state -- the board's
  // UNASSIGNED group. A move-only board that could only move players already in
  // slots would have made a freshly drafted roster impossible to set, which is
  // the one thing this page exists to do.
  const fromSlot = String(formData.get('fromSlot') || '')
  const fromIndex = Number(formData.get('fromIndex') || 0)
  const fromPlayerId = String(formData.get('fromPlayerId') || '') || null
  const benchCount = Math.max(0, Math.min(20, Number(formData.get('benchCount') || 0)))
  const toSlot = String(formData.get('toSlot') || '')
  const toIndex = Number(formData.get('toIndex'))
  const route = `/fantasy/league/${leagueId}/team`
  const back = (params) => redirect(`${route}?week=${week}&${params}`)

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  if (!toSlot || (!fromSlot && !fromPlayerId)) back(`error=${encodeURIComponent('That move is missing a slot')}`)
  if (fromSlot === toSlot && fromIndex === toIndex) back(`message=${encodeURIComponent('He is already there')}`)

  const { data: team } = await supabase
    .from('fantasy_teams').select('id').eq('league_id', leagueId).eq('owner_id', user.id).single()
  if (!team) back(`error=${encodeURIComponent('You do not have a team in this league')}`)

  const { data: lineup } = await supabase
    .from('fantasy_lineup_slots').select('slot,slot_index,player_id,locked_at')
    .eq('team_id', team.id).eq('season', season).eq('week', week)
  const at = (slot, index) => (lineup || []).find((row) => row.slot === slot && row.slot_index === index)
  const source = fromSlot ? at(fromSlot, fromIndex) : null
  const target = at(toSlot, toIndex)
  if (source?.locked_at || target?.locked_at) back(`error=${encodeURIComponent('That game has started — the slot is locked')}`)
  const moving = fromSlot ? (source?.player_id || null) : fromPlayerId
  const displaced = target?.player_id || null
  if (!moving && !displaced) back(`message=${encodeURIComponent('Nothing to move')}`)

  const set = (slot, slotIndex, playerId) => supabase.rpc('set_fantasy_lineup_slot', {
    p_league_id: leagueId, p_season: season, p_week: week,
    p_slot: slot, p_slot_index: slotIndex, p_player_id: playerId,
  })

  // Somewhere for a displaced man to land when the move came from UNASSIGNED
  // and so has no slot to give back. The lowest free bench index, or nothing --
  // in which case he goes back to UNASSIGNED, which is a real place on the
  // board with its own Move link, not a hole he falls through.
  const takenBench = new Set((lineup || []).filter((row)=>row.slot==='BENCH').map((row)=>row.slot_index))
  let freeBench = null
  for (let i = 1; i <= benchCount; i += 1) if (!takenBench.has(i)) { freeBench = i; break }

  const steps = fromSlot
    ? [
        () => set(fromSlot, fromIndex, null),
        () => set(toSlot, toIndex, null),
        () => (moving ? set(toSlot, toIndex, moving) : null),
        () => (displaced ? set(fromSlot, fromIndex, displaced) : null),
      ]
    : [
        // set_fantasy_lineup_slot already deletes whatever is in the target
        // slot before it inserts, so the displaced man is unassigned by this
        // one call; the next step is where he lands.
        () => set(toSlot, toIndex, moving),
        () => (displaced && freeBench ? set('BENCH', freeBench, displaced) : null),
      ]
  for (const step of steps) {
    const result = await step()
    if (result?.error) back(`error=${encodeURIComponent(result.error.message)}`)
  }

  revalidatePath(`/fantasy/league/${leagueId}`, 'layout')
  const label = (slot, index) => `${slot}${index > 1 ? index : ''}`
  back(`message=${encodeURIComponent(`Moved to ${label(toSlot, toIndex)}`)}`)
}
