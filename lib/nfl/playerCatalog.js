import { fetchNfl, nflSlateLooksReal, nflSlatePaths } from './dataSource'

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

/**
 * The stable player shape shared by Franchise and future DASH NFL analytics.
 * Provider-specific fields stay in `source`, never in league/roster records.
 */
export function normalizeNflPlayer(raw, context = {}) {
  const sourceId = String(raw?.player_id || raw?.id || '').trim()
  const name = String(raw?.name || raw?.full_name || '').trim()
  const position = String(raw?.position || '').trim().toUpperCase()
  const team = String(raw?.team || '').trim().toUpperCase()

  if (!sourceId || !name || !FANTASY_POSITIONS.has(position)) return null

  return {
    source: context.source || 'dash',
    sourcePlayerId: sourceId,
    season: Number(context.season || raw?.season || new Date().getUTCFullYear()),
    name,
    position,
    team: team || null,
    active: raw?.active !== false,
    injuryStatus: raw?.injury_status || (raw?.questionable ? 'questionable' : null),
    analytics: {
      scores: raw?.scores || {},
      stats: raw?.stats || {},
      // Carried into source_payload so Franchise can ask the bot rather than
      // infer. Before this the only answer available on the fantasy side was
      // "32 teams minus whoever has a game", which cannot tell a real 14-game
      // bye week from a feed halfway through publishing.
      on_bye: Boolean(raw?.on_bye),
    },
  }
}

export function normalizeNflCatalog(payload, source = 'dash') {
  const season = Number(payload?.season || payload?.stat_season)
  const seen = new Set()
  return (payload?.players || [])
    .map((player) => normalizeNflPlayer(player, { season, source }))
    .filter((player) => {
      if (!player) return false
      const key = `${player.source}:${player.sourcePlayerId}:${player.season}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function loadNflPlayerCatalog() {
  const payload = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
  return {
    season: Number(payload?.season || payload?.stat_season),
    players: normalizeNflCatalog(payload),
    builtAt: payload?.built_at || null,
  }
}
