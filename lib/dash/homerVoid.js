// VOID A HOME RUN THE FINAL BOX SCORE DOES NOT HAVE (2026-10-31; supabase/migrations/202610311600_homer_feed_voids.sql).
// homer_feed is written from the live boxscore's home-run count (lib/dash/homerFeed.js homersFrom), which can show one that is later overturned or corrected
// (3 of 1,111 man-games since 08-22). Once a game is Final the league's own box score for THAT GAME (the row's game_pk, never the date: a game that starts after
// 8 PM ET is filed under the next UTC day, and 3 real homers sat on 9-08 for a 9-07 game) is the answer: the feed's rows for a man in a game are his hr_n 1..k; if his
// box score has fewer than k (or one homer is filed under two days), the extra rows are copied to homer_feed_voids and removed, so every reader is right at once.
// Safe by construction: a game not Final or not readable, or a man with no batting line in his game's box score, is NOT judged; the copy is written before the delete.
// Pure parts first, then the sweep. Never throws.

/** The rows to void. rows: homer_feed rows; games: { [game_pk]: { final, hr: { [player_id]: homeRuns } } }. Only a Final game whose box score lists the man is judged. */
export function falseRows(rows, games) {
  const groups = new Map()
  for (const r of rows || []) {
    if (!r?.game_pk) continue
    const k = `${r.game_pk}|${r.player_id}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const out = []
  for (const g of groups.values()) {
    const box = games?.[String(g[0].game_pk)]
    const hr = box?.final ? box.hr?.[String(g[0].player_id)] : undefined
    if (!Number.isFinite(hr)) continue                                // not final / unreadable / not in his game's box score: never judged
    // earliest day first, then hr_n: when one homer sits under TWO days (a game that ran past the day's roll) the LATER day's copy is the extra one; else the highest hr_n
    const sorted = g.slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : Number(a.hr_n) - Number(b.hr_n)))
    out.push(...sorted.slice(hr).map((r) => ({ ...r, _box: hr })))
  }
  return out
}

/** { [game_pk]: { final, hr } } for these games from the league's own schedule status + box score. A game that cannot be read is left out. */
export async function gameBoxes(pks, { fetchImpl = fetch } = {}) {
  const out = {}
  await Promise.all([...new Set((pks || []).filter(Boolean).map(String))].map(async (pk) => {
    try {
      const sr = await fetchImpl(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${pk}&fields=dates,games,gamePk,status,abstractGameState`)
      if (!sr.ok) return
      const game = ((await sr.json())?.dates || []).flatMap((d) => d.games || []).find((g) => String(g.gamePk) === pk)
      if (game?.status?.abstractGameState !== 'Final') { out[pk] = { final: false, hr: {} }; return }
      const br = await fetchImpl(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`)
      if (!br.ok) return
      const box = await br.json()
      const hr = {}
      for (const side of ['home', 'away']) for (const [k, pl] of Object.entries(box?.teams?.[side]?.players || {})) {
        const b = pl?.stats?.batting
        if (b && b.atBats != null) hr[String(k).replace(/^ID/, '')] = Number(b.homeRuns) || 0
      }
      out[pk] = { final: true, hr }
    } catch { /* unread: not judged */ }
  }))
  return out
}

/** The voids on file for a day, as a Set of `${player_id}:${hr_n}`: the tick never re-inserts these. An unreadable table = none (never blocks the feed). */
export async function voidedKeys(db, day) {
  try {
    const { data, error } = await db.from('homer_feed_voids').select('player_id, hr_n').eq('day', day)
    if (error) return new Set()
    return new Set((data || []).map((r) => `${r.player_id}:${r.hr_n}`))
  } catch { return new Set() }
}

/**
 * Sweep one day's feed rows: copy then remove each false row. `boxes` = gameBoxes() output (the test seam; read here when omitted).
 * Returns { voided: [{ name, hr_n, box }], error? }. Not final / unreadable / no table = nothing voided.
 */
export async function voidFalseHomers(db, day, boxes = null, { fetchImpl = fetch } = {}) {
  const out = { voided: [] }
  try {
    if (!db) return out
    const { data: dayRows, error } = await db.from('homer_feed').select('*').eq('day', day)
    if (error) return { ...out, error: error.message }
    // every row of those games, any day: a homer filed under two days is one group, and the later day's copy is the extra
    const pks = [...new Set((dayRows || []).map((r) => r.game_pk).filter(Boolean))]
    const more = pks.length ? await db.from('homer_feed').select('*').in('game_pk', pks) : { data: [] }
    const rows = more.error ? dayRows : more.data
    const games = boxes || await gameBoxes(pks, { fetchImpl })
    for (const r of falseRows(rows, games)) {
      const { _box, ...row } = r
      const saved = await db.from('homer_feed_voids').upsert([{ day: row.day, player_id: String(row.player_id), hr_n: row.hr_n, game_pk: row.game_pk ?? null, name: row.name ?? null, box_hr: _box, row }], { onConflict: 'day,player_id,hr_n', ignoreDuplicates: true })
      if (saved.error) { out.error = saved.error.message; continue }       // no copy, no delete
      const del = await db.from('homer_feed').delete().match({ day: row.day, player_id: String(row.player_id), hr_n: row.hr_n })
      if (del.error) { out.error = del.error.message; continue }
      out.voided.push({ name: row.name, hr_n: row.hr_n, box: _box })
      console.error(`[homers] VOIDED ${row.day} ${row.name} hr #${row.hr_n}: his game's final box score has ${_box}`)
    }
  } catch (e) { out.error = String(e?.message || e) }
  return out
}

/** Keys (`${game_pk}|${player_id}|${hr_n}`) of homers already on file under ANOTHER day, for these games: the tick never files one homer twice. Unreadable = none. */
export async function filedElsewhere(db, day, pks) {
  try {
    if (!pks?.length) return new Set()
    const { data, error } = await db.from('homer_feed').select('game_pk, player_id, hr_n').in('game_pk', pks).neq('day', day)
    if (error) return new Set()
    return new Set((data || []).map((r) => `${r.game_pk}|${r.player_id}|${r.hr_n}`))
  } catch { return new Set() }
}
