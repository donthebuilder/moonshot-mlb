'use client'
import { useEffect, useMemo, useState } from 'react'
import DenseTable from '../DenseTable'
import { usePreview, ShowMoreButton } from '../ListPreview'
import HelpTip from '../HelpTip'
import { C as MLB_C, NUM_FONT } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { easternDate } from '../../lib/data'
import { savedNights, WATCH_NIGHTS_EVENT } from '../../lib/watchNights'
import { gradeSaved, priceIndex, SPORT_WATCH } from '../../lib/watchGrade'

// ⭐ YOUR NIGHTS, GRADED (2026-09-29) -- one component for every sport.
//
// Donovan: "if you have them saved that night and they play, track what they
// did for you. are they coin respecters or not. are they profitable for you."
//
// Replaces MOONSHOT's WatchTracker, which could only record a night while the
// Watchlist tab was open after the games and before the slate rolled over, and
// only for hitters in the bot's graded file (see lib/watchNights.js for the
// full trace). This reads every night a player was on your list and grades it
// off his own game log, so it is complete the first time it opens.
//
// TABLES LEAD: one sentence, then a table -- your list's total first, then
// each name -- with MOONSHOT's DenseTable. Counts are k/n, never a bare rate;
// units are 1 unit per bar at that night's price and only on priced nights,
// with the priced count beside them.
//
// Props: sport ('mlb' | ...), pricesPath (optional odds_history-shaped JSON),
// theme (the sport's C), accent (its primary; MOONSHOT's by default), onRecord(byPid) for the per-name column on the list,
// onOpen(row) to open a player.

const fmtU = (u) => `${u >= 0 ? '+' : '−'}${Math.abs(u).toFixed(1)}u`

