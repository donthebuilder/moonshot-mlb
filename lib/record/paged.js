// Read every row a query matches. PostgREST answers at most 1000 rows per
// request and says nothing when it stops, so an unpaged read of a season's
// record counts the newest slice and calls it the whole. `build()` returns a
// fresh query each call; it must carry a TOTAL order (ties broken down to the
// primary key) so no row lands on two pages or none.
export const PAGE = 1000
// A ceiling, not a target: 120 nights of a full NHL slate is ~80k rows.
const MAX_ROWS = 100000

export async function readPaged(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: [], error }
    for (const r of data || []) rows.push(r)
    if (!data || data.length < PAGE || from >= MAX_ROWS) break
  }
  return { data: rows, error: null }
}
