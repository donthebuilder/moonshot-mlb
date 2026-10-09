// ONE POST CLAIM (R3, 2026-10-02). homers/tick and nfl/tick each kept a copy
// of claimSlot + bytesOf ("copied rather than imported since that file doesn't
// export it"); this is that one function, exported.
//
// claimSlot: the (day, kind) row in homer_feed_posts is the lock -- upsert with
// ignoreDuplicates, so of two ticks racing only one gets the row back and posts.
// The error is checked and logged, never swallowed: a claim refused by the kind
// check (Postgres 23514, a missing widen migration) is the one silent failure
// that loses posts. `gate(kind, day)` is MLB's postKindOn / isRested, opt-in.
//
// EGRESS (2026-10-03): the ticks call this every minute for every slot, and
// once a (day, kind) row exists the answer can never change -- yet each call
// was an upsert (~175 an hour, the API gateway's #2 path). A slot this
// instance has seen taken (by itself or anyone) is remembered for the day and
// answered false without a request. Per instance: a cold one asks once.
const _taken = new Set()   // `${day}|${kind}` -- callers claim yesterday's slots too
export const knownTaken = (day, kind) => _taken.has(`${day}|${kind}`)
export const _resetTakenForTests = () => _taken.clear()
export function markTaken(day, kind) {
  if (_taken.size > 5000) _taken.clear()
  _taken.add(`${day}|${kind}`)
}
/** A claim that was released (the post did not go out and may be tried again): this instance asks the database again. */
export const unmarkTaken = (day, kind) => { _taken.delete(`${day}|${kind}`) }
export async function claimSlot(db, day, kind, { gate = null, tag = 'post' } = {}) {
  if (gate && !gate(kind, day)) return false
  if (knownTaken(day, kind)) return false
  const { data, error } = await db
    .from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
    .select('day')
  if (error) { console.error(`[${tag}] ${kind} claim failed: ${error.message}`); return false }
  markTaken(day, kind)
  return Boolean(data?.length)
}

/** A card render -> PNG bytes, or null. Never throws: the image is the garnish, a failed render posts text-only. */
export async function bytesOf(make, { tag = 'post' } = {}) {
  try {
    const img = await make()
    return Buffer.from(await img.arrayBuffer())
  } catch (err) {
    console.error(`[${tag}] card failed: ${String(err?.message || err)}`)
    return null
  }
}
