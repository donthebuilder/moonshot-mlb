'use client'
// THE SITUATION STAMPS OF ONE CARD (lib/cards/situations.js), fetched once per player and game day (/api/card/stamps, kept ten minutes on the CDN) and remembered for the
// session. Only a card that is asked (RankCard's `stampFor`) fetches; a list of fifty ranked rows asks nothing. Failure = no stamps.
import { useEffect, useState } from 'react'

const memo = new Map()
const inflight = new Map()

/** The game's own date from its start time: MLB / NHL / NFL start between noon and about 1:40am ET, so the venue date is the ET date four hours earlier. '' when unknown. */
export function gameDayOf(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return ''
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t - 4 * 3600e3)) } catch { return '' }
}

export default function useStamps(stampFor) {
  const sport = stampFor?.sport, id = stampFor?.id, day = stampFor?.day
  const key = sport && id && day ? `${sport}:${id}:${day}` : ''
  const [stamps, setStamps] = useState(() => (key && memo.get(key)) || [])
  useEffect(() => {
    if (!key) { setStamps([]); return undefined }
    if (memo.has(key)) { setStamps(memo.get(key)); return undefined }
    let on = true
    if (!inflight.has(key)) {
      inflight.set(key, fetch(`/api/card/stamps?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}&day=${encodeURIComponent(day)}&phase=pre`)
        .then((r) => (r.ok ? r.json() : { stamps: [] })).then((j) => (Array.isArray(j.stamps) ? j.stamps : [])).catch(() => []).then((s) => { memo.set(key, s); inflight.delete(key); return s }))
    }
    inflight.get(key).then((s) => { if (on) setStamps(s) })
    return () => { on = false }
  }, [key, sport, id, day])
  return stamps
}
