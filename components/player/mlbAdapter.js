'use client'
// THE MLB ADAPTER for the shared player model (components/player/index.js has the interface). Everything
// MOONSHOT-specific the shared parts need is built here: the call-status word (lib/callStatus.js), the
// record / last-week lines (from /api/mlb/boton), and the stat strip with its honest ranks.
import { useEffect, useState } from 'react'
import { callStatus } from '../../lib/callStatus'
import { PICK_JOBS } from '../../lib/pickJob'
import { STATS } from '../../lib/statline'
import { rankInPool } from '../../lib/mlb/slateRank'

/** One fetch of "the bot on him": the role table's data, the record line and the week recap all read it. */
export function useMlbBot(pid) {
  const [d, setD] = useState(undefined)   // undefined = loading, null = unavailable
  useEffect(() => {
    if (!pid) { setD(null); return undefined }
    let live = true
    setD(undefined)
    fetch(`/api/mlb/boton?pid=${encodeURIComponent(pid)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setD(j) }).catch(() => { if (live) setD(null) })
    return () => { live = false }
  }, [pid])
  return d
}

/** MOONSHOT's word for him tonight: lib/callStatus.js, the same call the boards make. */
export const mlbStatus = (p) => callStatus({ role: p?.game_pick_role, board_rank: p?.board_rank, board_of: p?.board_of })

/** 'On the clean pregame record: 16 games, 9 called, 2 cleared.' -- null when the record has nothing on him. */
export function mlbRecordLine(bot) {
  const P = bot?.available ? bot.player : null
  if (!P) return null
  let called = 0; let did = 0
  for (const [role, R] of Object.entries(P.roles || {})) { if (PICK_JOBS[role]) { called += R.all.g; did += R.all.did } }
  const g = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  return `Record on him: ${g(P.games, 'game')}, ${called} called${called ? `, ${did} cleared` : ''}.`
}

/** 'Last week: 5 of 5 cleared' -- null when he had no call that week (nothing to recap). */
export function mlbLastLine(bot) {
  const w = bot?.available ? bot.week : null
  if (!w || !w.calls) return null
  return `Last week: ${w.cleared} of ${w.calls} cleared`
}

// The key per-game numbers, in a fixed order. Each is dropped when he has no value (no dashes), and gets a
// rank only through rankInPool (top / bottom 10% of 30+ bats we hold).
const STRIP = [
  { id: 'avg', label: 'AVG', get: (p, ls) => num(p?.season_avg ?? ls?.avg), fmt: (v) => v.toFixed(3).replace(/^0/, ''), better: 'high', title: 'Batting average this season.' },
  { id: 'ops', label: 'OPS', get: (p, ls) => num(p?.season_ops ?? ls?.ops), fmt: (v) => v.toFixed(3).replace(/^0/, ''), better: 'high', title: 'On-base plus slugging this season.' },
  { id: 'hr', label: 'HR', get: (p, ls) => num(p?.season_hr ?? ls?.hr), fmt: (v) => String(v), better: 'high', title: 'Home runs this season.' },
  { id: 'l10', label: 'L10 HR', get: (p) => num(p?.last10_hr), fmt: (v) => String(v), better: 'high', noRank: true, title: 'Home runs in his last 10 games.' },
  { id: 'barrel', label: 'Barrel', get: (p) => STATS.barrel.get(p), fmt: STATS.barrel.fmt, better: 'high', title: STATS.barrel.title },
]
const num = (v) => { const x = Number(v); return v !== null && v !== '' && Number.isFinite(x) ? x : null }

export function mlbStatRow(p, slate, liveSeason = null) {
  const pool = Array.isArray(slate) ? slate : []
  return STRIP.map((s) => {
    const v = s.get(p, liveSeason)
    if (v == null) return null
    const rank = s.noRank ? null : rankInPool(pool.map((r) => s.get(r)), v, { better: s.better })
    return { id: s.id, label: s.label, text: s.fmt(v), title: s.title, rank }
  }).filter(Boolean)
}