export default function WatchRecord({ sport = 'mlb', pricesPath = null, theme = MLB_C, accent = null, onRecord = null, onOpen = null }) {
  const C = theme
  const S = SPORT_WATCH[sport]
  const [nights, setNights] = useState([])
  const [hist, setHist] = useState(null)
  const [rec, setRec] = useState(null)

  useEffect(() => {
    const sync = () => setNights(savedNights(sport))
    sync()
    window.addEventListener(WATCH_NIGHTS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(WATCH_NIGHTS_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [sport])

  useEffect(() => {
    if (!pricesPath) return undefined
    let alive = true
    fetch(pricesPath).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHist(j) }).catch(() => {})
    return () => { alive = false }
  }, [pricesPath])

  const prices = useMemo(() => (hist ? priceIndex(hist) : null), [hist])
  const nightsKey = nights.map((n) => `${n.date}:${n.saves.map((s) => s.id).join(',')}`).join('|')
  useEffect(() => {
    if (!S || !nights.length) { setRec(null); return undefined }
    let alive = true
    gradeSaved(sport, nights, { prices, today: easternDate(Date.now()) }).then((r) => {
      if (!alive) return
      setRec(r)
      // The list's per-name column reads the same shape the old ledger gave it.
      onRecord?.(Object.fromEntries((r?.players || []).map((p) => [String(p.id), {
        nights: p.saved, starts: p.starts, void: p.void,
        hr: p.bars.hr?.k ?? 0, hit: p.bars.hit?.k ?? 0,
      }])))
    })
    return () => { alive = false }
    // nightsKey stands in for nights (a new array on every storage event).
  }, [sport, nightsKey, prices]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!rec) return []
    const toRow = (p, isList) => {
      const r = { _key: isList ? 'list' : p.id, id: p.id, name: isList ? 'Your list' : p.name, team: p.team || '', saved: p.saved, starts: p.starts, void: p.void, _list: isList }
      S.bars.forEach((b) => {
        const { k, n } = p.bars[b.key]
        r[b.key] = n ? `${k}/${n}` : '—'
        r[`${b.key}_pct`] = n ? (100 * k) / n : null
        const u = p.units[b.key]
        r[`${b.key}_u`] = u.n ? `${fmtU(u.u)} · ${u.n}` : '—'
      })
      return r
    }
    return [toRow(rec.list, true), ...rec.players.filter((p) => p.saved).map((p) => toRow(p, false))]
  }, [rec, S])
  const preview = usePreview(rows, 11)

  if (!S) return null
  if (!nights.length) {
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '9px 13px', marginBottom: 12, fontSize: 11.5, color: C.text3 }}>
        <b style={{ color: C.text2 }}>⭐ Your nights, graded</b> — counts from the first night a saved {S.noun} plays.<HelpTip label="Your nights" color={C.text3} text="Every name you star is remembered for that night, and graded from his own game log once it's over." />
      </div>
    )
  }
  if (!rec) return <div style={{ fontSize: 11, color: C.text3, marginBottom: 12 }}>⭐ Grading your saved nights…</div>

  const L = rec.list
  // Only the bars somebody on the list is graded on (a list of receivers has
  // no kicking column), and units only where the sport has archived prices.
  const bars = S.bars.filter((b) => L.bars[b.key].n > 0)
  const pricedSport = S.bars.some((b) => b.price)
  const priced = bars.map((b) => ({ b, u: L.units[b.key] })).filter((x) => x.u.n > 0)
  const columns = [
    { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
    { key: 'saved', label: 'Saved', w: 46, heat: false, title: 'Nights he was on your list and his game is over' },
    { key: 'starts', label: 'Played', w: 48, heat: false, title: 'Of those nights, the ones he actually played' },
    ...bars.map((b) => ({ key: b.key, label: b.label, w: 70, heat: false, mono: true, title: `Games he ${b.word}, of games graded on it` })),
    ...bars.filter((b) => b.price).map((b) => ({ key: `${b.key}_u`, label: `${b.label} u`, w: 84, heat: false, mono: true, dim: true, title: `1 unit on ${b.label} each priced night, settled: units won or lost · nights priced` })),
  ]

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${alpha(C.amber, 0.03)})`,
      border: `1px solid ${alpha(C.amber, 0.25)}`, borderRadius: 12,
      padding: '9px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>⭐ Your nights, graded</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rec.nights} night{rec.nights === 1 ? '' : 's'}{rec.first ? ` · ${rec.first} → ${rec.last}` : ''}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.65, marginBottom: 8 }}>
        Your saved {S.noun}s played <b style={{ fontFamily: NUM_FONT, color: C.text }}>{L.starts}</b> of{' '}
        <b style={{ fontFamily: NUM_FONT, color: C.text }}>{L.saved}</b> saved nights
        {L.starts > 0 && <>: {bars.map((b, i) => (
          <span key={b.key}>{i ? ' · ' : ''}{b.label} <b style={{ fontFamily: NUM_FONT, color: C.text }}>{L.bars[b.key].k}/{L.bars[b.key].n}</b></span>
        ))}</>}.
        {priced.length > 0
          ? <> At the pregame price, 1 unit a bar on the nights one was archived: {priced.map(({ b, u }, i) => (
              <span key={b.key}>{i ? ' · ' : ''}{b.label} <b style={{ fontFamily: NUM_FONT, color: u.u >= 0 ? C.green : C.red }}>{fmtU(u.u)}</b> <span style={{ color: C.text3 }}>over {u.n}</span></span>
            ))}.</>
          : pricedSport
            ? <> No archived prices cover these nights yet, so there are no units to show.</>
            : <> Units need an archive of past prices, which this sport doesn&apos;t have yet — so this is the did-he-deliver half only.</>}
      </div>
      <DenseTable rows={preview.shown} columns={columns} heatMode="none" maxHeight={9999} maxRows={400} accent={accent}
        caption={`Your list first, then each ${S.noun}. Tap a name for his card.`}
        onRowClick={onOpen ? (r) => { if (!r._list) onOpen(r) } : null}
        dimRow={(r) => !r._list && r.starts < 3} />
      <ShowMoreButton open={preview.open} restN={preview.restN} toggle={preview.toggle} itemWord="names" />
      <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.55, marginTop: 6 }}>
        A night counts when he was on your list for that game and the game is over — saved and didn&apos;t play is
        <b style={{ color: C.text2 }}> void, not a miss</b>. Results are his own line from the game log.
        {pricedSport && <> Units are flat 1-unit bets at the price we archived before the start; nights with no archived price sit out
        and the number after each total is how many were priced.</>} Dimmed: under 3 games played. Your saved nights
        follow your account when you&apos;re signed in.
      </div>
    </div>
  )
}
