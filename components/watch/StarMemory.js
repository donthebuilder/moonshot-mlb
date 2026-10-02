'use client'
// ⭐ YOUR EYE FOR HIM (2026-10-01). Donovan picked "one star + memory": the ☆
// is the only control, a star clears with its night, nothing comes back on
// its own -- and his card remembers. "This will help with see which player
// respects your coin and you have eye for calling."
//
// One line on the player's card, from the nights you starred him
// (lib/watchNights.js, kept however the star got there) graded off his own
// game log (lib/watchGrade.js gradeSaved -- the same grade the Watchlist's
// record uses): how many nights, the last one, how often he came through on
// the headline bar, and units at that night's pregame price when one exists.
// Never a made-up price; a night without one sits out of the units.
// Nothing saved -> nothing drawn.
import { useEffect, useMemo, useState } from 'react'
import { savedNights, WATCH_NIGHTS_EVENT } from '../../lib/watchNights'
import { gradeSaved, priceIndex, SPORT_WATCH } from '../../lib/watchGrade'
import { easternDate } from '../../lib/data'
import { useSportTheme } from '../SportTheme'

const daysAgo = (date, today) => {
  const a = Date.parse(`${date}T12:00:00Z`), b = Date.parse(`${today}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86400000)
}

export default function StarMemory({ sport = 'mlb', id, pricesPath = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [nights, setNights] = useState([])
  const [hist, setHist] = useState(null)
  const [grade, setGrade] = useState(null)
  const key = String(id || '')
  const today = easternDate(Date.now())

  useEffect(() => {
    const sync = () => setNights(savedNights(sport)
      .map((n) => ({ ...n, saves: n.saves.filter((s) => String(s.id) === key) }))
      .filter((n) => n.saves.length))
    sync()
    window.addEventListener(WATCH_NIGHTS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(WATCH_NIGHTS_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [sport, key])

  useEffect(() => {
    if (!pricesPath || !nights.length) return undefined
    let alive = true
    fetch(pricesPath).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHist(j) }).catch(() => {})
    return () => { alive = false }
  }, [pricesPath, nights.length])
  const prices = useMemo(() => (hist ? priceIndex(hist) : null), [hist])

  const past = nights.filter((n) => n.date < today)
  const pastKey = past.map((n) => n.date).join(',')
  useEffect(() => {
    if (!past.length || !SPORT_WATCH[sport]) { setGrade(null); return undefined }
    let alive = true
    gradeSaved(sport, past, { prices, today }).then((r) => { if (alive) setGrade(r?.players?.[0] || null) }).catch(() => {})
    return () => { alive = false }
  }, [sport, pastKey, prices]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!key || !nights.length) return null
  const last = nights[nights.length - 1].date
  const ago = daysAgo(last, today)
  const when = ago == null ? last : ago <= 0 ? 'tonight' : ago === 1 ? 'yesterday' : `${ago} days ago`
  const bar = SPORT_WATCH[sport]?.bars?.[0]
  const b = grade && bar ? grade.bars[bar.key] : null
  const u = grade && bar ? grade.units[bar.key] : null
  return (
    <div title="From the nights you starred him, graded off his own game log; units at that night's pregame price where one exists."
      style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text2, lineHeight: 1.5 }}>
      <span style={{ color: accent }}>★</span> You starred him <b style={{ color: C.text }}>{nights.length}</b> night{nights.length === 1 ? '' : 's'} · last {when}
      {b && b.n > 0 && <> · <b style={{ color: C.text }}>{bar.label} {b.k}/{b.n}</b></>}
      {u && u.n > 0 && <> · <b style={{ color: u.u >= 0 ? C.green : C.red }}>{u.u >= 0 ? '+' : ''}{u.u.toFixed(1)}u</b> <span style={{ color: C.text3 }}>({u.n} priced)</span></>}
      {grade && grade.void > 0 && <span style={{ color: C.text3 }}> · {grade.void} didn&apos;t play</span>}
    </div>
  )
}
