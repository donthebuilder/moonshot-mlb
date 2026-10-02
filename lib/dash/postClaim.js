// ONE POST CLAIM (R3, 2026-10-02). homers/tick and nfl/tick each kept a copy
// of claimSlot + bytesOf ("copied rather than imported since that file doesn't
// export it"); this is that one function, exported.
//
// claimSlot: the (day, kind) row in homer_feed_posts is the lock -- upsert with
// ignoreDuplicates, so of two ticks racing only one gets the row back and posts.
// The error is checked and logged, never swallowed: a claim refused by the kind
// check (Postgres 23514, a missing widen migration) is the one silent failure
// that loses posts. `gate(kind, day)` is MLB's postKindOn / isRested, opt-in.
export async function claimSlot(db, day, kind, { gate = null, tag = 'post' } = {}) {
  if (gate && !gate(kind, day)) return false
  const { data, error } = await db
    .from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
    .select('day')
  if (error) { console.error(`[${tag}] ${kind} claim failed: ${error.message}`); return false }
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
