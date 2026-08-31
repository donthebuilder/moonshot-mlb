// FRANCHISE EVENTS, WHICH ARE A DIFFERENT SHAPE FROM EVERY OTHER EVENT HERE.
//
// MOONSHOT and TUDDY events are BROADCAST: something happens to a player, and
// it goes to everybody who follows him. Nobody owns a home run.
//
// A draft pick is owned. "You are on the clock" is addressed to exactly one
// person, and sending it to anyone else is not a slightly wrong notification,
// it is a wrong one. So these events carry an `owner` -- the auth user id off
// fantasy_teams.owner_id -- and the sender delivers them to that person's
// devices and nobody else's. The follow list is not consulted, because
// following has nothing to do with whose turn it is.
//
// That id needs no new plumbing: fantasy_teams.owner_id references auth.users,
// which is the same column dash_push_subscriptions.user_id already keys on.
//
// WHY ONLY THE DRAFT, FOR NOW. These three are the ones with a shelf life.
// "You are on the clock" is worth everything for ninety seconds and nothing
// afterwards; an auto-pick is the message you most need and least want, and
// you need it immediately. Trades, waivers and matchup swings matter for hours
// or days and can wait for a later pass without anybody losing anything.

const txt = (v) => String(v == null ? '' : v).trim()
const BRAND = '\u{1F3C6} DASH'
const URL_FOR = (leagueId) => `/fantasy/league/${leagueId}`

const frEvent = (e) => ({ brand: BRAND, sport: 'fantasy', ...e })

/**
 * Everything worth telling a franchise owner about right now.
 *
 * Reads with the service-role client, because RLS scopes these tables to
 * members and a cron is not a member of anything.
 *
 * Never throws: a franchise query that fails must not take the baseball and
 * football half of the tick down with it.
 */
export async function franchiseEventsFrom(db) {
  if (!db) return []
  try {
    // Only drafts that are actually happening. A draft in setup has no clock,
    // and a completed one has nothing left to say -- except an auto-pick made
    // in its final minutes, which is why `complete` is allowed a short tail.
    const { data: drafts } = await db
      .from('fantasy_drafts')
      .select('id,league_id,status,current_overall_pick,pick_deadline,started_at,completed_at')
      .in('status', ['live', 'complete'])
    const active = (drafts || []).filter((d) => {
      if (d.status === 'live') return true
      const done = Date.parse(d.completed_at || '')
      return Number.isFinite(done) && Date.now() - done < 60 * 60 * 1000
    })
    if (!active.length) return []

    const leagueIds = [...new Set(active.map((d) => d.league_id))]
    const [{ data: teams }, { data: leagues }] = await Promise.all([
      db.from('fantasy_teams').select('id,league_id,owner_id,name').in('league_id', leagueIds),
      db.from('fantasy_leagues').select('id,name').in('id', leagueIds),
    ])
    const teamById = new Map((teams || []).map((t) => [t.id, t]))
    const leagueName = new Map((leagues || []).map((l) => [l.id, txt(l.name)]))

    const out = []

    // ── THE DRAFT IS LIVE ────────────────────────────────────────────────
    // One per draft, to every owner in the league. The only event here that
    // is not addressed to one person, and it still is not a broadcast: it
    // goes to that league's owners and nobody else.
    for (const d of active) {
      if (d.status !== 'live') continue
      const started = Date.parse(d.started_at || '')
      if (!Number.isFinite(started) || Date.now() - started > 30 * 60 * 1000) continue
      for (const t of (teams || []).filter((x) => x.league_id === d.league_id)) {
        if (!t.owner_id) continue
        out.push(frEvent({
          key: `fr:${d.id}:started:${t.id}`,
          category: 'frdraft', priority: 0, owner: t.owner_id,
          title: '\u{1F3C6} The draft is live',
          body: `${leagueName.get(d.league_id) || 'Your league'} is drafting now`,
          short: leagueName.get(d.league_id) || 'your league', group: 'drafts started',
          url: URL_FOR(d.league_id),
        }))
      }
    }

    // ── ON THE CLOCK ─────────────────────────────────────────────────────
    // Every pick row is created up front with its team already assigned, so
    // whose turn it is is a lookup rather than a re-derivation of the snake
    // order -- which is the kind of thing you only want implemented once.
    const liveDrafts = active.filter((d) => d.status === 'live')
    if (liveDrafts.length) {
      const { data: onClock } = await db
        .from('fantasy_draft_picks')
        .select('draft_id,league_id,team_id,overall_pick,round')
        .in('draft_id', liveDrafts.map((d) => d.id))
      for (const d of liveDrafts) {
        const pick = (onClock || []).find(
          (p) => p.draft_id === d.id && p.overall_pick === d.current_overall_pick)
        const team = pick && teamById.get(pick.team_id)
        if (!team?.owner_id) continue
        const left = Math.max(0, Math.round((Date.parse(d.pick_deadline || '') - Date.now()) / 1000))
        out.push(frEvent({
          key: `fr:${d.id}:clock:${d.current_overall_pick}`,
          category: 'frclock', priority: 0, owner: team.owner_id,
          title: '\u{23F1}\u{FE0F} You are on the clock',
          body: `Pick ${d.current_overall_pick}, round ${pick.round || '?'}${
            Number.isFinite(left) && left > 0 ? ` \u{00B7} ${left}s left` : ''}`,
          short: `pick ${d.current_overall_pick}`, group: 'are on the clock',
          url: URL_FOR(d.league_id),
        }))
      }
    }

    // ── THE CLOCK PICKED FOR YOU ─────────────────────────────────────────
    // The message nobody wants and everybody needs. Bounded to the last half
    // hour so a finished draft does not re-offer every auto-pick it ever made
    // to the dedupe table on every tick.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: autos } = await db
      .from('fantasy_draft_picks')
      .select('draft_id,league_id,team_id,player_id,overall_pick,round,picked_at')
      .in('draft_id', active.map((d) => d.id))
      .eq('assignment_type', 'auto')
      .gte('picked_at', since)
    const playerIds = [...new Set((autos || []).map((a) => a.player_id).filter(Boolean))]
    let nameOf = new Map()
    if (playerIds.length) {
      const { data: players } = await db
        .from('nfl_players').select('id,name,position,team').in('id', playerIds)
      nameOf = new Map((players || []).map((p) => [p.id, p]))
    }
    for (const a of (autos || [])) {
      const team = teamById.get(a.team_id)
      if (!team?.owner_id) continue
      const p = nameOf.get(a.player_id)
      out.push(frEvent({
        key: `fr:${a.draft_id}:auto:${a.overall_pick}`,
        category: 'frauto', priority: 0, owner: team.owner_id,
        title: `\u{26A0}\u{FE0F} Auto-picked: ${txt(p?.name) || 'a player'}`,
        body: `Your timer ran out on pick ${a.overall_pick}${
          p?.position ? ` \u{00B7} ${p.position}${p.team ? `, ${p.team}` : ''}` : ''}`,
        short: txt(p?.name) || `pick ${a.overall_pick}`, group: 'were auto-picked',
        url: URL_FOR(a.league_id),
      }))
    }

    return out
  } catch {
    return []
  }
}
