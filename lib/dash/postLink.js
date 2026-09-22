// WHICH POSTS CARRY THE LINK — one list, both networks.
//
// 2026-09-22, Donovan: "we're posting the link too much, look into that."
//
// He is right, and it is not only a taste problem. X_POST_LINK=1 turns the
// link on GLOBALLY: `TAIL` is spread into all 44 text builders in the MLB tick
// and 14 in the NFL one, including the per-homer alert. On 09-21 that was 25
// scheduled posts plus 31 homer alerts -- roughly 55 posts a day, every one of
// them carrying a URL.
//
// X charges $0.015 for a post and $0.200 for a post CONTAINING A URL. At 55 a
// day that is about $11/day, ~$330/month, against ~$25/month for the same
// posts clean. The switch is a ~$300/month switch.
//
// And the spam read is real on its own: a link under all forty of a night's
// homer alerts trains people to scroll past it, which costs the link its job
// at the same time as it costs the money.
//
// SO THE LINK IS A PER-KIND DECISION, NOT A GLOBAL FLAG. The anchor posts
// carry one -- the board, the grades, the invitation: the few a day that make
// a promise the site can pay off. The live alerts stay clean. They are the
// reach; the anchors are what converts it.
//
// ONE LIST FOR BOTH NETWORKS. lib/dash/threadsLink.js reads this same set, so
// X and Threads can never drift into disagreeing about which posts are the
// anchors.

/**
 * The anchor kinds. Everything not listed here posts clean, on every network.
 *
 * Deliberately short. Five a day on a full MLB slate, two a week on football.
 * Every addition is another $0.20 a day on X and one more post that reads like
 * an ad, so a kind earns its place here by being one a stranger could act on.
 */
export const ANCHOR_KINDS = new Set([
  // MLB
  'pregame',         // the morning board — the names, before first pitch
  'board',           // the evening board
  'board_results',   // how those calls went
  'accountability',  // the running record
  'community_pick',  // the one post that asks the reader for something
  // NFL
  'nfl_board',
  'nfl_results',
])

export const isAnchorKind = (kind) => ANCHOR_KINDS.has(String(kind || '').trim())

/**
 * The {site, handle} tail for one post kind.
 *
 * X_POST_LINK is still the master switch and still defaults OFF, so nothing
 * changes until it is set. What changed is that setting it no longer means
 * "every post": it means "the anchor posts".
 */
export function tailFor(kind, { site = '', handle = '' } = {}) {
  if (String(process.env.X_POST_LINK || '') !== '1') return { site: '', handle: '' }
  if (!isAnchorKind(kind)) return { site: '', handle: '' }
  return { site, handle }
}
