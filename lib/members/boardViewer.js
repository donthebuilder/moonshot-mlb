// THE BOARD FEEDS' SERVER HALF (2026-10-26): who is asking, and the gated or full board for them. SERVER-ONLY (reads the login cookie and the
// free four); the pure rule is lib/members/boardGate.js.
import { gateBoard } from './boardGate'
import { viewerIsMember } from './viewer'
import { freeFourIds } from './freeFour'

/**
 * The route's answer for `sport` ('nhl' | 'nba'): { body, private }. `memberAsked` = the request carried m=1. A member who asked gets the full board
 * (private); everyone else the gated one (private when they asked, so a non-member's answer to m=1 is never cached either). Fails closed: any error
 * reading the viewer or the free four = gated, nobody free.
 */
export async function boardForViewer(board, { sport, memberAsked = false, now = Date.now() } = {}) {
  if (memberAsked) {
    if (await viewerIsMember()) return { body: board, private: true }
  }
  const freeIds = await freeFourIds(sport).catch(() => new Set())
  return { body: gateBoard(board, { freeIds, now }).board, private: memberAsked }
}
