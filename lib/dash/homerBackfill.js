// BACKFILL /called — the nights before the feed existed.
//
// 2026-09-05. Donovan: "make sure the called populates the nights before so it
// just doesn't look blank." homer_feed only has rows from the minute the cron
// started, so the ten-night bars on /called were empty history. The bot has
// been grading every night for months and publish_data.sh keeps the last 150
// graded_results_<date>.json files, so the record exists — it was just never
// in the table.
//
// WHAT A BACKFILLED ROW IS, HONESTLY. The archive's hr_capture_report lists
// every homer on the slate; graded_slots lists the bot's designated rows for
// that night with game_pick_role. So role / on_board / hr_score come from the
// same board the site showed that night — the archive was written from it.
// What the archive does NOT carry: the board RANK (only the designated slots
// are in the file, not the full ~280-row board), the inning, and the price.
// Those stay NULL rather than guessed. /called prints rank and price only when
// present, and the ten-night bars need only role and on_board.
//
// NEVER POSTED. x_post_id is 'backfill' and discord_sent is true on every row
// this writes, so the cron's "still unposted" query can never pick one up and
// tweet a homer from last Tuesday. (The cron also filters to today; two guards
// beat one.)
//
// NEVER OVERWRITES. ON CONFLICT DO NOTHING on (day, player_id, hr_n): a night
// the cron recorded live is left exactly alone — a live row always beats an
// archive row. Each night is claimed once in dash_push_seen
// (homerfeed:backfill:<day>) so the tick stops fetching two-megabyte archives
// the moment the window is full.

import { dataUrl } from '../dataSource'

export const BACKFILL_DAYS = 14

const txt = (v) => (v == null ? '' : String(v).trim())
/** Same rule as homerFeed.js primaryRole — the first of "TOP/CONTACT". */
const primaryRole = (row) => txt(row?.game_pick_role || row?.pick_type).split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)[0] || null

export const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const backfillKey = (day) => `homerfeed:backfill:${day}`

/** One night's rows from its graded archive. Pure. */
export function backfillRowsFrom(day, j) {
  const entries = j?.hr_capture_report?.all_homer_entries || []
  const status = j?.game_status_by_pk || {}
  // The designated rows for the night, best hr_score per player. A man on two
  // slots (TOP and HRR) keeps the higher-scored slot's role.
  const slots = new Map()
  for (const r of j?.graded_slots || []) {
    const id = txt(r?.player_id)
    if (!id) continue
    const prev = slots.get(id)
    if (!prev || Number(r.hr_score || 0) > Number(prev.hr_score || 0)) slots.set(id, r)
  }
  const caught = new Set((j?.hr_capture_report?.caught_homer_entries || []).map((e) => txt(e.player_id)))
  const out = []
  for (const e of entries) {
    const id = txt(e?.player_id)
    const hr = Number(e?.hr) || 0
    if (!id || hr < 1) continue
    const slot = slots.get(id)
    const g = status[txt(e.game_pk)] || {}
    const team = txt(e.team) || null
    const home = Boolean(team && g.home === team)
    const opponent = team ? (home ? g.away : g.home) || null : null
    const score = Number(slot?.hr_score ?? e?.hr_score)
    for (let n = 1; n <= hr; n += 1) {
      out.push({
        day, player_id: id, hr_n: n,
        name: txt(e.name) || `#${id}`,
        team, opponent,
        game_pk: e.game_pk != null ? String(e.game_pk) : null,
        inning: null,
        home,
        role: slot ? primaryRole(slot) : null,
        on_board: Boolean(slot) || caught.has(id),
        hr_score: Number.isFinite(score) ? score : null,
        board_rank: null,
        odds_over: null, odds_book: null,
        stats: null, hooks: [],
        x_post_id: 'backfill', discord_sent: true,
        seen_at: `${day}T23:59:00-04:00`,
      })
    }
  }
  return out
}

/**
 * Fill AT MOST ONE missing night in the window ending yesterday, oldest
 * first, and claim it. Returns what it did, for the tick's JSON. Never throws.
 *
 * Why one night per call: the cron runs every minute and an archive is about
 * two megabytes; fourteen ticks fill the window with no tick doing more than
 * one fetch. Tonight belongs to the live feed, never to this.
 */
export async function backfillOneNight(db, today, days = BACKFILL_DAYS) {
  try {
    const nights = Array.from({ length: days }, (_, i) => shiftDay(today, -(i + 1)))
    const { data: seen } = await db.from('dash_push_seen').select('event_key').in('event_key', nights.map(backfillKey))
    const done = new Set((seen || []).map((r) => r.event_key))
    const day = nights.reverse().find((d) => !done.has(backfillKey(d)))
    if (!day) return null
    const { data: claim } = await db
      .from('dash_push_seen')
      .upsert([{ event_key: backfillKey(day) }], { onConflict: 'event_key', ignoreDuplicates: true })
      .select('event_key')
    if (!claim?.length) return { day, skipped: 'claimed-elsewhere' }
    const res = await fetch(dataUrl(`current/graded_results_${day}.json`), { cache: 'no-store' })
    if (!res.ok) return { day, skipped: `archive-${res.status}` }
    const rows = backfillRowsFrom(day, await res.json())
    if (!rows.length) return { day, rows: 0 }
    const { data, error } = await db.from('homer_feed').upsert(rows, { onConflict: 'day,player_id,hr_n', ignoreDuplicates: true }).select('player_id')
    if (error) return { day, error: error.message }
    return { day, homers: rows.length, called: rows.filter((r) => r.role).length, added: data?.length || 0 }
  } catch (err) {
    console.error(`[homers] backfill failed: ${String(err?.message || err)}`)
    return null
  }
}
