import { fetchNfl, nflSlatePaths, nflSlateLooksReal } from '../../../lib/nfl/dataSource'
import {
  nflBoardPicks, nflBoardText, nflBotPollPicks, nflBotPollText, nflBotPollOptions,
  nflCommunityPickText, nflBoardResultsText,
} from '../../../lib/nfl/tweetFeed'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function GET() {
  const data = await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
  if (!data) return Response.json({ error: 'no slate' })
  const board = nflBoardPicks(data)
  const poll = nflBotPollPicks(data)
  // Grade the board against a DELIBERATELY PARTIAL scorer set, to prove the
  // post shows misses as readily as hits.
  const fake = new Set(board.slice(0, 2).map((p) => p.name.toLowerCase()))
  return Response.json({
    board: nflBoardText(board, data),
    poll: nflBotPollText(poll, data),
    pollOptions: nflBotPollOptions(poll),
    community: nflCommunityPickText({}),
    results_TEST: nflBoardResultsText(board, fake, data),
  })
}
