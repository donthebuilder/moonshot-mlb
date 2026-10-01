// The Playbook's worked example (BATCH-PLAYBOOK P1): tonight's real #1 per
// sport, so "open his card" opens a real card. Read through the same loaders
// /start uses; any failure means no example, and the stops link to the
// board instead -- never a made-up name.
import { fetchBoardFull } from './dash/board'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal } from './nfl/dataSource'
import { readBoard } from './nhl/boardRead'
import { easternToday } from './data'
import { nameOf } from './player'

export async function playbookExample(sport) {
  try {
    if (sport === 'mlb') {
      const rows = (await fetchBoardFull('today')) || []
      const top = rows.filter((r) => Number(r?.board_rank) > 0).sort((a, b) => Number(a.board_rank) - Number(b.board_rank))[0]
      return top?.player_id != null ? { id: String(top.player_id), name: nameOf(top) } : null
    }
    if (sport === 'nfl') {
      const slate = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
      const top = (slate?.players || []).filter((p) => !p.on_bye && Number.isFinite(Number(p?.scores?.TD))).sort((a, b) => b.scores.TD - a.scores.TD)[0]
      return top?.player_id != null ? { id: String(top.player_id), name: top.name } : null
    }
    if (sport === 'nhl') {
      const board = await readBoard(easternToday(), { net: false })
      const top = (board?.games || []).flatMap((g) => g.rows || []).filter((r) => r.status === 'called').sort((a, b) => b.score - a.score)[0]
      return top?.playerId != null ? { id: String(top.playerId), name: top.name } : null
    }
  } catch { /* no example: the stops link to the board */ }
  return null
}
