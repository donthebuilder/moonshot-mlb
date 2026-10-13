// WHO THE NIGHT'S DIGEST NAMED (server only; one select). A man named in a sport's TOP 3 post (lib/posts/digestPost.js) is not posted again on his own that
// night (lib/posts/momentPost.js asks here before it claims). Read from the digest's own claim row: payload.named (the ids the text named).
// A failed read answers "nobody" (the single-event claim is the real guard against a double post; this one only avoids a repeat of a name).
import { digestKindOf, slugOf } from '../cards/momentPosting'
import { namedIdsOf } from '../dash/xPolicy'

/** The player slugs (lowercase letters and digits) the digest of `sport` for game date `day` named: a Set, empty when there is no digest. */
export async function digestNamed(db, sport, day) {
  try {
    const kind = digestKindOf({ sport, night: day })
    if (!kind) return new Set()
    const { data, error } = await db.from('homer_feed_posts').select('payload').eq('day', day).eq('kind', kind)
    if (error || !data?.length) return new Set()
    return new Set(data.flatMap((r) => namedIdsOf(r.payload)).map(slugOf).filter(Boolean))
  } catch { return new Set() }
}
