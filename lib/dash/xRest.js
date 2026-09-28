// POSTS RESTED FOR THE POSTSEASON (2026-09-28, X-POSTSEASON-POSTING-PLAN step
// 4). The vote posts drew the fewest views of anything on the account; they
// are switched off here, not deleted -- the code and the slots stay. To bring
// any back, list it in X_UNREST (comma-separated), e.g.
//   X_UNREST=botpoll,nfl_community
const RESTED = ['botpoll', 'community_pick', 'nfl_botpoll', 'nfl_community']

const unrested = () => String(process.env.X_UNREST || '').split(',').map((k) => k.trim()).filter(Boolean)

export function isRested(kind) {
  return RESTED.includes(kind) && !unrested().includes(kind)
}
export const RESTED_KINDS = RESTED
